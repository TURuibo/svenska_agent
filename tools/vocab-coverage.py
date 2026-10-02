#!/usr/bin/env python3
"""
vocab-coverage.py — 量化 KB 词汇覆盖率 (KB vocabulary coverage vs. Swedish reference lists)

对照三份公开资源，回答「库里的词到了哪个级别、基础词汇缺哪些」：
  • Kelly 表 (Språkbanken)  — 8 425 个高频词元，按 CEFR A1–C2 分级，带 SweWaC 词频 (WPM)
  • SVALex (Språkbanken)    — 15 681 个 SFI/SVA 教材里出现过的词，按首次出现的 CEFR 级别
  • SALDO morfologi         — 词形 → 词元映射，用来把文章里的变形 (arbetade) 还原成词元 (arbeta)

用法:
  python3 tools/vocab-coverage.py                     # 打印摘要
  python3 tools/vocab-coverage.py --json out.json     # 另存完整指标 + 缺口清单
  python3 tools/vocab-coverage.py --no-saldo          # 跳过 SALDO (快，但"读过"那一层不准)
参考资源首次运行时下载到 --cache (默认 ~/.cache/svenska_agent/vocab，SALDO ≈ 250 MB)，不进 git。
"""
import argparse, bz2, collections, glob, gzip, io, json, os, re, sys, tarfile, urllib.request
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URLS = {
    "kelly": "https://svn.spraakbanken.gu.se/sb-arkiv/pub/lmf/kelly/kelly.xml",
    "svalex": "https://spraakbanken.gu.se/resurser/data/svalex_tsv.tar.bz2",
    "saldom": "https://svn.spraakbanken.gu.se/sb-arkiv/pub/lmf/saldom/saldom.xml",
}
LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
CJK = re.compile(r"[　-鿿＀-￯]")
TOKEN = re.compile(r"[a-zåäöéüæø]+(?:-[a-zåäöéüæø]+)*")

# Kelly POS → coarse class; KB ordklass → coarse class
KELLY_POS = {
    "noun-en": "N", "noun-ett": "N", "noun": "N", "noun-en/-ett": "N", "proper name": "N",
    "verb": "V", "aux verb": "V", "adjective": "A", "particip": "A", "adverb": "ADV",
    "prep": "F", "pronoun": "F", "det": "F", "conj": "F", "subj": "F", "numeral": "F",
    "particle": "ADV", "interj": "F",
}
FUNCTION_KELLY = {"prep", "pronoun", "det", "conj", "subj", "numeral", "interj", "aux verb"}
SVALEX_CONTENT = {"NN_UTR": "N", "NN_NEU": "N", "NN": "N", "JJ": "A", "VB": "V", "AB": "ADV"}


def kb_class(ordklass):
    o = (ordklass or "").lower()
    out = set()
    if "substantiv" in o or "noun" in o: out.add("N")
    if re.search(r"(^|[^d])verb", o): out.add("V")  # "verb" but not "adverb"
    if "adjektiv" in o or "particip" in o or "komparativ" in o: out.add("A")
    if "adverb" in o or "satsadverbial" in o or "partikel" in o: out.add("ADV")
    if any(k in o for k in ("pronomen", "preposition", "konjunktion", "interjektion", "räkneord",
                            "ordningstal", "utrop", "frågeord", "förkortning")): out.add("F")
    return out or {"?"}


# ---------------------------------------------------------------- downloads
def fetch(name, cache):
    os.makedirs(cache, exist_ok=True)
    path = os.path.join(cache, os.path.basename(URLS[name]))
    if not os.path.exists(path):
        print(f"  ↓ {name}: {URLS[name]}", file=sys.stderr)
        tmp = path + ".part"
        with urllib.request.urlopen(URLS[name], timeout=600) as r, open(tmp, "wb") as f:
            while True:
                b = r.read(1 << 20)
                if not b: break
                f.write(b)
        os.replace(tmp, path)
    return path


def load_kelly(cache):
    rows = []
    for _, el in ET.iterparse(fetch("kelly", cache)):
        if el.tag != "LexicalEntry": continue
        fr = el.find("Lemma/FormRepresentation")
        d = {f.get("att"): f.get("val") for f in fr.findall("feat")}
        wpm = float(d.get("wpm", "0").replace(",", ".") or 0)
        src = d.get("source", "").lower()
        rows.append({
            "id": int(d["kellyID"]), "form": re.sub(r"\s*(…|\.\.\.)\s*|\s+", " ", d["writtenForm"]).strip(), "pos": d.get("kellyPartOfSpeech", "").strip(),
            "level": LEVELS[int(d["cefr"]) - 1], "source": src,
            # SweWaC WPM is a real corpus frequency; manual/T2 rows and the one 1e6 sentinel are not
            "wpm": wpm if (src == "swewac" and wpm < 1e5) else None,
        })
        el.clear()
    ranked = sorted((r for r in rows if r["wpm"] is not None), key=lambda r: -r["wpm"])
    for i, r in enumerate(ranked, 1): r["rank"] = i
    return rows


def load_svalex(cache):
    with tarfile.open(fetch("svalex", cache), "r:bz2") as tf:
        member = next(m for m in tf.getmembers() if m.name.endswith(".tsv"))
        text = tf.extractfile(member).read().decode("utf-8")
    lines = text.splitlines()
    hdr = lines[0].split("\t")
    books = collections.defaultdict(list)  # level → coursebook columns (per-level frequency)
    for i, h in enumerate(hdr):
        m = re.match(r"([ABC][12])_.+@([abc][12])$", h)
        if m and m.group(1).lower() == m.group(2): books[m.group(2).upper()].append(i)
    lf = {L: hdr.index(f"level_freq@{L.lower()}") for L in LEVELS[:5]}
    out = []
    for ln in lines[1:]:
        c = ln.split("\t")
        if len(c) < len(hdr) or not c[0].strip(): continue
        first = next((L for L in LEVELS[:5] if float(c[lf[L]] or 0) > 0), None)
        if not first: continue
        nbooks = sum(1 for i in books[first] if float(c[i] or 0) > 0)
        need = 2 if len(books[first]) <= 2 else 3
        out.append({"word": c[0].strip(), "tag": c[1].strip(), "level": first,
                    "freq": float(c[hdr.index("total_freq@total")] or 0),
                    "core": nbooks >= need, "books": nbooks})
    return out


def load_saldo(cache):
    """form → set(lemma), cached as gzipped TSV after the first (slow) XML parse."""
    tsv = os.path.join(cache, "saldom-forms.tsv.gz")
    if not os.path.exists(tsv):
        xml = fetch("saldom", cache)
        print("  ⚙ parsing SALDO morphology (one-off, ~1–2 min)…", file=sys.stderr)
        m = collections.defaultdict(set)
        lemma = None
        for ev, el in ET.iterparse(xml, events=("end",)):
            if el.tag == "FormRepresentation":
                d = {f.get("att"): f.get("val") for f in el.findall("feat")}
                lemma = d.get("writtenForm", "").lower()
            elif el.tag == "WordForm":
                for f in el.findall("feat"):
                    if f.get("att") == "writtenForm":
                        w = f.get("val").lower()
                        if " " not in w and lemma and " " not in lemma: m[w].add(lemma)
                el.clear()
            elif el.tag == "LexicalEntry":
                if lemma and " " not in lemma: m[lemma].add(lemma)
                el.clear(); lemma = None
        with gzip.open(tsv, "wt", encoding="utf-8") as f:
            for w, ls in m.items(): f.write(w + "\t" + "|".join(sorted(ls)) + "\n")
    m = {}
    with gzip.open(tsv, "rt", encoding="utf-8") as f:
        for ln in f:
            w, ls = ln.rstrip("\n").split("\t")
            m[w] = ls.split("|")
    return m


# ---------------------------------------------------------------- KB + content
def fm(text):
    m = re.match(r"---\n(.*?)\n---", text, re.S)
    out = {}
    if not m: return out
    for ln in m.group(1).splitlines():
        k = re.match(r"^([A-Za-z_]+):\s*(.*)$", ln)
        if k: out[k.group(1)] = k.group(2).strip().strip('"').strip("'")
    return out


def form_cells(body):
    """Surface forms from the note's '## 语法变形 (Forms)' table (second column)."""
    sec = re.search(r"^##[^\n]*(Forms|变形)[^\n]*\n(.*?)(?=^## |\Z)", body, re.S | re.M)
    forms = set()
    if not sec: return forms
    for ln in sec.group(2).splitlines():
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        if len(cells) < 2 or set(cells[1]) <= set("-: "): continue
        for c in cells[1:]:
            c = re.sub(r"\([^)]*\)", " ", c)
            c = re.sub(r"\*|`|!|\batt\b|\bhar\b|\ben\b|\bett\b|\bden\b|\bdet\b|\bde\b", " ", c.lower())
            for t in re.split(r"[/,;]| eller ", c):
                t = t.strip()
                if t and TOKEN.fullmatch(t): forms.add(t)
    return forms


def load_kb():
    words, phrases, sentences = [], [], []
    for f in sorted(glob.glob(os.path.join(ROOT, "knowledge_base/words/*.md"))):
        t = open(f, encoding="utf-8").read()
        d = fm(t)
        lem = (d.get("lemma") or os.path.basename(f)[:-3]).strip().lower()
        topics = re.findall(r"topic-[^,\]\s\"']+", d.get("topics", ""))
        words.append({"slug": os.path.basename(f)[:-3], "lemma": lem, "ordklass": d.get("ordklass", ""),
                      "cls": sorted(kb_class(d.get("ordklass", ""))), "cefr": (d.get("cefr") or "")[:2].upper(),
                      "known": d.get("known", "").lower() == "true", "topics": topics,
                      "forms": sorted(form_cells(t) | {lem})})
    for f in sorted(glob.glob(os.path.join(ROOT, "knowledge_base/phrases/*.md"))):
        d = fm(open(f, encoding="utf-8").read())
        p = (d.get("phrase") or os.path.basename(f)[:-3].replace("-", " ")).strip().lower()
        phrases.append(re.sub(r"\s+", " ", p))
    for f in sorted(glob.glob(os.path.join(ROOT, "knowledge_base/sentences/*.md"))):
        d = fm(open(f, encoding="utf-8").read())
        if d.get("sentence"): sentences.append(d["sentence"])
    return words, phrases, sentences


def content_texts(sentences):
    """Swedish running text the learner reads: imported/ articles, listening cues, KB sentences."""
    docs = []
    for f in sorted(glob.glob(os.path.join(ROOT, "imported/*.md"))):
        name = os.path.basename(f)
        text = open(f, encoding="utf-8").read()
        text = re.sub(r"\A---\n.*?\n---\n", "", text, flags=re.S)  # YAML frontmatter
        lines, fence = [], False
        for ln in text.splitlines():
            if ln.lstrip().startswith("```"): fence = not fence; continue
            if fence or CJK.search(ln) or ln.lstrip().startswith(("|", "#", "**", ">")): continue
            ln = re.sub(r"^\s*(?:[-*]\s*)?[A-ZÅÄÖ][\wåäö]{0,15}:\s", " ", ln)  # dialogue speaker labels "A: ", "Anna: "
            lines.append(ln)
        docs.append((name.split("-")[0], name, " ".join(lines)))
    for f in sorted(glob.glob(os.path.join(ROOT, "listening/*.json"))):
        try: d = json.load(open(f, encoding="utf-8"))
        except Exception: continue
        docs.append(("listening", os.path.basename(f), " ".join(c.get("sv", "") for c in d.get("cues", []))))
    docs.append(("kb-sentences", "knowledge_base/sentences", " ".join(sentences)))
    return docs


# ---------------------------------------------------------------- analysis
def norm_phrase(p):
    p = re.sub(r"\([^)]*\)", " ", p.lower())
    p = re.sub(r"…|\.\.\.|[.,!?;:\"'«»]", " ", p)
    return re.sub(r"\s+", " ", p).strip()


STRICT = {"noted"}
LENIENT = {"noted", "noted_other_pos", "form_of_noted", "mwe_partial"}
EXPOSED = LENIENT | {"exposed"}


def pct(a, b): return round(100 * a / b, 1) if b else 0.0


def tiers(items):
    c = collections.Counter(i["status"] for i in items)
    n = len(items)
    return {"n": n, "strict": pct(sum(c[s] for s in STRICT), n), "lenient": pct(sum(c[s] for s in LENIENT), n),
            "exposed": pct(sum(c[s] for s in EXPOSED), n), "status": dict(c)}


def analyse(cache, use_saldo=True):
    kelly, svalex = load_kelly(cache), load_svalex(cache)
    saldo = load_saldo(cache) if use_saldo else {}
    words, phrases, sentences = load_kb()

    by_lemma = collections.defaultdict(list)
    for w in words: by_lemma[w["lemma"]].append(w)
    form_to_lemma = collections.defaultdict(set)
    for w in words:
        for fo in w["forms"]:
            if fo != w["lemma"]: form_to_lemma[fo].add(w["lemma"])
    phrase_set = {norm_phrase(p) for p in phrases} | {norm_phrase(l) for l in by_lemma if " " in l}
    phrase_padded = [" " + p + " " for p in phrase_set]

    def kb_lemmas_for_token(tok):
        """KB lemmas a running-text token belongs to (direct, KB Forms tables, SALDO)."""
        hits = set()
        if tok in by_lemma: hits.add(tok)
        hits |= form_to_lemma.get(tok, set())
        for lem in saldo.get(tok, ()):
            if lem in by_lemma: hits.add(lem)
        return hits

    # exposure: every lemma seen in the content corpus (SALDO lemma candidates → upper bound)
    func_lemmas = {r["form"].lower() for r in kelly if r["pos"] in FUNCTION_KELLY and " " not in r["form"]}
    func_lemmas |= {"inte", "också", "bara", "så", "nu", "där", "här", "då", "sedan", "sen", "redan", "ju", "väl",
                    "mycket", "mer", "mest", "ut", "in", "upp", "ner", "hem", "bort", "fram", "igen", "kanske", "aldrig",
                    "alltid", "ofta", "även", "också", "vara", "ha", "bli", "kunna", "ska", "skola", "vilja", "måste", "få"}
    docs = content_texts(sentences)
    exposed = collections.Counter()
    # type → [tokens, KB-covered tokens, docs, content tokens, KB-covered content tokens]
    tok_stats = collections.defaultdict(lambda: [0, 0, 0, 0, 0])
    uncovered = collections.Counter()                       # frequent content lemmas with no KB note
    # tokens never seen in lower case anywhere in the content are treated as proper nouns
    case = collections.Counter()
    for _, _, text in docs:
        for t in re.findall(r"[A-Za-zÅÄÖåäöÉéÜü]+", text):
            if t[0].islower(): case[t.lower()] += 1
    proper = collections.Counter()
    for typ, name, text in docs:
        raw = re.findall(r"[A-Za-zÅÄÖåäöÉéÜüÆæØø]+(?:-[A-Za-zÅÄÖåäöÉéÜüÆæØø]+)*", text)
        toks = []
        for t in raw:
            tl = t.lower()
            if len(tl) == 1 and tl not in ("i", "å", "ö"): continue
            if t[0].isupper() and not case[tl]: proper[tl] += 1; continue
            toks.append(tl)
        if typ != "kb-sentences": tok_stats[typ][2] += 1
        for t in toks:
            lems = set(saldo.get(t, ())) or {t}
            for l in lems: exposed[l] += 1
            hit = bool(kb_lemmas_for_token(t))
            is_func = t in func_lemmas or bool(lems & func_lemmas)
            st = tok_stats[typ]
            st[0] += 1; st[1] += hit
            if not is_func:
                st[3] += 1; st[4] += hit
                if not hit: uncovered[min(lems)] += 1

    def status(form, want):
        f = norm_phrase(form) if " " in form else form.lower().rstrip(".")
        if " " in f:
            if f in phrase_set: return "noted"
            if any(" " + f + " " in p for p in phrase_padded): return "mwe_partial"
            return "missing"
        if f in by_lemma:
            classes = set().union(*(set(w["cls"]) for w in by_lemma[f]))
            return "noted" if (want in classes or "?" in classes or want == "?") else "noted_other_pos"
        if f in form_to_lemma: return "form_of_noted"
        if exposed.get(f): return "exposed"
        return "missing"

    for r in kelly:
        r["cls"] = KELLY_POS.get(r["pos"], "?")
        r["function"] = r["pos"] in FUNCTION_KELLY or " " in r["form"]
        r["status"] = status(r["form"], r["cls"])
    for e in svalex:
        e["word"] = e["word"].replace("_", " ")
        e["kind"] = "mwe" if "MWE" in e["tag"] else SVALEX_CONTENT.get(e["tag"], "F")
        e["status"] = status(e["word"], e["kind"] if e["kind"] in ("N", "V", "A", "ADV") else "?")

    # ---- Kelly per level / cumulative / per POS
    kelly_levels, kelly_cum, kelly_pos = {}, {}, {}
    for i, L in enumerate(LEVELS):
        rs = [r for r in kelly if r["level"] == L]
        kelly_levels[L] = {"all": tiers(rs), "content": tiers([r for r in rs if not r["function"]]),
                           "function": tiers([r for r in rs if r["function"]])}
        kelly_cum[L] = tiers([r for r in kelly if LEVELS.index(r["level"]) <= i and not r["function"]])
        kelly_pos[L] = {c: tiers([r for r in rs if r["cls"] == c and not r["function"]]) for c in ("N", "V", "A", "ADV")}

    def frontier(tier, th):
        ok = [L for L in LEVELS if kelly_cum[L][tier] >= th]
        # highest level such that every level up to it passes
        best = "<A1"
        for L in LEVELS:
            if kelly_cum[L][tier] >= th: best = L
            else: break
        return best
    frontiers = {t: {th: frontier(t, th) for th in (60, 70, 80, 90)} for t in ("strict", "lenient", "exposed")}

    # ---- frequency bands (SweWaC-ranked Kelly rows)
    ranked = sorted((r for r in kelly if r.get("rank")), key=lambda r: r["rank"])
    bands = []
    for b in range(0, len(ranked), 1000):
        rs = ranked[b:b + 1000]
        bands.append({"band": f"{b + 1}-{b + len(rs)}", "all": tiers(rs), "content": tiers([r for r in rs if not r["function"]])})

    # ---- running-text (token) coverage of general Swedish, from SweWaC WPM
    def tok_cov(pred): return round(sum(r["wpm"] for r in ranked if pred(r)) / 1e4, 1)
    token_cov = {
        "kelly_max": tok_cov(lambda r: True),
        "strict": tok_cov(lambda r: r["status"] in STRICT),
        "lenient": tok_cov(lambda r: r["status"] in LENIENT),
        "lenient_plus_function_words": tok_cov(lambda r: r["status"] in LENIENT or r["function"]),
        "exposed_plus_function_words": tok_cov(lambda r: r["status"] in EXPOSED or r["function"]),
    }

    # ---- SVALex (first-appearance level)
    svalex_levels = {}
    for L in LEVELS[:5]:
        es = [e for e in svalex if e["level"] == L and e["kind"] in ("N", "V", "A", "ADV")]
        svalex_levels[L] = {"content": tiers(es), "core": tiers([e for e in es if e["core"]]),
                            "mwe": tiers([e for e in svalex if e["level"] == L and e["kind"] == "mwe"]),
                            "pos": {c: tiers([e for e in es if e["kind"] == c and e["core"]]) for c in ("N", "V", "A", "ADV")}}
    svalex_cum = {L: tiers([e for e in svalex if LEVELS.index(e["level"]) <= i and e["core"] and e["kind"] in ("N", "V", "A", "ADV")])
                  for i, L in enumerate(LEVELS[:5])}

    # ---- KB CEFR label audit vs Kelly
    kelly_level_of = collections.defaultdict(set)
    for r in kelly: kelly_level_of[r["form"].lower()].add(r["level"])
    svalex_level_of = {}
    for e in svalex: svalex_level_of.setdefault(e["word"].lower(), e["level"])
    audit = collections.Counter(); disagree = []; not_in_refs = []
    for w in words:
        kl = kelly_level_of.get(w["lemma"])
        ref = min(kl, key=LEVELS.index) if kl else svalex_level_of.get(w["lemma"])
        if ref:
            audit[(w["cefr"] or "?", ref)] += 1
            if w["cefr"] in LEVELS and abs(LEVELS.index(w["cefr"]) - LEVELS.index(ref)) >= 3:
                disagree.append({"lemma": w["lemma"], "kb": w["cefr"], "ref": ref, "src": "kelly" if kl else "svalex"})
        elif " " not in w["lemma"]:
            not_in_refs.append({"lemma": w["lemma"], "cefr": w["cefr"], "ordklass": w["ordklass"]})

    topic_sizes = collections.Counter(t for w in words for t in w["topics"])
    kb_profile = {
        "words": len(words), "phrases": len(phrases), "sentences": len(sentences),
        "known_true": sum(w["known"] for w in words),
        "by_cefr": dict(sorted(collections.Counter(w["cefr"] or "?" for w in words).items())),
        "by_class": dict(collections.Counter("/".join(w["cls"]) for w in words).most_common()),
        "in_kelly": sum(1 for w in words if w["lemma"] in kelly_level_of),
        "in_svalex_not_kelly": sum(1 for w in words if w["lemma"] not in kelly_level_of and w["lemma"] in svalex_level_of),
        "in_neither": len(not_in_refs), "exposed_lemmas": len(exposed),
        "topics": len(topic_sizes), "no_topic": sum(1 for w in words if not w["topics"]),
    }
    reading = {typ: {"docs": v[2], "tokens": v[0], "kb_token_coverage_pct": pct(v[1], v[0]),
                     "content_tokens": v[3], "kb_content_token_coverage_pct": pct(v[4], v[3])}
               for typ, v in sorted(tok_stats.items())}
    tot = [sum(v[i] for v in tok_stats.values()) for i in range(5)]
    reading["ALL"] = {"docs": tot[2], "tokens": tot[0], "kb_token_coverage_pct": pct(tot[1], tot[0]),
                      "content_tokens": tot[3], "kb_content_token_coverage_pct": pct(tot[4], tot[3])}

    # Milton-style frequency-based size: how many of the 5 000 most frequent (SweWaC) lemmas are covered
    top5k = ranked[:5000]
    size_est = {"strict": sum(r["status"] in STRICT for r in top5k), "lenient": sum(r["status"] in LENIENT for r in top5k),
                "lenient_plus_function_words": sum(r["status"] in LENIENT or r["function"] for r in top5k),
                "exposed_plus_function_words": sum(r["status"] in EXPOSED or r["function"] for r in top5k)}

    def gap(r): return {"form": r["form"], "pos": r["pos"], "rank": r.get("rank"), "wpm": r["wpm"],
                        "status": r["status"], "function": r["function"]}
    return {
        "kb": kb_profile, "kelly_levels": kelly_levels, "kelly_cumulative_content": kelly_cum, "kelly_pos": kelly_pos,
        "frontiers": frontiers, "freq_bands": bands, "token_coverage_pct": token_cov, "top5000_size_estimate": size_est,
        "svalex_levels": svalex_levels, "svalex_cumulative_core": svalex_cum, "reading_coverage": reading,
        "cefr_audit": [{"kb": a, "ref": b, "n": n} for (a, b), n in sorted(audit.items())],
        "cefr_disagreements": disagree, "kb_not_in_refs": not_in_refs,
        "topic_sizes": dict(topic_sizes.most_common()),
        "kelly_gaps": {L: sorted((gap(r) for r in kelly if r["level"] == L and r["status"] not in LENIENT),
                                 key=lambda g: -(g["wpm"] or 0)) for L in LEVELS},
        "kelly_lenient_only": [dict(gap(r), level=r["level"], via=sorted(form_to_lemma.get(r["form"].lower(), ())))
                               for r in kelly if r["status"] in LENIENT - STRICT],
        "svalex_lenient_only": [{"word": e["word"], "tag": e["tag"], "level": e["level"], "core": e["core"], "status": e["status"],
                                 "via": sorted(form_to_lemma.get(e["word"].lower(), ()))}
                                for e in svalex if e["status"] in LENIENT - STRICT and e["level"] in ("A1", "A2", "B1", "B2")
                                and (e["core"] or e["kind"] == "mwe")],
        "svalex_core_gaps": {L: sorted(({"word": e["word"], "tag": e["tag"], "freq": e["freq"], "status": e["status"],
                                         "books": e["books"]} for e in svalex
                                        if e["level"] == L and e["core"] and e["status"] not in LENIENT),
                                       key=lambda e: -e["freq"]) for L in LEVELS[:5]},
        "uncovered_in_content": [{"lemma": l, "count": c} for l, c in uncovered.most_common(400)],
        "proper_nouns_in_content": [{"name": l, "count": c} for l, c in proper.most_common(150)],
        "kelly_items": [{"form": r["form"], "pos": r["pos"], "level": r["level"], "rank": r.get("rank"),
                         "status": r["status"], "function": r["function"]} for r in kelly],
        "svalex_items": [{"word": e["word"], "tag": e["tag"], "level": e["level"], "core": e["core"],
                          "kind": e["kind"], "status": e["status"]} for e in svalex],
        "saldo_used": bool(saldo),
    }


def summary(m):
    out = []
    k = m["kb"]
    out.append(f"KB: {k['words']} words · {k['phrases']} phrases · {k['sentences']} sentences · known:true={k['known_true']}")
    out.append(f"    in Kelly {k['in_kelly']} · SVALex-only {k['in_svalex_not_kelly']} · neither {k['in_neither']} · "
               f"topics {k['topics']} (words w/o topic {k['no_topic']})")
    out.append("Frontier = highest CEFR level whose cumulative Kelly content coverage ≥ threshold")
    for t, d in m["frontiers"].items():
        out.append(f"    {t:8s} " + " · ".join(f"≥{th}% {L}" for th, L in d.items()))
    out.append("Kelly per level (content words)   strict  lenient  +exposed | cumulative strict/lenient/exposed")
    for L, v in m["kelly_levels"].items():
        c, cu = v["content"], m["kelly_cumulative_content"][L]
        out.append(f"  {L}  n={c['n']:4d}   {c['strict']:5.1f}  {c['lenient']:6.1f}  {c['exposed']:7.1f}  |  "
                   f"{cu['strict']:5.1f} / {cu['lenient']:5.1f} / {cu['exposed']:5.1f}")
    out.append("SVALex core (content, ≥3 coursebooks)  strict  lenient  +exposed   | MWE strict/lenient")
    for L, v in m["svalex_levels"].items():
        c, w = v["core"], v["mwe"]
        out.append(f"  {L}  n={c['n']:4d}   {c['strict']:5.1f}  {c['lenient']:6.1f}  {c['exposed']:7.1f}   | {w['strict']:5.1f} / {w['lenient']:5.1f} (n={w['n']})")
    out.append("Frequency bands (SweWaC rank, content)  strict  lenient  +exposed")
    for b in m["freq_bands"]:
        c = b["content"]
        out.append(f"  {b['band']:>11}   {c['strict']:5.1f}  {c['lenient']:6.1f}  {c['exposed']:7.1f}")
    t = m["token_coverage_pct"]
    out.append(f"Running-text coverage of general Swedish (SweWaC tokens): strict {t['strict']}% · lenient {t['lenient']}% · "
               f"+function words {t['lenient_plus_function_words']}% · +exposed {t['exposed_plus_function_words']}% (Kelly ceiling {t['kelly_max']}%)")
    z = m["top5000_size_estimate"]
    out.append(f"Top-5000 frequency size estimate (Milton XLex-style): strict {z['strict']} · lenient {z['lenient']} · "
               f"+function words {z['lenient_plus_function_words']} · +exposed {z['exposed_plus_function_words']}")
    out.append("SVALex core cumulative (content)  strict  lenient  +exposed")
    for L, v in m["svalex_cumulative_core"].items():
        out.append(f"  ≤{L}  n={v['n']:4d}   {v['strict']:5.1f}  {v['lenient']:6.1f}  {v['exposed']:7.1f}")
    out.append("Your reading content: tokens hitting a KB note (= clickable in Läsning)   all%   content-words%")
    for typ, v in m["reading_coverage"].items():
        out.append(f"  {typ:13s} docs={v['docs']:3d} tokens={v['tokens']:6d}   {v['kb_token_coverage_pct']:5.1f}   {v['kb_content_token_coverage_pct']:5.1f}")
    return "\n".join(out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", default=os.path.expanduser("~/.cache/svenska_agent/vocab"))
    ap.add_argument("--json", help="write full metrics + gap lists to this path")
    ap.add_argument("--no-saldo", action="store_true", help="skip SALDO lemmatisation (faster, less accurate exposure)")
    a = ap.parse_args()
    metrics = analyse(a.cache, use_saldo=not a.no_saldo)
    print(summary(metrics))
    if a.json:
        with open(a.json, "w", encoding="utf-8") as f: json.dump(metrics, f, ensure_ascii=False, indent=1)
        print(f"→ {a.json}", file=sys.stderr)
