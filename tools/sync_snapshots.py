#!/usr/bin/env python3
"""Sync public snapshots from ubik.gold into pages/parts/snapshot/.

Fetches:
  /forecasts?status=settled&include=history,details -> settled.json
  /forecasts?status=open&include=history,details    -> open.json
  /synthesis?include=all                           -> synthesis.json

Keeps the static fallback and offline bundle aligned with upstream resolutions.
"""
import json, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNAP_DIR = os.path.join(ROOT, "pages", "parts", "snapshot")
UBIK_BASE = os.environ.get("UBIK_BASE", "https://ubik.gold")

UA = {"User-Agent": "ubikistan-snapshot-sync", "Accept": "application/json"}
if os.environ.get("UBIK_KEY"):
    UA["Authorization"] = "Bearer " + os.environ["UBIK_KEY"]

def get(path):
    req = urllib.request.Request(UBIK_BASE + path, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def sync_snapshots():
    os.makedirs(SNAP_DIR, exist_ok=True)
    settled = get("/forecasts?status=settled&include=history,details")
    opens = get("/forecasts?status=open&include=history,details")
    syn = get("/synthesis?include=all")

    targets = (
        ("settled.json", settled),
        ("open.json", opens),
        ("synthesis.json", syn),
    )

    for filename, payload in targets:
        path = os.path.join(SNAP_DIR, filename)
        content = json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n"
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"synced {filename}: {len(payload.get('data') or payload.get('forecasts') or [])} items")

if __name__ == "__main__":
    sync_snapshots()
