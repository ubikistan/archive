#!/usr/bin/env python3
"""Approve or take down a record that is marked under review (run by the review workflow).

    ISSUE_URL=https://github.com/ubikistan/archive/issues/7 ACTION=approved python3 tools/review.py

approved: removes the 'review: pending' line, so the record is no longer marked under review.
declined: deletes the record and its media files.
Writes the record's code to review-result.txt.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build  # noqa: E402

ROOT = build.ROOT


def main():
    url, action = os.environ["ISSUE_URL"].strip(), os.environ["ACTION"].strip()
    records, lore, errors, warnings = build.load()
    hits = [r for r in records if str(r.get("submission", "")).strip() == url]
    if not hits:
        sys.exit(f"No record was filed from {url}")
    r = hits[0]
    path = os.path.join(ROOT, r["_file"])
    if action == "approved":
        text = open(path, encoding="utf-8").read()
        text = re.sub(r"(?m)^review: pending\n", "", text, count=1)
        open(path, "w", encoding="utf-8").write(text)
    elif action == "declined":
        for m in r.get("media") or []:
            for k in ("file", "poster"):
                if m.get(k) and os.path.exists(os.path.join(ROOT, m[k])):
                    os.remove(os.path.join(ROOT, m[k]))
        os.remove(path)
    else:
        sys.exit("ACTION is approved or declined")
    open(os.path.join(ROOT, "review-result.txt"), "w", encoding="utf-8").write(str(r["code"]))
    print(action, r["code"])


if __name__ == "__main__":
    main()
