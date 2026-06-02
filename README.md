# 🇸🇪 svensk_agent

A Claude Code and Codex project for **learning Swedish** — and for **learning agentic coding tools**. It turns every
Swedish word / phrase / sentence / grammar question / photo you throw at it into a concise chat answer
**and** a richly cross-linked entry in a local, Obsidian-style markdown knowledge base. No database.

Built for a native-Chinese, English-speaking learner (explanations in 中文 + English).

---

## ✨ 三大功能 (Three workflows)

| 你做什么 | 命令 | 发生什么 |
|----------|------|----------|
| 查 + 录入 | `/learn <词/词组/句子/图片>` 或直接发消息 | 用瑞典语技能分析 → 查重 → 全文存入 `knowledge_base/` 并建链接 → 对话里给精简总结 |
| 复习巩固 | `/review [数量/类型/主题]` | 从知识库按 SM-2 间隔挑到期项，逐题测验、评分、更新进度 |
| 评估水平 | `/assess [full\|quick]` | 扫描知识库估算 CEFR/SFI，写入 `profile/level.md`；已会的词以后查询自动跳过 |
| 知识库体检 | `/kb` | 统计数量、找断链/孤立笔记、刷新索引 |
| 跨聊天导入 | `/import [块\|文件名]` | 解析 `svensk-export v1` 块 → 查重 → 录入 KB + 建链 → 给收据 |

**核心承诺**：一个问题 → 直接给答案并自动录入（已存在则只给答案不重复录入），尽量零额外操作。
对话框只放**精简总结**，全面细节都在本地 markdown 里。

---

## 🗂️ 知识库设计 (Obsidian-style, no DB)

```
knowledge_base/
├── index.md           # MOC 总入口
├── words/             # 单词（变形、搭配、同义/反义/词族、例句）
├── phrases/           # 词组 / 习语 / partikelverb
├── sentences/         # 句子（结构、生词、语法标注）
├── grammar/           # 语法点
├── topics/            # 语义场 & 同义词组（家具、工作、情绪…）
├── sources/           # 被分析过的文章 / 图片原文
└── _templates/        # 新笔记模板
```

笔记之间用 `[[wikilinks]]` 双向互联：句子↔单词、句子↔语法、句子↔词组、单词↔同义/反义/词族、
单词/词组↔主题。同语境的词（都是家具 / 都是同义词）通过共享 `topics/` 笔记聚到一起。

> 已附带一个**示例簇**演示所有链接类型：[[arbeta]] ↔ [[jobba]]（同义），
> [[sent-jag-arbetar-pa-ett-sjukhus]]（句子→词/语法），[[grammar-v2-ordfoljd]]，[[topic-arbete]]。
> 看懂后可删除。

可选：用 [Obsidian](https://obsidian.md) 直接打开 `knowledge_base/` 文件夹，就能看到关系图谱。

---

## 🧩 Claude Code + Codex compatibility

This project is set up to open directly in either tool:

| Tool | Entry point | Project config |
|------|-------------|----------------|
| Claude Code | `CLAUDE.md` | `.claude/` skills, agents, commands, hooks, settings |
| Codex | `AGENTS.md` | `.agents/skills/` skills, `.codex/` agents, hooks, config |

Keep both root instruction files aligned when changing the project behavior. Use
`CODEX_PROJECT.md` as the compatibility map.

## 🧩 用到的 Claude Code / Codex 功能

| 功能 | 在哪里 | 作用 |
|------|--------|------|
| **Claude instructions** | `CLAUDE.md` | Claude Code 项目大脑：黄金法则、流程、查重、风格 |
| **Codex instructions** | `AGENTS.md` | Codex 项目大脑：同一套规则，适配 Codex |
| **Claude skills** | `.claude/skills/` | Claude Code 的瑞典语技能 + 项目技能 |
| **Codex skills** | `.agents/skills/` | Codex 可发现的瑞典语技能 + 项目技能 |
| **Subagents** | `.claude/agents/` + `.codex/agents/` | `sv-librarian` 批量录入、`sv-reviewer` 复习、`sv-assessor` 评估 |
| **Slash commands** | `.claude/commands/` | `/learn` `/review` `/assess` `/kb` |
| **Hooks** | `.claude/settings.json` + `.claude/hooks/` | SessionStart 仪表盘、PostToolUse 变更日志/校验 |
| **Status line** | `.claude/hooks/statusline.ps1` | 状态栏实时显示词数 / 水平 |
| **Output style** | `.claude/output-styles/swedish-tutor.md` | 可选的"瑞典语家教"输出风格 |
| **settings.json** | `.claude/settings.json` | hooks、permissions、env 配置 |

所有 hook / 状态栏脚本用 **PowerShell**（本机无 Python）。

### 七个技能 (Skills)
- `swedish-dictionary` 词 · `swedish-phrases` 词组 · `swedish-grammar` 语法 ·
  `swedish-text-analysis` 整篇/图片
- `sv-knowledge-base` 存储与链接规则 · `sv-review` 复习 · `sv-assess` 评估

---

## 🚀 上手 (Getting started)

在本目录打开 Claude Code 或 Codex，然后：

```
你: hej
你: vad betyder "lagom"?            # → 查词 + 自动录入
你: Jag har inte sett filmen än.    # → 句子分析 + 录入（生词/语法自动建链）
你: [拖一张瑞典语图片进来]            # → 转写 + 整篇提取 + 批量录入
你: /review                          # → 开始复习
你: /assess                          # → 评估水平
你: /kb                              # → 知识库体检
```

把要批量处理的图片/文档放进 `inbox/`。处理过的原文会归档到 `knowledge_base/sources/`。

在其他聊天（Claude.ai 网页/手机）里查过的词？用 **跨聊天导入** 同步过来，零重复录入：
1. 把 `EXPORT_PROTOCOL.md` Part B 的 primer 粘贴到那个聊天的开头发送一次。
2. 聊完后发 `导出`，复制输出的 `` ```svensk-export v1 `` 块，回到这里运行 `/import` 粘贴进来。
   （或把块保存为 `inbox/<名字>.md`，直接 `/import` 扫描。）
详细格式规范见 [`EXPORT_PROTOCOL.md`](EXPORT_PROTOCOL.md)。

---

## 📁 目录速览

```
svensk_agent/
├── CLAUDE.md              # Claude Code 项目说明书
├── AGENTS.md              # Codex 项目说明书
├── CODEX_PROJECT.md       # Claude Code / Codex 兼容说明
├── README.md
├── .gitignore
├── .claude/              # Claude Code 配置：skills / agents / commands / hooks / settings / output-styles
├── .agents/              # Codex skills
├── .codex/               # Codex agents / hooks / config
├── knowledge_base/      # 本地知识库（markdown + wikilinks）
├── profile/level.md     # 水平档案（已掌握 = 查词跳过表）
├── review/schedule.md   # 复习计划（SM-2 lite）
└── inbox/               # 待处理的图片/文档
```
