---
description: 把阅读站「🔗 链接清单」里的「表面形式 → 词」映射写进对应词笔记的 forms_extra，让这些已在 KB 的词形在阅读站永久可点
argument-hint: "[可选: 粘贴 /link-forms 块，或留空后粘贴]"
allowed-tools: Read, Edit, Glob, Bash
---

# /link-forms — 给已有词笔记补登「表面形式」别名

阅读站（Läsning）的 **🔍 查词模式** 让用户点正文里**没被链接、但其实 KB 里已有**的词，
在内存里搜索 KB、确认对应的 lemma，然后把「这个表面形式 → 这个词」加进 **🔗 链接清单**。
本命令把那份清单**永久写进**对应词笔记的 `forms_extra:` frontmatter —— 于是
`tools/build-reading-site.js` 下次重建时会把这些形式并进 surface 索引，**所有文章里**
这个形式就都自动变成可点的生词链接。

> **为什么会漏链接：** 阅读站链接靠 `build-reading-site.js` 的 `extractForms()`，它只从每篇词
> 笔记的「## 语法变形 (Forms)」表抽变形，会漏掉**没列进表的变形**（很多名词的定指/复数如
> `arbetet`/`arbeten`、动词不规则形）、多词形式等。`forms_extra:` 就是给这些漏网形式补登的
> **机器维护字段**，由本命令追加，不用手改 Forms 表。

## 输入

用户从阅读站「🔗 链接清单 → 📋 复制命令」复制来一段，形如：

```
/link-forms
arbete: arbetet, arbeten
springa: sprang
```

- 每行 `<slug>` = `knowledge_base/words/<slug>.md` 的文件名（不含 `.md`）。
- 冒号后是要补登的一个或多个**表面形式**（单个词、无空格）。
- 不带参数直接 `/link-forms` 时，请用户把清单粘进来。

## 步骤

1. 解析每一行成 `{ slug, forms: [...] }`；忽略首行 `/link-forms` 与空行。
2. 对每个 slug：
   - `Read` `knowledge_base/words/<slug>.md`。**不存在就跳过并记一笔**（不要新建词笔记 —— 那是 `/learn` 的活；KB 里确实没有的词由用户自己处理）。
   - 收集该词**已有的形式**：`lemma`、「## 语法变形 (Forms)」表里的所有形式、以及现有 `forms_extra:` 列表。
   - 对每个待登形式 `f`（**小写比较**去重）：若它已等于 lemma、已在 Forms 表、或已在 `forms_extra` 里，就**跳过**。
   - 把真正新增的形式并进 frontmatter 的 `forms_extra:`，写成内联列表风格（与 `synonyms: [...]` / `family: [...]` 一致），例如 `forms_extra: [arbetet, arbeten]`。若原本没有该字段，就在 frontmatter 里新增一行（放 `family:` 附近即可）。
   - 用 `Edit` 写回，**只动 frontmatter，不要改正文**。
3. 重建阅读站数据：`node tools/build-reading-site.js`；再 `node tools/build-kb-site.js`（刷新 `knowledge_base/_index/slugs.json`）。
4. **不要自动 commit/push**（与逐条查词一致，见 CLAUDE.md §4.3）。简报里提醒用户：攒完跑 `/sync` 同步到 GitHub —— push 后 GitHub Action 会重建 `site/reading/reading-data.js`，下次打开阅读站这些形式就**永久可点**。

## 回报模板（精简）

```
🔗 已补登 forms_extra：
- arbete ← arbetet, arbeten
- springa ← sprang
（跳过：löpa.md 不存在；gå 的 går 已在 Forms 表）
🔁 已重建 reading-data.js + slugs.json
下一步：/sync 推送 → Action 重建后阅读站全局生效。
```
