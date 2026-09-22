#!/usr/bin/env python3
"""Turn a sentence list into timed cues for a listening episode.

Publisher recordings (textbook QR audio) ship without a timed transcript, so cue
timings are ESTIMATED: speaking time is spread over the clip in proportion to each
sentence's character count, with a short pause after every sentence and a longer
one at paragraph breaks. Accurate to roughly ±1–2 s — good enough for click-to-seek
and sentence looping. Always keep `"timingsApproximate": true` on such an episode
so the player says so.

Input: a TSV with three columns — `P` (or empty) for "starts a new paragraph",
the Swedish sentence, the Chinese translation:

    P<TAB>Läxförhöret<TAB>功课抽查
    <TAB>Pappa, kan du förhöra mig på läxan?<TAB>爸爸，你能考考我功课吗？

Usage:
    python3 tools/make-cues.py cues.tsv --duration 392.58 > cues.json
"""
import argparse
import json

LEAD_IN = 1.2    # silence / announcement before the first line
GAP = 0.30       # pause after a sentence
PARA_GAP = 0.85  # extra pause at a paragraph break


def build(rows, duration, lead_in=LEAD_IN, gap=GAP, para_gap=PARA_GAP):
    pauses = sum(gap + (para_gap if para else 0) for para, _, _ in rows[1:])
    chars = sum(len(sv) for _, sv, _ in rows)
    if chars == 0:
        return []
    per_char = (duration - lead_in - pauses) / chars

    cues, t = [], lead_in
    for i, (para, sv, zh) in enumerate(rows):
        if i:
            t += gap + (para_gap if para else 0)
        dur = len(sv) * per_char
        cues.append({'start': round(t, 2), 'end': round(t + dur, 2), 'sv': sv, 'zh': zh})
        t += dur
    return cues


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('tsv', help='TSV file: paragraph-flag <TAB> Swedish <TAB> Chinese')
    ap.add_argument('--duration', type=float, required=True, help='clip length in seconds')
    args = ap.parse_args()

    rows = []
    with open(args.tsv, encoding='utf-8') as fh:
        for line in fh:
            line = line.rstrip('\n')
            if not line.strip():
                continue
            para, sv, zh = line.split('\t')
            rows.append((para.strip().upper() == 'P', sv.strip(), zh.strip()))

    print(json.dumps(build(rows, args.duration), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
