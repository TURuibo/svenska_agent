---
description: 把本机 KB 改动（words/phrases/…、review、profile、站点数据）一次性 commit 并 push 到 GitHub，供其他设备拉取
argument-hint: "[可选: commit 备注]"
allowed-tools: Bash, Read, Glob
---

把这台设备上累积的 knowledge_base 改动**一个 commit** 推到 GitHub，让其他设备（电脑/手机，同一个 repo）`git pull` 即可拿到。手机端查词/拍照直接写 KB（路 B）后，用本命令同步。

## 流程（纯 Bash，Linux/remote 通用）

1. **重建 slugs.json（best-effort）**：
   - `node tools/build-kb-site.js`（更新 `knowledge_base/_index/slugs.json`，dedup 用）
   - 生成的 viewer 数据文件（`site/kb-index.js`、`site/kb-bodies.js`、`site/reading/reading-data.js`、`site/listening/listening-data.js`）已 **gitignore**，**不需要在这里提交** —— GitHub Action 会在 push 后生成并发布到 gh-pages。
   - 若失败不要中断。

2. **只暂存真实内容路径**（存在才加；绝不加 `inbox/`、`traces/`、`settings.local.json`，也别加 gitignore 的 viewer 数据文件）：
   `git add -- knowledge_base review/schedule.md profile imported listening .gitattributes`
   （`knowledge_base/_index/slugs.json` 在 `knowledge_base/` 内会一并暂存。）

3. **若无暂存改动 → 直接结束**并告诉用户"已是最新，无需同步"：
   `git diff --cached --quiet && echo NOTHING || echo STAGED`

4. **提交**（备注用 $ARGUMENTS，没有则用 `KB sync <今天日期>`，日期用绝对格式）：
   `git commit -m "KB sync 2026-06-15"`

5. **先 rebase 拉远端再 push**（防 fetch-first 拒绝）：
   `git pull --rebase --autostash origin main`
   然后 `git push origin main`
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
