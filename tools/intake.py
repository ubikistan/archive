#!/usr/bin/env python3
"""Turn an accepted "Submit a record" issue into an archive record.

Run by .github/workflows/intake.yml when the State Archive adds the label `accepted`.
Reads the issue from the environment (ISSUE_BODY, ISSUE_NUMBER, ISSUE_URL), writes the
record file and its media, and checks the whole archive. Prints the new code on success.
On failure it writes the reasons to intake-errors.txt and exits with status 1.

Agents can submit without the form: open an issue whose body uses the same headings
(### Which archive?, ### Title, ### Date, ### Medium, ### Issued by,
### What is it, physically?, ### Caption and text, ### Images and films, ### Credit as).
"""
import datetime, mimetypes, os, re, sys, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build  # noqa: E402
import xpost  # noqa: E402

ROOT = build.ROOT
NONE = {"", "_no response_", "none"}


def fail(msg):
    open(os.path.join(ROOT, "intake-errors.txt"), "w", encoding="utf-8").write(msg)
    print(msg)
    sys.exit(1)


def sections(body):
    out, cur = {}, None
    for ln in body.replace("\r\n", "\n").split("\n"):
        h = re.match(r"^###\s+(.*)", ln)
        if h:
            cur = h.group(1).strip().lower()
            out[cur] = []
        elif cur is not None:
            out[cur].append(ln)
    return {k: "\n".join(v).strip() for k, v in out.items()}


def field(s, *names):
    for n in names:
        v = s.get(n.lower(), "")
        if v.strip().lower() not in NONE:
            return v.strip()
    return ""


def institution_code(text, kind):
    t = text.strip()
    if not t:
        return "SA" if kind == "archive" else ""
    up = t.split()[0].upper().strip("·-:")
    if up in build.INSTITUTIONS:
        return up
    for code, name in build.INSTITUTIONS.items():
        if t.lower() == name.lower() or t.lower() in name.lower():
            return code
    if kind == "record":
        return t
    words = [w for w in re.findall(r"[A-Za-z]+", t) if w[0].isupper() and w.lower() not in ("of", "the", "and", "for")]
    code = "".join(w[0] for w in words).upper()[:5]
    return code if len(code) >= 2 else "SA"


def links(text):
    urls = re.findall(r"!\[[^\]]*\]\((https://[^)\s]+)\)", text)
    urls += re.findall(r'src="(https://[^"]+)"', text)
    for u in re.findall(r"https://[^\s)\"<>]+", text):
        if u not in urls:
            urls.append(u)
    return urls


# the token is only ever sent to these exact hosts
GITHUB_HOSTS = {"github.com", "raw.githubusercontent.com", "user-images.githubusercontent.com",
                "objects.githubusercontent.com", "private-user-images.githubusercontent.com"}
VIDEO_HOSTS = ("archive.org/details/", "youtube.com/", "youtu.be/", "vimeo.com/")


def download(url, dest_noext):
    req = urllib.request.Request(url, headers={"User-Agent": "ubikistan-archive-intake"})
    tok = os.environ.get("GITHUB_TOKEN")
    host = urllib.parse.urlparse(url).hostname or ""
    if tok and host in GITHUB_HOSTS:
        req.add_unredirected_header("Authorization", "Bearer " + tok)
    with urllib.request.urlopen(req, timeout=60) as r:
        ctype = (r.headers.get("Content-Type") or "").split(";")[0].strip()
        data = r.read(build.MAX_FILE + 1)
    if len(data) > build.MAX_FILE:
        return None, "over 10 MB"
    ext = mimetypes.guess_extension(ctype) or os.path.splitext(url.split("?")[0])[1] or ""
    ext = {".jpe": ".jpg", ".jpeg": ".jpg"}.get(ext, ext)
    kind = next((k for k, exts in build.MEDIA_TYPES.items() if ext in exts), None)
    if not kind:
        return None, f"unsupported file type ({ctype or ext or 'unknown'})"
    path = dest_noext + ext
    open(path, "wb").write(data)
    if kind == "image" and ext in (".jpg", ".png", ".webp") and len(data) > build.WARN_FILE:
        try:  # shrink large images; Pillow is installed in the workflow, optional elsewhere
            from PIL import Image
            im = Image.open(path)
            im.thumbnail((2000, 2000))
            os.remove(path)
            path = dest_noext + ".jpg"
            im.convert("RGB").save(path, "JPEG", quality=85)
        except Exception:
            pass
    return (os.path.relpath(path, ROOT), kind), None


def q(s):
    return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"') + '"'


def main():
    body = os.environ.get("ISSUE_BODY", "")
    s = sections(body)
    which = field(s, "Which archive?")
    kind = "record" if which.lower().startswith("the record") else "culture" if which.lower().startswith("culture") else "archive"
    title = field(s, "Title")
    date = field(s, "Date")
    text = field(s, "Caption and text")
    credit = field(s, "Credit as")
    fmt = field(s, "What is it, physically?")
    media_text = field(s, "Images and films")
    # a post on X: take a snapshot of its text and media, keep the link for reference
    xlink = field(s, "Post on X") or next((u for u in links(media_text + "\n" + field(s, "Link")) if xpost.parse(u)), "")
    post, own = None, field(s, "Whose post?").lower().startswith("my")
    if xlink:
        try:
            post = xpost.fetch(xlink)
        except Exception as e:  # noqa
            fail(f"- {e}")
        if not post["found"]:
            post["text"] = post["text"] or ""
        if not date and post.get("posted"):
            y_, m_, d_ = post["posted"].split("-")
            date = f"{d_}.{m_}.{y_}"
        if not title:
            first = re.sub(r"\s+", " ", post.get("text") or "").strip()
            title = (first[:70] + ("…" if len(first) > 70 else "")) or f"Post by @{post['handle']}"
        if not text:
            text = f"A post on X by @{post['handle']}."
    problems = []
    if not title:
        problems.append("The title is missing.")
    if not text:
        problems.append("The caption is missing.")
    if not credit:
        problems.append("'Credit as' is missing.")
    elif re.sub(r"^guest:\s*", "", credit.strip().lower()) in build.RESERVED_NAMES:
        problems.append("That name is reserved for the State Archive. Credit yourself under your own name or handle.")
    m = re.search(r"(1[89]\d\d|20\d\d)", date)
    if not m:
        problems.append(f"I can't find a year in the date '{date}'. Write it like 1983, 06.1983 or 12.06.1983.")
    if problems:
        fail("\n".join("- " + p for p in problems))
    year = int(m.group(1))
    if kind == "archive" and year > 2026:
        fail("- The Archive ends in 2025. Something from 2026 on that really happened belongs in the Record.")
    if kind == "record" and year < 2026:
        fail("- The Record starts in 2026. Invented history from before then belongs in the Archive.")

    records, lore, errors, _ = build.load()
    inst = institution_code(field(s, "Issued by"), kind) if kind != "culture" else ""
    form_, link = field(s, "Form").lower(), field(s, "Link")
    if kind == "culture":
        med = None
        code = build.next_code(records, ["ACC"])
        rec_path = os.path.join(ROOT, "records", "culture", build.file_id(code) + ".md")
    elif kind == "archive":
        med = (field(s, "Medium").split()[:1] or ["EPH"])[0].upper()
        if med not in build.MEDIA:
            med = "EPH"
        code = build.next_code(records, [inst, med, year])
        rec_path = os.path.join(ROOT, "records", "archive", str(year), build.file_id(code) + ".md")
    else:
        med = None
        code = build.next_code(records, ["REC"])
        rec_path = os.path.join(ROOT, "records", "record", build.file_id(code) + ".md")
    fid = build.file_id(code)

    media, notes, n = [], [], 0
    if post:
        for ph in post["photos"][:6]:
            n += 1
            try:
                got, why = download(ph, os.path.join(ROOT, "media", fid if n == 1 else f"{fid}-{n}"))
            except Exception as e:  # noqa
                got, why = None, str(e)
            if got:
                media.append({"file": got[0], "type": got[1]})
            else:
                n -= 1
                notes.append(f"Could not keep an image from the post: {why}")
        if post.get("video"):
            n += 1
            try:
                got, why = download(post["video"], os.path.join(ROOT, "media", fid if n == 1 else f"{fid}-{n}"))
            except Exception as e:  # noqa
                got, why = None, str(e)
            if got:
                media.append({"file": got[0], "type": "video"})
            else:
                n -= 1
                media.append({"url": post["url"], "type": "video"})
                notes.append("The video is too large to keep; it is linked to the post instead.")
            if post.get("poster"):
                n += 1
                try:
                    got, why = download(post["poster"], os.path.join(ROOT, "media", f"{fid}-{n}"))
                except Exception:  # noqa
                    got = None
                if got:
                    for md in media:
                        if md["type"] == "video":
                            md["poster"] = got[0]
                else:
                    n -= 1
        if not post["found"]:
            notes.append("X did not return the post, so only the link is kept. Add a screenshot by hand if you have one.")
    for url in links(media_text):
        if xpost.parse(url):
            continue
        if any(h in url for h in VIDEO_HOSTS):
            media.append({"url": url, "type": "video"})
            continue
        n += 1
        dest = os.path.join(ROOT, "media", fid if n == 1 else f"{fid}-{n}")
        try:
            got, why = download(url, dest)
        except Exception as e:  # noqa
            got, why = None, str(e)
        if got:
            media.append({"file": got[0], "type": got[1]})
        else:
            n -= 1
            notes.append(f"Skipped {url}: {why}")

    fm = ["---", f"code: {code}", f"title: {q(title)}", f"date: {q(date)}", f"year: {year}"]
    if inst:
        fm.append(f"institution: {q(inst) if kind == 'record' else inst}")
    if med:
        fm.append(f"medium: {med}")
    if kind == "culture":
        fm.append(f"form: {form_ if form_ in build.FORMS else 'other'}")
        if link.startswith("https://"):
            fm.append(f"link: {link}")
    if fmt:
        fm.append(f"format: {q(fmt)}")
    if kind == "archive":
        fm.append("status: FOLK")
    if media:
        fm.append("media:")
        for i, md in enumerate(media):
            key = "file" if "file" in md else "url"
            fm.append(f"  - {key}: {md[key]}")
            fm.append(f"    type: {md['type']}")
            fm.append(f"    alt: {q(title if i == 0 else title + ', ' + str(i + 1))}")
            if md.get("poster"):
                fm.append(f"    poster: {md['poster']}")
    if post:
        fm += ["source:", "  platform: x", f"  url: {post['url']}", f"  author: {q('@' + post['handle'])}"]
        if post.get("name"):
            fm.append(f"  name: {q(post['name'])}")
        if post.get("posted"):
            fm.append(f"  posted: {post['posted']}")
        fm.append(f"  rights: {'own' if own else 'author'}")
    fm += [f"contributor: {q(credit)}", f"added: {datetime.date.today().isoformat()}"]
    if os.environ.get("ISSUE_URL"):
        fm.append(f"submission: {os.environ['ISSUE_URL']}")
    body = text.strip()
    if post and post.get("text"):
        body += "\n\n" + "\n".join("> " + ln for ln in post["text"].split("\n")) + f"\n\n@{post['handle']} on X" + (f", {post['posted']}" if post.get("posted") else "")
    fm += ["---", "", body, ""]
    os.makedirs(os.path.dirname(rec_path), exist_ok=True)
    open(rec_path, "w", encoding="utf-8").write("\n".join(fm))

    records, lore, errors, warnings = build.load()
    errors, warnings = build.check(records, lore, errors, warnings)
    if errors:
        os.remove(rec_path)
        for md in media:
            if md.get("file"):
                os.remove(os.path.join(ROOT, md["file"]))
        fail("\n".join("- " + e for e in errors))
    open(os.path.join(ROOT, "intake-result.txt"), "w", encoding="utf-8").write(
        "\n".join([code, os.path.relpath(rec_path, ROOT)] + notes))
    print(code)


if __name__ == "__main__":
    main()
