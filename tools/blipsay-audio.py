#!/usr/bin/env python3
"""Fetch the audio behind an SFI textbook's Blipsay QR code.

Swedish SFI textbooks (Språkvägen, …) print a QR code next to each chapter that
opens a Blipsay player with the publisher's recording of that text. The player is
an Angular SPA, so the MP3 is not a plain link — it comes back base64-encoded from
a POST whose header is derived from the soundfile name.

Chain (all via Blipsay's own endpoints):
    QR  →  https://blip.sano.ma/player/a/<code>
    GET  /api/articles/byCode/<code>                    → article (name, page, duration, issue id)
    GET  /api/issues/playlist-with-sound-video/<issue>  → articles[] incl. soundfile.filenameMp3
    POST /api/soundfiles/sf/<filenameMp3>               → base64 MP3 (prefix "AAA!!AAA")
         header  dcparam: <digits of the reversed filename>
         body    {"content": "<filenameMp3>"}

Usage:
    python3 tools/blipsay-audio.py <code|player-url> [-o out.mp3]
    python3 tools/blipsay-audio.py <code> --info        # metadata only, no download

Decode the QR from a photo first (opencv is enough; scale the image up 2–4×, a
book photo's QR is small):

    python3 -c "import cv2;i=cv2.imread('page.jpg');i=cv2.resize(i,None,fx=3,fy=3);\
print(cv2.QRCodeDetector().detectAndDecode(i)[0])"
"""
import argparse
import base64
import json
import re
import sys
import urllib.request

BASE = 'https://blip.sano.ma'


def get_json(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))


def article_by_code(code):
    return get_json(f'{BASE}/api/articles/byCode/{code}')


def playlist(issue_id):
    return get_json(f'{BASE}/api/issues/playlist-with-sound-video/{issue_id}')


def soundfile_for(code):
    """Return (article, soundfile dict) for a QR code."""
    art = article_by_code(code)
    pl = playlist(art['issue'])
    for a in pl.get('articles', []):
        if a.get('_id') == art['_id']:
            return art, pl, a.get('soundfile') or {}
    return art, pl, {}


def download_mp3(filename_mp3):
    """POST for the base64 payload and return raw MP3 bytes."""
    dcparam = re.sub(r'\D', '', filename_mp3[::-1])
    req = urllib.request.Request(
        f'{BASE}/api/soundfiles/sf/{filename_mp3}',
        data=json.dumps({'content': filename_mp3}).encode('utf-8'),
        headers={'dcparam': dcparam, 'Content-Type': 'application/json'},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        payload = r.read().decode('ascii').strip()
    data = base64.b64decode(re.sub(r'^AAA!!AAA', '', payload))
    if data[:2] not in (b'\xff\xfb', b'\xff\xf3', b'ID'):
        raise SystemExit('response did not decode to an MP3 — the API may have changed')
    return data


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('code', help='Blipsay code (zyW8t) or the full player URL from the QR')
    ap.add_argument('-o', '--out', help='output MP3 path')
    ap.add_argument('--info', action='store_true', help='print metadata only')
    args = ap.parse_args()

    code = args.code.rstrip('/').split('/')[-1]
    art, pl, sf = soundfile_for(code)

    meta = {
        'code': code,
        'publication': pl.get('publicationName', ''),
        'issue': pl.get('name', ''),
        'name': art.get('name', ''),
        'page': art.get('page'),
        'duration': art.get('duration'),
        'language': pl.get('language', ''),
        'playerUrl': f'{BASE}/player/a/{code}',
        'filenameMp3': sf.get('filenameMp3', ''),
    }
    print(json.dumps(meta, ensure_ascii=False, indent=2))
    if args.info:
        return
    if not meta['filenameMp3']:
        raise SystemExit('this article has no soundfile')

    out = args.out or f'{code}.mp3'
    data = download_mp3(meta['filenameMp3'])
    with open(out, 'wb') as fh:
        fh.write(data)
    print(f'wrote {out} ({len(data)} bytes, {meta["duration"]:.1f}s)', file=sys.stderr)


if __name__ == '__main__':
    main()
