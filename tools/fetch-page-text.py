#!/usr/bin/env python3
"""Print a web page's body text verbatim (headings, paragraphs, list items) as markdown.

Used by /lattlast: WebFetch passes pages through a summarising model, so its output is
not a reliable verbatim copy. This fetches the raw HTML with curl and only strips tags.

    python3 tools/fetch-page-text.py <url>
"""
import html
import re
import subprocess
import sys

url = sys.argv[1]
raw = subprocess.run(['curl', '-sSL', '--max-time', '30', url], capture_output=True, check=True).stdout
s = raw.decode('utf-8', errors='replace')
m = re.search(r'<main\b.*?</main>', s, re.S | re.I) or re.search(r'<article\b.*?</article>', s, re.S | re.I)
s = m.group(0) if m else s
s = re.sub(r'<(script|style|nav|header|footer|form|button)\b.*?</\1>', '', s, flags=re.S | re.I)
s = re.sub(r'<br\s*/?>', ' ', s, flags=re.I)
out = []
for tag, body in re.findall(r'<(h[1-6]|p|li)\b[^>]*>(.*?)</\1>', s, re.S | re.I):
    text = html.unescape(re.sub(r'<[^>]+>', '', body))
    text = re.sub(r'\s+', ' ', text).strip()
    if not text:
        continue
    tag = tag.lower()
    if tag[0] == 'h':
        out.append('\n' + '#' * int(tag[1]) + ' ' + text + '\n')
    elif tag == 'li':
        out.append('- ' + text)
    else:
        out.append('\n' + text + '\n')
print(re.sub(r'\n{3,}', '\n\n', '\n'.join(out)).strip())
