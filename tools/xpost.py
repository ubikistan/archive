#!/usr/bin/env python3
"""Read a post on X (Twitter) for the archive.

    python3 tools/xpost.py https://x.com/someone/status/1234567890

Prints what the archive needs as JSON: handle, name, date, text, photos, video.
Uses X's public embed data, which needs no account. X does not guarantee it, so
everything here degrades: if a source fails, the fields it would have filled stay empty.

Whose post decides what the archive keeps:
  own     the contributor's own post: text and images are copied into the archive (CC0)
  linked  someone else's post: only the link and the facts; the post shows from X
"""
import datetime, json, math, re, sys, urllib.parse, urllib.request

X_URL = re.compile(r"https?://(?:www\.|mobile\.)?(?:x|twitter)\.com/([A-Za-z0-9_]{1,15})/status(?:es)?/(\d+)")
UA = {"User-Agent": "Mozilla/5.0 (ubikistan-archive)"}


def parse(url):
    m = X_URL.search(url or "")
    if not m:
        return None
    handle, pid = m.group(1), m.group(2)
    return {"handle": handle, "id": pid, "url": f"https://x.com/{handle}/status/{pid}"}


def _token(pid):
    # the token X's own embed computes: (id / 1e15 * pi).toString(36), without zeros and the point.
    # Mirrors how JavaScript prints a float in base 36: digits stop once the double's precision runs out.
    n = int(pid) / 1e15 * math.pi
    digits, whole, frac = "0123456789abcdefghijklmnopqrstuvwxyz", int(n), n - int(n)
    out = ""
    while whole:
        whole, r = divmod(whole, 36)
        out = digits[r] + out
    out = (out or "0") + "."
    delta = max(0.5 * (math.nextafter(n, math.inf) - n), 0.5 * (math.nextafter(0.0, 1.0)))
    while True:
        frac *= 36
        delta *= 36
        d = int(frac)
        frac -= d
        out += digits[d]
        if frac <= delta or frac >= 1 - delta:
            break
    return re.sub(r"(0+|\.)", "", out) or "a"


def _get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


def syndication(pid):
    return _get(f"https://cdn.syndication.twimg.com/tweet-result?id={pid}&lang=en&token={_token(pid)}")


def oembed(url):
    return _get("https://publish.twitter.com/oembed?omit_script=1&dnt=true&url=" + urllib.parse.quote(url, safe=""))


def _strip(html):
    t = re.sub(r"<br\s*/?>", "\n", html)
    t = re.sub(r"<[^>]+>", "", t)
    for a, b in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&#39;", "'"), ("&mdash;", "—")):
        t = t.replace(a, b)
    return t.strip()


def fetch(url):
    p = parse(url)
    if not p:
        raise ValueError("That is not a link to a post on X.")
    out = dict(p, name="", posted="", text="", photos=[], video=None, poster=None, found=False)
    try:
        d = syndication(p["id"])
        if d and d.get("text") is not None:
            out["found"] = True
            u = d.get("user") or {}
            out["handle"] = u.get("screen_name") or out["handle"]
            out["name"] = u.get("name", "")
            out["url"] = f"https://x.com/{out['handle']}/status/{p['id']}"
            out["text"] = re.sub(r"\s*https://t\.co/\w+$", "", d.get("text", "")).strip()
            if d.get("created_at"):
                out["posted"] = d["created_at"][:10]
            for m in d.get("mediaDetails") or []:
                if m.get("type") == "photo" and m.get("media_url_https"):
                    out["photos"].append(m["media_url_https"] + "?name=large")
                elif m.get("type") in ("video", "animated_gif"):
                    out["poster"] = m.get("media_url_https")
                    mp4 = [v for v in (m.get("video_info") or {}).get("variants", []) if v.get("content_type") == "video/mp4"]
                    if mp4:
                        out["video"] = max(mp4, key=lambda v: v.get("bitrate", 0))["url"]
    except Exception:
        pass
    if not out["found"]:
        try:
            o = oembed(p["url"])
            out["found"] = True
            out["name"] = o.get("author_name", "")
            m = re.search(r'twitter\.com/([A-Za-z0-9_]+)', o.get("author_url", ""))
            if m:
                out["handle"] = m.group(1)
            html = o.get("html", "")
            body = re.search(r"<p[^>]*>(.*?)</p>", html, re.S)
            if body:
                out["text"] = re.sub(r"\s*pic\.twitter\.com/\w+$", "", _strip(body.group(1))).strip()
            dates = re.findall(r">([A-Z][a-z]+ \d{1,2}, \d{4})</a>", html)
            if dates:
                out["posted"] = datetime.datetime.strptime(dates[-1], "%B %d, %Y").date().isoformat()
        except Exception:
            pass
    return out


def save(post, fid):
    """Download the post's images (and video, if small enough) into media/<fid>, <fid>-2 …"""
    import os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from intake import download, ROOT
    kept, n = [], 0
    for u in post["photos"][:6] + ([post["video"]] if post.get("video") else []):
        n += 1
        got, why = download(u, os.path.join(ROOT, "media", fid if n == 1 else f"{fid}-{n}"))
        if got:
            kept.append({"file": got[0], "type": got[1] if u != post.get("video") else "video"})
        else:
            n -= 1
            print(f"skipped {u}: {why}", file=sys.stderr)
    return kept


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__ + "\n    python3 tools/xpost.py <url> --save ACC-0007    also keeps the images in media/")
    post = fetch(sys.argv[1])
    if "--save" in sys.argv:
        post["kept"] = save(post, sys.argv[sys.argv.index("--save") + 1])
    print(json.dumps(post, ensure_ascii=False, indent=1))
