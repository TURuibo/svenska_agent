---
description: 【云端版】生成 adjsubst 四式变形页 → 入库 → 重建站点 → commit+push，一次会话一条龙（Linux/云 routine 用，无 PowerShell）
argument-hint: "[YYYY-MM-DD] [theme 0-9]  —— 二者可选，云 routine 留空＝今天自动算"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent(sv-librarian)
---

**云端一条龙 (cloud one-shot)**：这是 `/adjsubst` 的「云 routine 专用」版本。Claude Code on the web
的容器是 **Linux + 临时**（每次全新 clone、跑完回收、`inbox/` 被 gitignore），所以不能依赖 `scripts/*.ps1`，
也不能把产物留在 `inbox/` 等下次 `/import`。本命令在**同一次会话内**走完：
**生成 → 入库 → 重建站点 → commit + push**。

> ✅ 本命令不需要联网；纯生成 + 本地入库 + git。

参数 `$ARGUMENTS`：可含日期 `YYYY-MM-DD` 和主题号 `0-9`（顺序不限）。云 routine 留空时按
今天的 `day-of-year(DATE) mod 10` 自算（`date +%j`）。

---

## 1. 生成 inbox 文件（复用既有生成逻辑）

**完全按 `.claude/commands/adjsubst.md` 的 §1–§5 执行**：定日期与主题、查去重台账
`inbox/_used-vocab-adjsubst.md`、按该文件 §3 的语法自检清单生成 25 组四式变形、写出
`inbox/adjsubst-<DATE>-<slug>.md`（人读复习表 + 仅 `words` 的 `svensk-export v1` 块）、更新台账。

> ⚠️ 台账 `inbox/_used-vocab-adjsubst.md` 也在 `inbox/`（被 gitignore），所以它**不随 git 同步**。
> 在临时云容器里它每次都是仓库里的最后一版快照；这对「按主题去重 + 难度递进」够用，但跨多设备的
> 台账状态不会合并。若希望台账长期累积，后续可把它移出 `inbox/` 改成 tracked 文件（本命令暂不改动结构）。

写完确认文件存在（`Glob inbox/adjsubst-<DATE>-*.md`）。

## 2. 入库（inline import，不调 /import 子流程）

用 **`sv-import` 技能**录入该文件的 `words` 导入块：每个种子词跑完整 `swedish-dictionary` 生成完整词条，
对照 `profile/level.md` 查重；50 词 > 3，先建 `sources/source-<DATE>-<slug>.md` 再 spawn `sv-librarian`；
完成后按 §6 更新 `review/schedule.md`。

## 3. 归档 + 重建站点（Linux，node）

```bash
mkdir -p imported
git mv inbox/adjsubst-<DATE>-<slug>.md imported/adjsubst-<DATE>-<slug>.md 2>/dev/null \
  || mv inbox/adjsubst-<DATE>-<slug>.md imported/adjsubst-<DATE>-<slug>.md
node tools/build-kb-site.js
node tools/build-reading-site.js
```

先归档到 tracked 的 `imported/`，再重建两站数据。**不跑** `build-kb-site.ps1`（Windows 专用）。

## 4. 提交并推送 (commit + push)

```bash
git add -- knowledge_base imported review/schedule.md profile \
  site/kb-data.js site/reading/reading-data.js .gitattributes 2>/dev/null
git diff --cached --quiet || git commit -m "Daily adjsubst <DATE> <slug> — auto-import"
git push 2>/dev/null || git push -u origin "$(git branch --show-current)"
```

**绝不** `git add inbox/`。push 失败可按 2s/4s/8s/16s 退避重试最多 4 次；仍失败不回滚导入，下次带上。

## 5. 收尾报告 (Report)

```
✅ 云端 adjsubst 已入库并推送: imported/adjsubst-<DATE>-<slug>.md · 主题 <主题> · 50 词 · 已 push <branch>
```

若某步失败，说明失败在哪一步、产物在哪、是否已 push。
