#!/usr/bin/env python3
"""File posts from X straight into the archive (run by the State Archive).

    URLS="https://x.com/a/status/1 https://x.com/b/status/2" OWN="anonymous" \
    KIND=culture FORM=other python3 tools/ximport.py

For each post: fetch it, keep a snapshot of its text, images and video, and write a record
(Culture by default) with the link kept for reference. Posts by @ubik_gold (the official
UBIK account) and handles listed in OWN are the State's own (CC0); all others belong to their
authors. Every post is credited to the account that posted it.
Already-archived posts are skipped. Prints one line per post.
"""
import datetime, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build, xpost  # noqa: E402
from intake import download  # noqa: E402

ROOT = build.ROOT


ADDR = re.compile(r"(robinhood:)?0x[0-9a-fA-F]{40}")
TICKER = re.compile(r"\$([A-Z]{2,10})\b")


def q(s):
    return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"') + '"'


def already(records):
    seen = set()
    for r in records:
        src = r.get("source") or {}
        p = xpost.parse(str(src.get("url", "")))
        if p:
            seen.add(p["id"])
    return seen


def main():
    urls = [u for u in re.split(r"[\s,]+", os.environ.get("URLS", "")) if u]
    own = {h.strip().lstrip("@").lower() for h in os.environ.get("OWN", "").split(",") if h.strip()} | {"ubik_gold"}
    kind = os.environ.get("KIND", "culture")
    form = os.environ.get("FORM", "")
    records, lore, errors, _ = build.load()
    seen = already(records)
    for url in urls:
        p = xpost.parse(url)
        if not p:
            print(f"skip   {url}: not a post")
            continue
        if p["id"] in seen:
            print(f"skip   {url}: already in the archive")
            continue
        post = xpost.fetch(url)
        if not post["found"]:
            print(f"FAIL   {url}: X did not return the post")
            continue
        records, lore, errors, _ = build.load()
        code = build.next_code(records, ["ACC" if kind == "culture" else "REC"])
        fid = build.file_id(code)
        media, n = [], 0
        for ph in post["photos"][:6]:
            n += 1
            got, why = download(ph, os.path.join(ROOT, "media", fid if n == 1 else f"{fid}-{n}"))
            if got:
                media.append({"file": got[0], "type": got[1]})
            else:
                n -= 1
        if post.get("video"):
            n += 1
            got, why = download(post["video"], os.path.join(ROOT, "media", fid if n == 1 else f"{fid}-{n}"))
            vid = {"file": got[0], "type": "video"} if got else {"url": post["url"], "type": "video"}
            if not got:
                n -= 1
            if post.get("poster"):
                n += 1
                pg, _ = download(post["poster"], os.path.join(ROOT, "media", f"{fid}-{n}"))
                if pg:
                    vid["poster"] = pg[0]
                else:
                    n -= 1
            media.insert(0, vid)
        # contract addresses and tickers stay out of the archive (culture before coin)
        post["text"] = ADDR.sub("[contract address removed]", post.get("text") or "")
        text = re.sub(r"\s+", " ", TICKER.sub(lambda m: m.group(1), ADDR.sub("", post["text"]))).strip(" .,:")
        title = (text[:72] + ("…" if len(text) > 72 else "")) if len(text) > 3 else f"[Post by @{post['handle']}]"
        f_ = form or ("film" if post.get("video") else "image" if post["photos"] else "writing")
        posted = post.get("posted") or datetime.date.today().isoformat()
        y, m, d = posted.split("-")
        rights = "own" if post["handle"].lower() in own else "author"
        fm = ["---", f"code: {code}", f"title: {q(title)}", f"date: {q(f'{d}.{m}.{y}')}", f"year: {int(y)}"]
        if kind == "culture":
            fm.append(f"form: {f_}")
        if media:
            fm.append("media:")
            for i, md in enumerate(media):
                key = "file" if "file" in md else "url"
                fm += [f"  - {key}: {md[key]}", f"    type: {md['type']}", f"    alt: {q('Post by @' + post['handle'] + (', ' + str(i + 1) if i else ''))}"]
                if md.get("poster"):
                    fm.append(f"    poster: {md['poster']}")
        fm += ["source:", "  platform: x", f"  url: {post['url']}", f"  author: {q('@' + post['handle'])}", f"  posted: {posted}", f"  rights: {rights}"]
        fm += [f"contributor: {q('@' + post['handle'])}", f"added: {datetime.date.today().isoformat()}", "---", ""]
        body = "A post on X by @ubik_gold, the official account of UBIK." if post["handle"].lower() == "ubik_gold" else f"A post on X by @{post['handle']}."
        if post.get("text"):
            body += "\n\n" + "\n".join("> " + ln for ln in post["text"].split("\n")) + f"\n\n@{post['handle']} on X, {posted}"
        folder = "culture" if kind == "culture" else "record"
        path = os.path.join(ROOT, "records", folder, fid + ".md")
        open(path, "w", encoding="utf-8").write("\n".join(fm) + "\n" + body + "\n")
        seen.add(p["id"])
        print(f"filed  {code}  @{post['handle']}  {len(media)} media  {url}")
    records, lore, errors, warnings = build.load()
    errors, warnings = build.check(records, lore, errors, warnings)
    if errors:
        print("\n".join("ERROR: " + e for e in errors))
        sys.exit(1)


if __name__ == "__main__":
    main()
