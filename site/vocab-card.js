/* Dagbok 📊 词汇进度 card — reads window.VOCAB_PROGRESS (site/vocab-progress.js,
 * built by tools/vocab-progress.js against profile/vocab-gaps.json) and shows how
 * the KB's vocabulary coverage has moved since the 2026-10-02 analysis, plus the
 * themes with the most 🎯 P1 gap words still to learn. Hidden when the data file
 * is missing (e.g. a local checkout that never ran the build). */
(function () {
  'use strict';
  const p = window.VOCAB_PROGRESS;
  const el = document.getElementById('dgProgress');
  if (!p || !el) return;
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const bar = (label, now, base, title) => {
    const gain = Math.round((now - base) * 10) / 10;
    return (
      `<div class="vpRow" title="${esc(title)}">` +
        `<span class="vpLabel">${esc(label)}</span>` +
        `<span class="vpTrack"><span class="vpFill" style="width:${Math.min(100, now)}%"></span>` +
          `<span class="vpBase" style="left:${Math.min(100, base)}%"></span></span>` +
        `<span class="vpNum">${now}%${gain > 0 ? ` <em>+${gain}</em>` : ''}</span>` +
      `</div>`
    );
  };
  const rows = ['A1', 'A2', 'B1'].filter((L) => p.svalex[L])
    .map((L) => bar(`教材核心 ${L}`, p.svalex[L].now.kbBasic, p.svalex[L].baseline.kbBasic,
      `SVALex 核心词 ${L}：KB 有笔记 + 基础词（灰线 = ${p.analysisDate} 基线）`)).join('');

  const p1 = p.priorities.find((x) => x.p === 1) || { done: 0, total: 0 };
  const p2 = p.priorities.find((x) => x.p === 2) || { done: 0, total: 0 };
  const themes = p.themes.filter((t) => t.p1.total - t.p1.done > 0)
    .sort((a, b) => (b.p1.total - b.p1.done) - (a.p1.total - a.p1.done)).slice(0, 5)
    .map((t) => `<span class="vpTheme">${esc(t.icon)} ${esc(t.zh)} <b>${t.p1.total - t.p1.done}</b></span>`).join('');
  const top = p.top4000;

  el.innerHTML =
    `<div class="vpHead"><h2>📊 词汇进度</h2><span class="vpSub">对照 ${esc(p.analysisDate)} 词汇分析 · 灰线 = 当时的基线</span></div>` +
    `<div class="vpGrid">` +
      `<div class="vpBars">${rows}` +
        `<p class="vpLine">最常用 4 000 词有笔记 <b>${top.now}</b>${top.now > top.baseline ? ` <em>+${top.now - top.baseline}</em>` : ''}` +
        ` · 🎯 P1 缺口 <b>${p1.done}/${p1.total}</b> · P2 <b>${p2.done}/${p2.total}</b></p>` +
      `</div>` +
      `<div class="vpThemes"><p class="vpThemesHead">P1 还缺最多的主题</p>${themes || '<span class="vpTheme">🎉 P1 全部补完</span>'}</div>` +
    `</div>` +
    `<p class="vpLinks"><a href="reading/#focus=1">🎯 读补弱项文章</a><a href="ova/#deck=focus">🔁 去复习</a>` +
    `<a href="https://github.com/TURuibo/svenska_agent/blob/main/profile/vocab-gaps.md" target="_blank" rel="noopener">📋 缺口清单</a></p>`;
  el.hidden = false;
})();
