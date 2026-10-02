---
description: 逐段精读 —— 给一篇文章（imported/ 里的 slug，或刚拍照/粘贴的新文章）做分段逐句拆解 + 补齐生词 + 复核
argument-hint: [文章 slug / 文件名 / 关键词；留空 = 本会话刚入库的那篇]
---

对 **$ARGUMENTS** 做逐段精读。按 `.claude/skills/sv-study-guide/SKILL.md` 全流程执行，不要跳步：

1. **定位文章**
   - 参数是 slug / 文件名 / 标题关键词 → 在 `imported/`（以及 `inbox/`）里找到那一篇；有多个候选就列出来让 Ruibo 选。
   - 留空 → 用本会话刚入库的那篇。
   - 附了照片、或粘贴的是还没入库的新文章 → 先按 CLAUDE.md §4 拍照流程入库（转写确认 → KB → `imported/` 文章 + 导出块；有 QR 码时走 `sv-textbook-qr`），再继续。
2. `node tools/check-coverage.js <slug> --gaps <scratchpad>/gaps-<slug>.tsv` —— 记下覆盖率和缺词。
3. **并行**：librarian 补词（技能 §4-A）＋ 写手写精读（§4-B）。
4. 处理断链（先重定向到已有笔记，再补建缺的笔记）→ 复核者改错（§4-C）。
5. 更新导出块和 source 笔记 → `node tools/build-kb-site.js` → 再跑 `check-coverage.js`，要求**断链 0、实词覆盖 ≥ 90%**。
6. 用 Playwright 在 390px 宽度实测 → commit + push（拍照来源按 §4.3 自动 `/sync`）。
7. 用表格回复：段数/句数 · 覆盖率前→后 · 复核修正 · 新建词数。
