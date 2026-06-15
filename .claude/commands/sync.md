---
description: 把本机 KB 改动（words/phrases/…、review、profile、站点数据）一次性 commit 并 push 到 GitHub，供其他设备拉取
argument-hint: "[可选: commit 备注]"
allowed-tools: Bash, Read, Glob
---

把这台设备上累积的 knowledge_base 改动**一个 commit** 推到 GitHub，让其他设备（电脑/手机，同一个 repo）`git pull` 即可拿到。手机端查词/拍照直接写 KB（路 B）后，用本命令同步。

## 流程（全部用 Bash → powershell 执行）

1. **重建站点数据（best-effort）**：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-kb-site.ps1`（KB 浏览器；有纯 PS 回退，无 node 也能跑）
   - `node tools/build-reading-site.js`（Läsning 阅读数据；需要 node，没有就跳过——GitHub Action 会在 push 后重建）
   - 若失败不要中断——`site/kb-data.js` 由 GitHub Action 在 push 后兜底重建。

2. **只暂存真实内容路径**（存在才加；绝不加 `inbox/`、`traces/`、`settings.local.json`）：
   `powershell -NoProfile -Command "git add -- knowledge_base review/schedule.md profile imported site/kb-data.js site/reading/reading-data.js .gitattributes"`

3. **若无暂存改动 → 直接结束**并告诉用户"已是最新，无需同步"：
   `powershell -NoProfile -Command "git diff --cached --quiet; if ($LASTEXITCODE -eq 0) { 'NOTHING' } else { 'STAGED' }"`

4. **提交**（备注用 $ARGUMENTS，没有则用 `KB sync <今天日期>`，日期用绝对格式）：
   `powershell -NoProfile -Command "git commit -m 'KB sync 2026-06-15'"`

5. **先 rebase 拉远端再 push**（防 fetch-first 拒绝）：
   `powershell -NoProfile -Command "git pull --rebase --autostash origin main"`
   然后 `powershell -NoProfile -Command "git push origin main"`
   - 若 rebase 出现冲突，停下，把冲突文件报给用户，不要强推。

## 回执

```
🔄 已同步到 GitHub — <n> 个文件
  commit: <message>
  其他设备 git pull 即可拿到最新 KB；站点由 GitHub Action 自动重建。
```

## 注意

- 本命令是**唯一**的对外推送动作；查词/录入本身不 push（避免一词一 commit），攒到一次 `/sync` 一个干净 commit。
- 当前分支若不是 `main`，先告诉用户当前分支，确认后再 push 到对应远端分支。
