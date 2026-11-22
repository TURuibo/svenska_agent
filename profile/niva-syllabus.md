# 🪜 Nivå 语法课纲 (Grammar syllabus)

> 2026-11-22 · 给 🪜 Nivå（`site/niva/`）的 📗 语法分区排顺序用（`site/niva/SPEC.md` §4.4）。由 `tools/level-lib.js` 的 `loadSyllabus()` 读取：
> `build-niva-data.js`（Nivå 的顺序和「核心」）和 `build-kb-site.js`（语法笔记的级别 → Sök 级别筛选、Flöde 按级别出卡）都用它。
>
> - 每级下面按**教学顺序**列出这一级的**核心**语法点（一行一个，以笔记 slug 开头）。它们在 Nivå 里排在最前、算「核心」，
>   通关要求核心全部学过。
> - 没列在这里的语法点照旧排在后面（按被多少笔记 / 文章引用，多的在前），分「常用」「细节」两组。
> - **写在哪一级就归哪一级**，会覆盖笔记自己标的级别（行末括号里的「改级别」写了原因）。不想改就把它挪回原来那一级。
> - 改完不用做别的：下次网站重建（GitHub Action）就生效。本地预览：`node tools/build-niva-data.js`。
>
> 参照：`.claude/skills/sv-assess/levels.md`（SFI A ≈ A1 · B ≈ A2 · C ≈ A2+/B1− · D ≈ B1）和 SFI 教材的常见顺序。

## A1 · 入门（≈ SFI A）

1. grammar-uttal-och-stavning — 发音与拼写：长短元音 ↔ 双写辅音、sj / tj 音、软硬 k / g（2026-11-22 加）
2. grammar-personliga-pronomen — 人称代词 jag / mig, du / dig, han / honom …（2026-11-22 加）
3. grammar-en-ord-ett-ord — en / ett 两类名词：先认清每个名词是哪一类
4. grammar-obestämd-form — 不定形：en bil · ett hus
5. grammar-bestämd-form — 定形：bilen · huset
6. grammar-singular-plural — 单数和复数
7. grammar-presens — 现在时：-r 结尾
8. grammar-infinitiv — 不定式（词典形式）
9. grammar-v2-ordfoljd — V2 语序：动词永远在第二位
10. grammar-satsadverbial — inte / aldrig / alltid 放哪儿（改级别：笔记标 A2；「Jag talar inte svenska」是 A1 第一周就用的）
11. grammar-ja-nej-fraga — 是非问句：动词放句首
12. grammar-korta-svar — 简短回答：Ja, det gör jag. / Nej, det har jag inte.（2026-11-22 加）
13. grammar-frageord — 疑问词 vad / vem / var / när / hur（改级别：笔记标 A1–A2，按 A1 教）
14. grammar-det-finns — det finns：「有」（改级别：笔记标 A1–A2，按 A1 教）
15. grammar-possessiva-pronomen — 物主代词 min / din / hans …
16. grammar-demonstrativa-pronomen — den här / den där + 定形：den här bilen（2026-11-22 加）
17. grammar-modalt-hjalpverb-infinitiv — kan / vill / måste + 不定式（改级别：笔记标 A1–A2，按 A1 教）
18. grammar-ska-infinitiv — ska + 不定式：打算、将来
19. grammar-imperativ — 祈使句
20. grammar-prepositioner-rum — 空间介词 i / på / under …（改级别：笔记标 A1–A2，按 A1 教）
21. grammar-rakneord — 数词：0–1000、序数词、价格、年份（2026-11-22 加）
22. grammar-klockan-tidsuttryck — 几点钟：halv, kvart i, kvart över
23. grammar-datum-och-tid — 日期和时间（改级别：笔记标 A1–A2，按 A1 教）
24. grammar-genitiv-s — -s 属格：Annas bil
25. grammar-sammansatt-ord — 复合词：最后一个词决定 en / ett

## A2 · 基础（≈ SFI B；末尾几条 ≈ SFI C）

1. grammar-preteritum — 过去时（改级别：笔记标 A1；完整的过去时一般在 SFI B 才系统教）
2. grammar-preteritum-oregelbundna — 不规则动词的过去时
3. grammar-perfekt — 现在完成时 har + supinum
4. grammar-supinum — supinum 形式
5. grammar-substantiv-plural — 名词复数的五种变法
6. grammar-adjektiv-bojning — 形容词三种形式：stor · stort · stora
7. grammar-adjektiv-kongruens — 形容词跟名词一致
8. grammar-dubbel-bestamdhet — den stora bilen：双重限定
9. grammar-komparativ — 比较级
10. grammar-superlativ — 最高级
11. grammar-inversion-efter-fundament — 非主语开头时主谓倒装（V2 的延伸）
12. grammar-kommer-att-infinitiv — kommer att：预计会发生
13. grammar-reflexivt-verb — 反身动词 tvätta sig
14. grammar-reflexivt-pronomen — 反身代词 mig / dig / sig
15. grammar-sin-sina — sin / sitt / sina 和 hans / hennes 的区别
16. grammar-partikelverb — 小品词动词 stiga upp, tycka om（改级别：笔记标 A2–B1，常用的在 A2 就要会）
17. grammar-bisats — 从句是什么
18. grammar-bisats-ordfoljd — 从句语序：inte 在动词前（BIFF）
19. grammar-att-sats — att 从句：Jag tror att …
20. grammar-nar-bisats — när 从句
21. grammar-bisats-eftersom — eftersom 从句：因为
22. grammar-bisats-om — om 从句：如果 / 是否
23. grammar-relativ-bisats-med-som — som 关系从句：boken som jag läser
24. grammar-indirekt-fraga — 间接疑问句：Jag vet inte var han bor
25. grammar-for-att-infinitiv — för att + 不定式：为了
26. grammar-man-generellt — man：泛指的「人们」
27. grammar-opersonligt-det — 形式主语 det：Det regnar
28. grammar-ligga-sta-sitta — ligga / stå / sitta：东西放在哪儿
29. grammar-tidsprepositioner — 时间介词 i / på / om / för … sedan
30. grammar-konditionalis — skulle vilja：礼貌的请求（≈ SFI C）

## B1 · 进阶（≈ SFI D）

1. grammar-pluskvamperfekt — 过去完成时 hade + supinum
2. grammar-bisats-biff — 从句语序复习（BIFF）
3. grammar-bli-passiv — bli 被动
4. grammar-passiv-konstruktion — 被动句怎么用
5. grammar-s-passiv-i-perfekt — 完成时的 s 被动
6. grammar-deponensverb — 形式像被动、意思是主动的动词：hoppas, minnas
7. grammar-participial-adjektiv — 分词当形容词
8. grammar-skulle-infinitiv — skulle：假设和过去的将来
9. grammar-om-sats-villkor — om 条件从句
10. grammar-trots-att — trots att：尽管
11. grammar-även-om — även om：即使
12. grammar-innan-tidsbisats — innan 从句：在……之前
13. grammar-sa-att-konsekvens — så att：以至于
14. grammar-klyvning — det är … som …：强调句
15. grammar-den-som-relativ — den som：……的人
16. grammar-infinitiv-subjekt — Att + 不定式作主语
17. grammar-genom-att-infinitiv — genom att：通过（做）……
18. grammar-perfekt-infinitiv — 完成式不定式：skulle ha gjort
19. grammar-inte-bara-utan-aven — inte bara … utan även
20. grammar-parvisa-konjunktioner — 成对连词：både … och, antingen … eller
21. grammar-ju-desto-konstruktion — ju … desto：越……越……
22. grammar-jag-anser-vs-tycker — 表达观点：anser / tycker / menar
23. grammar-visserligen-men — visserligen … men：诚然……但是
24. grammar-debattstruktur — 论述文的结构（SFI D 写作）

## B2 · 中高级

1. grammar-kunde-ha-supinum — kunde ha + supinum：本来可以
2. grammar-önskar-att-preteritum-irrealis — 与事实相反的愿望
3. grammar-rädas-deponens — rädas 等书面 deponens 动词
4. grammar-sägs-vara — sägs vara：据说
5. grammar-insandare-styckelogik — 读者来信（insändare）的段落逻辑
