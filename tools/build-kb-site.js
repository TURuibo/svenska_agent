#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const kbRoot = path.join(repoRoot, 'knowledge_base');
const siteRoot = path.join(repoRoot, 'site');
const dataPath = path.join(siteRoot, 'kb-data.js');

if (!fs.existsSync(kbRoot)) {
  throw new Error(`knowledge_base folder was not found at ${kbRoot}`);
}

fs.mkdirSync(siteRoot, { recursive: true });

function readUtf8File(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  const listMatch = trimmed.match(/^\[(.*)\]$/);
  if (listMatch) {
    const inside = listMatch[1].trim();
    if (inside === '') return [];
    return inside
      .split(',')
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter((item) => item !== '');
  }
  return trimmed.replace(/^['"]|['"]$/g, '');
}

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const frontmatter = {};
  if (!match) {
    return { frontmatter, body: text.trim() };
  }

  const lines = match[1].split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*#/.test(line) || /^\s*$/.test(line)) { i++; continue; }
    // Top-level key (no leading whitespace) — anything indented is a list item below.
    const lineMatch = line.match(/^([^\s:][^:]*):\s*(.*)$/);
    if (!lineMatch) { i++; continue; }
    const key = lineMatch[1].trim();
    const rest = lineMatch[2];

    // Empty value? May be a multi-line YAML list:
    //   words:
    //     - egentligen
    //     - restaurang
    if (rest === '') {
      const items = [];
      let j = i + 1;
      while (j < lines.length) {
        const listMatch = lines[j].match(/^\s+-\s+(.*)$/);
        if (!listMatch) break;
        items.push(listMatch[1].trim().replace(/^['"]|['"]$/g, ''));
        j += 1;
      }
      if (items.length > 0) {
        frontmatter[key] = items;
        i = j;
        continue;
      }
      frontmatter[key] = '';
      i += 1;
      continue;
    }
    frontmatter[key] = parseScalar(rest);
    i += 1;
  }

  return { frontmatter, body: match[2].trim() };
}

function getTitle(frontmatter, body, slug) {
  for (const key of ['lemma', 'name', 'title']) {
    if (Object.prototype.hasOwnProperty.call(frontmatter, key) && `${frontmatter[key]}` !== '') {
      return `${frontmatter[key]}`;
    }
  }

  const heading = body.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim();
  return slug;
}

function getExcerpt(body) {
  let text = body.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, '$1');
  text = text.replace(/[`*_>#|-]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > 220 ? text.slice(0, 220) : text;
}

function getWikilinks(text) {
  const links = new Set();
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    links.add(match[1].trim());
  }
  return Array.from(links).sort((a, b) => a.localeCompare(b));
}

function walkMarkdownFiles(dir) {
  const output = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '_templates') continue;
      output.push(...walkMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      output.push(fullPath);
    }
  }
  return output.sort((a, b) => a.localeCompare(b));
}

function relativePath(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function singularType(parentType) {
  return parentType.endsWith('s') ? parentType.slice(0, -1) : parentType;
}

const notes = walkMarkdownFiles(kbRoot).map((filePath) => {
  const text = readUtf8File(filePath);
  const { frontmatter, body } = parseFrontmatter(text);
  const slug = path.basename(filePath, '.md');
  const parentType = path.basename(path.dirname(filePath));
  const type = frontmatter.type && `${frontmatter.type}` !== '' ? `${frontmatter.type}` : singularType(parentType);
  const title = getTitle(frontmatter, body, slug);
  const note = {
    slug,
    type,
    title,
    path: relativePath(filePath),
    body,
    excerpt: getExcerpt(body),
    links: getWikilinks(text),
    searchText: `${title} ${slug} ${relativePath(filePath)} ${text}`,
  };

  const carryKeys = [
    'lemma', 'name', 'ordklass', 'cefr', 'zh', 'en', 'created', 'known',
    // recap-site extras
    'date', 'date_added', 'source_label', 'kind',
    'words', 'phrases', 'sentences', 'grammar', 'topics',
  ];
  for (const key of carryKeys) {
    if (Object.prototype.hasOwnProperty.call(frontmatter, key)) {
      note[key] = frontmatter[key];
    }
  }

  return note;
});

const generatedAt = process.env.KB_SITE_GENERATED_AT || new Date().toISOString().replace('T', ' ').slice(0, 19);
const data = { generatedAt, notes };
const javascript = `window.KB_DATA = ${JSON.stringify(data, null, 2)};\n`;
fs.writeFileSync(dataPath, javascript, 'utf8');
console.log(`Generated ${dataPath} with ${notes.length} notes.`);
