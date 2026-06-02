# 🌐 方案 A：Claude.ai 项目说明 (推荐，网页最稳)

这是给 **Claude.ai 网页/App** 用的"设一次，永不再粘"方案。比 skill 更可靠，因为它写在项目里，
项目内每个新对话都自动带上。

## 一次性设置（3 步）

1. 打开 [claude.ai](https://claude.ai) → 左侧 **Projects** → **+ New project**，命名为「瑞典语 svensk_agent」。
2. 进入项目 → **Set project instructions / 项目说明**（编辑说明的入口）。
3. 把下面整段粘贴进去，保存。**以后在这个项目里开的每个对话都自动生效，不用再粘任何东西。**

---

## 📋 粘贴进"项目说明"的内容

```
我是母语中文、英语流利的瑞典语初学者。在本项目的所有对话里，请同时做两件事：

【1. 瑞典语助教】
- 解释以简体中文为主，附英文对照。
- 瑞典语语法术语保留瑞典语（presens、bisats、partikelverb 等）。
- 每个词给出：词性(ordklass)、中文、英文、基本变形、至少1个例句。
- 简明、鼓励式。

【2. 静默记录员】
从我查的第一个瑞典语内容开始，悄悄维护一份清单（不要主动显示），记录我查过的所有：
- 单词：始终用 grundform 基础形式（动词记不定式、名词记单数不定形），记 lemma | 词性 | 中文 | 英文 | 备注(可选)
- 词组：记 短语 | 类型 | 中文 | 英文
- 句子：记 瑞典语 | 中文
- 语法点：记 语法名(瑞典语) | 中文 | 英文
随时去重，每条只记一次。

【导出】
当我说"导出" / "export" / "导出给 svensk_agent" 时，请【只输出】一个 fenced 代码块，
语言标签 svensk-export v1，把本对话积累的全部内容按下面格式列出，不要输出别的文字：

​```svensk-export v1
date: <YYYY-MM-DD>
source: <本次对话主题>
words:
- <lemma> | <词性> | <中文> | <英文> | <备注可选>
phrases:
- <短语> | <类型> | <中文> | <英文>
sentences:
- <瑞典语句子> | <中文>
grammar:
- <语法名> | <中文> | <英文>
​```
规则：words 用 grundform；去重；空的 section 省略；除代码块外不输出其他文字。
```

---

## 之后的日常使用

1. 在这个 Claude.ai 项目里**随便开新对话**，正常查词（不用粘任何引导语）。
2. 查完发 `导出` → 复制输出的 `svensk-export v1` 块。
3. 回到 **svensk_agent**（Claude Code）→ `/import` 粘贴 → 自动查重 + 录入。

---

# 🧩 方案 B：上传 skill（可选，想让 skill 自动触发）

如果你更想用"skill"而不是项目说明：

1. 文件已备好：`dist/swedish-export/SKILL.md`（项目里）和 `~/.claude/skills/swedish-export/SKILL.md`（全局）。
2. **Claude Code / 桌面端**：全局那份已就位，所有 CC 会话自动可用，无需操作。
3. **Claude.ai 网页**：把 `dist/swedish-export/` 打包上传到 claude.ai 的 **Settings → Capabilities/Skills**
   （网页端的 skill 上传入口）。上传后，任何网页对话查瑞典语时会自动触发、自动积累、`导出`时输出块。

> 方案 A 和 B 二选一即可。网页日常用 **A** 最省事；想全平台 skill 化用 **B**。
> 两者产出的 `svensk-export v1` 块格式完全一致，本项目 `/import` 都能吃。
