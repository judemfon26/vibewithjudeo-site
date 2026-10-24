#!/usr/bin/env python3
"""Refresh content/youtube.json from YouTube with yt-dlp (run locally before adding/updating films).

  python3 tools/refresh_youtube.py            # re-fetch metadata for every film in content/films/
  python3 tools/refresh_youtube.py --new      # also list public long videos on the channel that have no film page yet

Only public videos are stored. A film whose video is no longer public makes the build fail,
so you notice and remove/replace its content/films/<slug>.json.
"""
import json, os, subprocess, sys, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHANNEL = "https://www.youtube.com/@vibewithjudeo/videos"
KEEP = ["id", "title", "description", "duration", "upload_date", "timestamp", "availability", "chapters"]


def meta(vid):
    out = subprocess.run(["yt-dlp", "-J", "--skip-download", "--", f"https://www.youtube.com/watch?v={vid}"],
                         capture_output=True, text=True)
    if out.returncode != 0:
        return {"id": vid, "availability": "unavailable", "error": out.stderr.strip().splitlines()[-1:]}
    d = json.loads(out.stdout)
    d["chapters"] = [[c["start_time"], c["title"]] for c in (d.get("chapters") or [])]
    return {k: d.get(k) for k in KEEP}


ids = [json.load(open(f))["id"] for f in sorted(glob.glob(os.path.join(ROOT, "content/films/*.json")))]
rows = []
for vid in ids:
    m = meta(vid)
    print(f"{vid}  {m.get('availability')}  {m.get('title', '')[:70]}")
    rows.append(m)
json.dump(rows, open(os.path.join(ROOT, "content/youtube.json"), "w"), indent=1, ensure_ascii=False)
bad = [r["id"] for r in rows if r.get("availability") != "public"]
if bad:
    print("NOT PUBLIC (remove these films before building):", bad)

if "--new" in sys.argv:
    flat = json.loads(subprocess.run(["yt-dlp", "--flat-playlist", "-J", CHANNEL], capture_output=True, text=True).stdout)
    print("\nPublic uploads (newest first) without a film page, longer than 5 min:")
    for e in flat["entries"][:40]:
        if e["id"] not in ids and (e.get("duration") or 0) > 300:
            print(f"  {e['id']}  {e.get('duration')}s  {e.get('title')}")
