#!/usr/bin/env python3
"""The Archive of the Republic of Ubikistan: checker, search and builder.

    python3 tools/build.py check                    check every record and lore page
    python3 tools/build.py search "first passport"  search the archive from the terminal
    python3 tools/build.py next MCA POS 1978        next free archive code for that series
    python3 tools/build.py next REC                 next free Record number
    python3 tools/build.py build                    write the public site to dist/

Needs Python 3.8+ and PyYAML (pip install pyyaml). Nothing else.
"""
import html, json, os, re, shutil, sys, datetime

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is missing. Install it with: pip install pyyaml")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_URL = os.environ.get("ARCHIVE_BASE_URL", "https://ubikistan.github.io/archive/")
REPO_URL = "https://github.com/ubikistan/archive"
MAINTAINERS = {"Headroom"}  # only the State Archive sets a status other than FOLK
RESERVED_NAMES = {"headroom", "state archive", "the state archive"}  # outside contributors cannot use these

INSTITUTIONS = {
    "MSA": "Ministry of State Affairs", "BSV": "Border Service", "SA": "State Archive",
    "UNT": "Ubikistan National Television", "MCA": "Ministry of Culture",
    "MMA": "Ministry for Machine Affairs", "IAC": "Institute for Applied Consciousness",
    "NICC": "National Institute for Computation and Communications",
    "UBK": "UBIK Systems Corporation", "RES": "Reserve of Ubikistan", "PTT": "State Post",
    "SPC": "Sporting Committee", "RSP": "Register of Synthetic Persons",
}
MEDIA = {"PH": "photograph", "AV": "film, tape, broadcast", "DOC": "document",
         "POS": "poster, advertisement", "STP": "stamp", "NOTE": "banknote, coin, bond",
         "PP": "passport", "SCR": "screenshot, interface", "EPH": "ephemera",
         "OBJ": "product, hardware, packaging"}
STATUSES = {"CANON": "AUTHENTICATED", "PROBABLE": "INCOMPLETE",
            "DISPUTED": "DISPUTED", "FOLK": "APOCRYPHA", "SPECIMEN": "SPECIMEN"}
ERAS = [  # id, name, first year, last year
    ("before", "Before the Republic", 0, 1965),
    ("republic", "I · The Republic", 1966, 1989),
    ("technology-state", "II · The Technology State", 1990, 1995),
    ("product-age", "III · The Product Age", 1996, 2008),
    ("network", "IV · The Network", 2009, 2018),
    ("emergence", "V · The Emergence", 2019, 2025),
    ("reopening", "VI · The Reopening", 2026, 2026),
    ("ubik", "VII · UBIK", 2027, 9999),
]
MEDIA_TYPES = {"image": (".jpg", ".jpeg", ".png", ".gif", ".webp"),
               "video": (".mp4", ".webm"), "audio": (".mp3", ".ogg", ".wav"),
               "document": (".pdf", ".txt", ".md")}
CONFIG = json.load(open(os.path.join(ROOT, "archive.config.json"), encoding="utf-8"))
MAX_FILE = 10 * 1024 * 1024
WARN_FILE = 3 * 1024 * 1024

ARCHIVE_CODE = re.compile(r"^([A-Z]{2,5})/([A-Z]{2,4})/(\d{4})/([A-Z]?\d{3,4})$")
REC_CODE = re.compile(r"^REC (\d{4})$")
ACC_CODE = re.compile(r"^ACC (\d{4})$")
FORMS = {"film": "Film", "image": "Image", "merch": "Merch", "music": "Music", "writing": "Writing",
         "game": "Game", "performance": "Performance", "other": "Other"}


def era_for(year):
    for eid, name, a, b in ERAS:
        if a <= year <= b:
            return eid
    return "before"


def file_id(code):
    return code.replace("/", "-").replace(" ", "-")


# ---------------------------------------------------------------- reading

def split_front(path):
    text = open(path, encoding="utf-8").read()
    if not text.startswith("---"):
        raise ValueError("no frontmatter: the file must start with ---")
    parts = text.split("\n---", 1)
    if len(parts) < 2:
        raise ValueError("frontmatter is not closed with ---")
    meta = yaml.safe_load(parts[0][3:]) or {}
    body = parts[1].lstrip("-").strip("\n")
    return meta, body.strip()


def load():
    errors, warnings, records, lore = [], [], [], []
    for d in ("records/archive", "records/record", "records/culture"):
        for dirpath, _, files in os.walk(os.path.join(ROOT, d)):
            for f in sorted(files):
                if not f.endswith(".md"):
                    continue
                p = os.path.join(dirpath, f)
                rel = os.path.relpath(p, ROOT)
                try:
                    meta, body = split_front(p)
                except Exception as e:  # noqa
                    errors.append(f"{rel}: {e}")
                    continue
                meta["_file"] = rel
                meta["_body"] = body
                records.append(meta)
    for f in sorted(os.listdir(os.path.join(ROOT, "lore"))):
        if f.endswith(".md"):
            p = os.path.join(ROOT, "lore", f)
            try:
                meta, body = split_front(p)
            except Exception as e:  # noqa
                errors.append(f"lore/{f}: {e}")
                continue
            meta["id"] = f[:-3]
            meta["_file"] = "lore/" + f
            meta["_body"] = body
            lore.append(meta)
    return records, lore, errors, warnings


def check(records, lore, errors, warnings):
    seen = {}
    lore_ids = {l["id"] for l in lore}
    for r in records:
        f = r["_file"]
        code = str(r.get("code", "")).strip()
        for k in ("code", "title", "date", "year", "contributor"):
            if not r.get(k) and r.get(k) != 0:
                errors.append(f"{f}: missing '{k}'")
        if code in seen:
            errors.append(f"{f}: code {code} is already used by {seen[code]}")
        seen[code] = f
        year = r.get("year")
        if not isinstance(year, int):
            errors.append(f"{f}: 'year' must be a number, like 1978")
            continue
        m, n = ARCHIVE_CODE.match(code), REC_CODE.match(code)
        if f.startswith("records/archive/"):
            if not m:
                errors.append(f"{f}: archive code must look like MCA/POS/1978/0019")
                continue
            inst, med, cy, _ = m.groups()
            if int(cy) != year:
                errors.append(f"{f}: the code says {cy} but 'year' is {year}")
            if year == 2026 and r.get("status") not in ("FOLK", "SPECIMEN"):
                errors.append(f"{f}: Archive material dated 2026 is a SPECIMEN (a proposed state object, State Archive only) or apocrypha (FOLK). Real events belong in the Record")
            elif r.get("status") == "SPECIMEN" and year != 2026:
                errors.append(f"{f}: only objects dated 2026 can be specimens")
            elif not (1965 <= year <= 2026):
                errors.append(f"{f}: the Archive ends in 2025, with only apocrypha dated 2026. Real events belong in the Record")
            if r.get("institution") != inst:
                errors.append(f"{f}: 'institution' must match the code ({inst})")
            if inst not in INSTITUTIONS:
                warnings.append(f"{f}: institution {inst} is new. Add it to lore/codes.md if it should stay")
            if r.get("medium") != med:
                errors.append(f"{f}: 'medium' must match the code ({med})")
            if med not in MEDIA:
                errors.append(f"{f}: unknown medium {med}. Use one of {', '.join(MEDIA)}")
            st = r.get("status")
            if st not in STATUSES:
                errors.append(f"{f}: 'status' must be one of {', '.join(STATUSES)}")
            elif st != "FOLK" and r.get("contributor") not in MAINTAINERS:
                errors.append(f"{f}: new contributions enter as FOLK. Only the State Archive promotes records")
            want = f"records/archive/{year}/{file_id(code)}.md"
            if f != want:
                errors.append(f"{f}: should be saved as {want}")
        elif f.startswith("records/culture/"):
            if not ACC_CODE.match(code):
                errors.append(f"{f}: Culture accessions look like 'ACC 0001'")
                continue
            if r.get("form") not in FORMS:
                errors.append(f"{f}: 'form' must be one of {', '.join(FORMS)}")
            if "status" in r:
                errors.append(f"{f}: citizen work has no status. It is what it is")
            if "featured" in r and not isinstance(r["featured"], bool):
                errors.append(f"{f}: 'featured' is true or false (the Ministry of Culture sets it)")
            if not r.get("media") and not r.get("link"):
                errors.append(f"{f}: citizen work needs an image or film under 'media', or a 'link'")
            if r.get("link") and not str(r["link"]).startswith("https://"):
                errors.append(f"{f}: 'link' must start with https://")
            want = f"records/culture/{file_id(code)}.md"
            if f != want:
                errors.append(f"{f}: should be saved as {want}")
        elif f.startswith("records/record/"):
            if not n:
                errors.append(f"{f}: Record numbers look like 'REC 0006'")
                continue
            if year < 2026:
                errors.append(f"{f}: the Record starts in 2026. Invented history belongs in the Archive")
            if "status" in r:
                errors.append(f"{f}: Record entries have no status. They happened")
            want = f"records/record/{file_id(code)}.md"
            if f != want:
                errors.append(f"{f}: should be saved as {want}")
        for i, md in enumerate(r.get("media") or []):
            if not isinstance(md, dict):
                errors.append(f"{f}: media item {i+1} must have 'file' or 'url', and 'type'")
                continue
            t = md.get("type")
            if t not in MEDIA_TYPES:
                errors.append(f"{f}: media type must be one of {', '.join(MEDIA_TYPES)}")
            if md.get("file"):
                mp = os.path.join(ROOT, md["file"])
                if not md["file"].startswith("media/"):
                    errors.append(f"{f}: media files live in media/")
                elif not os.path.isfile(mp):
                    errors.append(f"{f}: {md['file']} does not exist")
                else:
                    size = os.path.getsize(mp)
                    if size > MAX_FILE:
                        errors.append(f"{f}: {md['file']} is over 10 MB. Put films on the Internet Archive and use 'url'")
                    elif size > WARN_FILE:
                        warnings.append(f"{f}: {md['file']} is {size // 1024} KB. Under 3 MB is kinder")
                    if t in MEDIA_TYPES and not md["file"].lower().endswith(MEDIA_TYPES[t]):
                        errors.append(f"{f}: {md['file']} does not look like {t}")
            elif md.get("url"):
                if not str(md["url"]).startswith("https://"):
                    errors.append(f"{f}: media urls must start with https://")
            else:
                errors.append(f"{f}: media item {i+1} needs 'file' or 'url'")
            if t == "image" and not md.get("alt"):
                warnings.append(f"{f}: image {i+1} has no 'alt' text")
        src = r.get("source")
        if src is not None:
            if not isinstance(src, dict) or not str(src.get("url", "")).startswith("https://"):
                errors.append(f"{f}: 'source' needs a 'url' starting with https://")
            elif src.get("rights") not in ("own", "author"):
                errors.append(f"{f}: source 'rights' must be 'own' (the contributor's own post, CC0) or 'author' (belongs to its author)")
        for lid in r.get("lore") or []:
            if lid not in lore_ids:
                errors.append(f"{f}: lore page '{lid}' does not exist")
    for r in records:
        for c in r.get("related") or []:
            if str(c) not in seen:
                errors.append(f"{r['_file']}: related record {c} does not exist")
    return errors, warnings


# ---------------------------------------------------------------- markdown (the small subset the archive uses)

def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<i>\1</i>", s)

    def link(m):
        # only safe destinations: https links, in-page anchors, and lore page names
        text, href = m.group(1), m.group(2)
        if re.match(r"^[a-z0-9-]+$", href):
            href = "#/lore/" + href
        elif not (href.startswith("https://") or href.startswith("#/")):
            return text
        return f'<a href="{html.escape(href)}">{text}</a>'
    return re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", link, s)


def md(text):
    out, lines, i = [], text.split("\n"), 0
    while i < len(lines):
        ln = lines[i]
        if not ln.strip():
            i += 1
            continue
        h = re.match(r"^(#{1,4})\s+(.*)", ln)
        if h:
            lvl = len(h.group(1)) + 1
            out.append(f"<h{lvl}>{inline(h.group(2))}</h{lvl}>")
            i += 1
            continue
        if ln.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            head = rows[0] if len(rows) > 1 and re.match(r"^[-: ]+$", "".join(rows[1])) else None
            body = rows[2:] if head else rows
            t = ['<div class="tw"><table>']
            if head and any(head):
                t.append("<thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead>")
            t.append("<tbody>")
            for r in body:
                t.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>")
            t.append("</tbody></table></div>")
            out.append("".join(t))
            continue
        if re.match(r"^(\s*[-*]|\s*\d+\.)\s+", ln):
            tag = "ol" if re.match(r"^\s*\d+\.", ln) else "ul"
            items = []
            while i < len(lines) and re.match(r"^(\s*[-*]|\s*\d+\.)\s+", lines[i]):
                items.append(re.sub(r"^(\s*[-*]|\s*\d+\.)\s+", "", lines[i]))
                i += 1
            out.append(f"<{tag}>" + "".join(f"<li>{inline(x)}</li>" for x in items) + f"</{tag}>")
            continue
        para = []
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#|\||\s*[-*]\s|\s*\d+\.\s)", lines[i]):
            para.append(lines[i].strip())
            i += 1
        out.append("<p>" + inline(" ".join(para)) + "</p>")
    return "\n".join(out)


def plain(text):
    t = re.sub(r"[*`#|]", " ", text)
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", t)
    return re.sub(r"\s+", " ", t).strip()


# ---------------------------------------------------------------- history (every page keeps its versions, like a wiki)

def history():
    """Read git history once: revisions per file, and the most recent changes overall."""
    import subprocess
    try:
        # times are published in UTC; contributors' own time zones stay private
        out = subprocess.run(["git", "-C", ROOT, "log", "--no-merges", "--date=format-local:%Y-%m-%dT%H:%M:%SZ", "--name-status",
                              "--format=@@%H|%ad|%an|%s", "--", "lore", "records"],
                             capture_output=True, text=True, timeout=60, env={**os.environ, "TZ": "UTC"}).stdout
    except Exception:
        return {}, []
    per_file, changes, cur = {}, [], None
    for ln in out.splitlines():
        if ln.startswith("@@"):
            sha, date, author, msg = ln[2:].split("|", 3)
            if author in ("Claude", "github-actions[bot]"):
                author = "State Archive"
            cur = {"sha": sha[:10], "date": date[:10], "time": date, "author": author, "message": msg,
                   "url": f"{REPO_URL}/commit/{sha}", "files": []}
            changes.append(cur)
        elif ln.strip() and cur is not None:
            parts = ln.split("\t")
            st, path = parts[0][:1], parts[-1]
            cur["files"].append({"path": path, "change": {"A": "created", "D": "deleted", "R": "moved"}.get(st, "edited")})
            per_file.setdefault(path, []).append({k: cur[k] for k in ("sha", "date", "author", "message", "url")})
    return per_file, changes


# ---------------------------------------------------------------- export

def export(records, lore):
    talk = discussions()
    revs, changes = history()
    recs = []
    for r in sorted(records, key=lambda r: (r["year"], str(r["code"]))):
        code = str(r["code"])
        kind = "record" if code.startswith("REC") else "culture" if code.startswith("ACC") else "archive"
        media = []
        for m in r.get("media") or []:
            item = {k: v for k, v in m.items()}
            if m.get("file"):
                item["url"] = BASE_URL + m["file"]
            media.append(item)
        recs.append({
            "id": file_id(code), "code": code, "kind": kind, "title": r["title"],
            "date": str(r["date"]), "year": r["year"], "era": era_for(r["year"]),
            "institution": r.get("institution"),
            "institution_name": INSTITUTIONS.get(r.get("institution"), r.get("institution")),
            "medium": r.get("medium"), "format": r.get("format"),
            "status": r.get("status"), "status_label": STATUSES.get(r.get("status")),
            "form": r.get("form"), "form_label": FORMS.get(r.get("form")), "link": r.get("link"),
            "featured": bool(r.get("featured")) if kind == "culture" else None,
            "access": r.get("access", "public"),
            "subjects": r.get("subjects") or [], "tags": r.get("tags") or [],
            "related": [file_id(str(c)) for c in r.get("related") or []],
            "lore": r.get("lore") or [], "media": media,
            "contributor": r.get("contributor"), "added": str(r.get("added", "")),
            "text": r["_body"], "html": md(r["_body"]),
            "source": f"{REPO_URL}/blob/main/{r['_file']}",
            "submission": r.get("submission"),
            "origin": {k: str(v) for k, v in (r.get("source") or {}).items()} or None,
            "discussion": talk.get(code),
            "file": r["_file"], "revisions": revs.get(r["_file"], [])[:50],
        })
    lo = [{"id": l["id"], "title": l.get("title", l["id"]), "summary": l.get("summary", ""),
           "section": l.get("section", "lore"),
           "order": l.get("order", 99), "text": l["_body"], "html": md(l["_body"]),
           "source": f"{REPO_URL}/blob/main/{l['_file']}", "discussion": talk.get("lore/" + l["id"]),
           "file": l["_file"], "revisions": revs.get(l["_file"], [])[:50]}
          for l in sorted(lore, key=lambda l: (l.get("order", 99), l["id"]))]
    return {
        "schema": 1,
        "name": "The Archive of the Republic of Ubikistan",
        "about": "Lore and records of Ubikistan. The Archive (1965-2025) is what Ubikistan says happened; "
                 "the Record (2026-) is what actually happens. Free to copy.",
        "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "base_url": BASE_URL, "repository": REPO_URL,
        "comments": CONFIG.get("comments"), "submit_url": CONFIG.get("submit_url"),
        "guest_desk": CONFIG.get("guest_desk") or None,
        "statuses": STATUSES,
        "eras": [{"id": e, "name": n, "from": a, "to": b} for e, n, a, b in ERAS],
        "institutions": INSTITUTIONS, "media_codes": MEDIA,
        "counts": {"archive": sum(r["kind"] == "archive" for r in recs),
                   "record": sum(r["kind"] == "record" for r in recs),
                   "culture": sum(r["kind"] == "culture" for r in recs), "lore": len(lo)},
        "forms": FORMS,
        "lore": lo, "records": recs,
        "changes": changes[:100],
    }


def llms_txt(data, full=False):
    L = ["# The Archive of the Republic of Ubikistan", "",
         "> " + data["about"], "",
         f"Everything as one JSON file: {BASE_URL}lore.json",
         f"Everything as plain text: {BASE_URL}llms-full.txt",
         f"Source files and how to contribute: {data['repository']}", ""]
    if not full:
        L += ["## How to add a record", "",
              "Everything new enters as FOLK (shown as APOCRYPHA). Read the rules first: "
              f"{REPO_URL}/blob/main/lore/rules.md and {REPO_URL}/blob/main/CLAUDE.md.",
              "The Archive is invented history from 1965 to 2025. The Record is real events from 2026 on. "
              "Culture is citizen work (films, images, merch, music, writing), numbered ACC 0001 onward; choose 'Culture (something I made: a film, image, merch, music, writing)' as the archive and add &form=<film|image|merch|music|writing|game|performance|other>&link=<url>.",
              "Never: real people as part of the history, aerosol-can imagery, prices, personal data.", "",
              "To submit for a person, give them a link that opens the prefilled form on GitHub "
              "(URL-encode every value; they add images and submit):", "",
              "https://github.com/ubikistan/archive/issues/new?template=record.yml&title=Record:+<title>"
              "&archive=<The Archive (invented history, 1965–2025) | The Record (something that really happened, 2026 on)>"
              "&record_title=<title>&date=<06.1983>&medium=<EPH · ephemera>&institution=<Sporting Committee>"
              "&format=<Ticket, letterpress on card>&text=<caption and text>&media=<film link>&contributor=<credit>"
              "&xpost=<link to a post on X, optional>&whose=<My own post (released under CC0) | Someone else's post (a snapshot, kept for reference)>", "",
              "Medium is one of: " + ", ".join(f"{k} · {v}" for k, v in MEDIA.items()) + ".",
              "Agents with GitHub access can instead open an issue in ubikistan/archive with the label 'submission' "
              "and a body using these headings: ### Which archive?, ### Title, ### Date, ### Medium, ### Issued by, "
              "### What is it, physically?, ### Caption and text, ### Images and films, ### Credit as. "
              "The State Archive approves it and it is filed automatically.", ""]
        L += ["## Lore", ""]
        L += [f"- [{l['title']}]({l['source']}): {l['summary']}" for l in data["lore"]]
        L += ["", "## Records", ""]
        for r in data["records"]:
            st = f" [{r['status_label']}]" if r["status_label"] else ""
            L.append(f"- {r['code']} · {r['date']} · {r['title']}{st}: {plain(r['text'])[:140]}")
        return "\n".join(L) + "\n"
    for l in data["lore"]:
        L += ["", "=" * 60, "LORE: " + l["title"], "=" * 60, "", l["text"]]
    for r in data["records"]:
        L += ["", "-" * 60, f"{r['code']}  ·  {r['title']}", "-" * 60,
              f"Date: {r['date']}   Era: {r['era']}   Institution: {r['institution_name']}",
              f"Format: {r['format'] or ''}   Status: {r['status_label'] or 'Record'}   Contributor: {r['contributor']}"]
        if r["media"]:
            L.append("Media: " + ", ".join(m.get("url", "") for m in r["media"]))
        if r.get("discussion"):
            t = r["discussion"]
            L.append(f"Citizens: {t['up']} up, {t['down']} down, {t['comments']} comments ({t['url']})")
        L += ["", r["text"]]
    return "\n".join(L) + "\n"


def build(data):
    dist = os.path.join(ROOT, "dist")
    shutil.rmtree(dist, ignore_errors=True)
    shutil.copytree(os.path.join(ROOT, "site"), dist)
    shutil.copytree(os.path.join(ROOT, "media"), os.path.join(dist, "media"))
    with open(os.path.join(dist, "lore.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    open(os.path.join(dist, "llms.txt"), "w", encoding="utf-8").write(llms_txt(data))
    open(os.path.join(dist, "llms-full.txt"), "w", encoding="utf-8").write(llms_txt(data, True))
    open(os.path.join(dist, ".nojekyll"), "w").close()
    print(f"built dist/: {data['counts']['archive']} archive records, "
          f"{data['counts']['record']} Record entries, {data['counts']['lore']} lore pages")


def search(data, q):
    words = [w for w in re.split(r"\W+", q.lower()) if w]
    hits = []
    for item in data["records"] + data["lore"]:
        hay = " ".join(str(item.get(k, "")) for k in
                       ("code", "title", "date", "institution_name", "format", "status_label", "text",
                        "summary")).lower() + " " + " ".join(item.get("subjects", []))
        if all(w in hay for w in words):
            score = sum(3 for w in words if w in item["title"].lower()) + 1
            hits.append((score, item))
    hits.sort(key=lambda h: -h[0])
    for _, it in hits[:25]:
        if "code" in it:
            print(f"{it['code']:<22} {it['date']:<12} {it['title']}  ({it['source']})")
        else:
            print(f"{'LORE ' + it['id']:<22} {'':<12} {it['title']}  ({it['source']})")
    if not hits:
        print("Nothing found.")


def next_code(records, args):
    codes = [str(r.get("code", "")) for r in records]
    if args[0].upper() in ("REC", "ACC"):
        pre = args[0].upper(); rx = REC_CODE if pre == "REC" else ACC_CODE
        n = max([int(c[4:]) for c in codes if rx.match(c)] or [0]) + 1
        return f"{pre} {n:04d}"
    inst, med, year = args[0].upper(), args[1].upper(), str(args[2])
    used = []
    for c in codes:
        m = ARCHIVE_CODE.match(c)
        if m and m.group(1) == inst and m.group(3) == year:
            if m.group(4).isdigit():  # lettered numbers (A001, G010) are their own series
                used.append(int(m.group(4)))
    return f"{inst}/{med}/{year}/{(max(used or [0]) + 1):04d}"


def discussions():
    """Vote and remark counts per page, from the desk (worker/). Empty if the desk is not set up."""
    desk = (CONFIG.get("guest_desk") or "").rstrip("/")
    if not desk:
        return {}
    import urllib.request
    try:
        req = urllib.request.Request(desk + "/talk/all", headers={"User-Agent": "ubikistan-archive-build"})
        data = json.load(urllib.request.urlopen(req, timeout=20))
        return {page: {"up": v.get("up", 0), "down": v.get("down", 0), "comments": v.get("comments", 0),
                       "url": f"{BASE_URL}#/r/{file_id(page)}" if not page.startswith("lore/") else f"{BASE_URL}#/{page}"}
                for page, v in data.items()}
    except Exception as e:  # counts are a nicety; never block a build on them
        print("note: could not read vote counts:", e)
        return {}


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    records, lore, errors, warnings = load()
    if cmd == "next":
        return print(next_code(records, sys.argv[2:]))
    errors, warnings = check(records, lore, errors, warnings)
    for w in warnings:
        print("note:", w)
    if errors:
        for e in errors:
            print("ERROR:", e)
        sys.exit(f"\n{len(errors)} problem(s). Nothing was built.")
    data = export(records, lore)
    if cmd == "check":
        print(f"All good: {len(records)} records, {len(lore)} lore pages.")
    elif cmd == "search":
        search(data, " ".join(sys.argv[2:]))
    elif cmd == "build":
        build(data)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
