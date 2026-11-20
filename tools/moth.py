#!/usr/bin/env python3
"""MOTH, the agent office that finds forgotten cultural material (lore/civil-service.md), run as software.

MOTH reads the whole archive, looks for gaps (thin years, institutions with no objects, people on file with open
questions, branches that stop, disputes nobody followed up, what citizens are building now), drafts a handful of
Archive records to sit in them, has a second pass judge every draft against the archive's rules, and files the few
that survive as FOLK (apocrypha), credited to "MOTH (agent)". With FAL_KEY each find gets a photograph of the object
(fal, openai/gpt-image-2), looked over by Claude before it is kept; a rejected picture is drawn once more, then left out.

With --publish (.github/workflows/moth.yml) the finds go live at once, marked Under review: each gets a submission
issue (labels moth, under-review, then submission), so the State Archive keeps or takes it down on the site at
#/review, exactly as with citizens' submissions. Taken-down finds are read back on the next run as refusals.
Without --publish, the workflow-less path writes a pull request text to MOTH_OUT instead.

  python3 tools/moth.py --gaps        print the gap report and stop (no API call)
  python3 tools/moth.py --dry         draft and judge, print the finds, write nothing
  python3 tools/moth.py               draft, judge and write the finds into records/archive/
  python3 tools/moth.py --n 2         keep at most two finds (default 3)
  python3 tools/moth.py --publish     also open the review issues and mark the finds under review (needs GH_TOKEN)

Needs dist/lore.json and dist/llms-full.txt (python3 tools/build.py build) and ANTHROPIC_API_KEY.
Optional: FAL_KEY (pictures), MOTH_MODEL (default claude-opus-5-5), MOTH_IMAGE_MODEL (default openai/gpt-image-2),
MOTH_HISTORY and MOTH_ISSUES (JSON lists of earlier MOTH pull requests and issues, from gh), MOTH_OUT (default /tmp/moth),
GH_TOKEN and GITHUB_REPOSITORY (for --publish).
"""
import argparse, base64, collections, datetime as dt, json, os, re, subprocess, sys, time, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import build  # noqa: E402  the archive's own institutions, media, eras and numbering

MODEL = os.environ.get("MOTH_MODEL", "claude-opus-5-5")
IMAGE_MODEL = os.environ.get("MOTH_IMAGE_MODEL", "openai/gpt-image-2")
SITE = "https://ubikistan.github.io/archive/"
CONTRIBUTOR = "MOTH (agent)"
TAG = "moth"
FIRST, LAST = 1965, 2025
DELIBERATE = {1985: "1985 is missing on purpose (lore/the-arc.md). Write around it, never close it."}
# words that never appear in a find: price talk, the reserved aerosol, the forecast desk's vocabulary
BANNED = re.compile(r"\$[A-Z]|\b(token price|price target|airdrop|to the moon|pump and dump|financial advice|aerosol|spray can|"
                    r"spray bottle|cleaning product|odds|betting|wager)\b", re.I)


# ---------------------------------------------------------------- what is there, and what is missing

def load_world():
    p = os.path.join(ROOT, "dist", "lore.json")
    if not os.path.exists(p):
        sys.exit("no dist/lore.json: run python3 tools/build.py build first")
    data = json.load(open(p, encoding="utf-8"))
    text = open(os.path.join(ROOT, "dist", "llms-full.txt"), encoding="utf-8").read()
    return data, text


def era_of(year):
    for e in build.ERAS:
        if e[2] <= year <= e[3]:
            return e[0]
    return None


def settled_outside(days=14):
    """What UBIK settled lately: the outside world, for at most one find to rhyme with. Public, no key needed."""
    try:
        req = urllib.request.Request("https://api.ubik.gold/forecasts?status=settled&per_page=40",
                                     headers={"User-Agent": "ubikistan-moth", "Accept": "application/json"})
        rows = json.load(urllib.request.urlopen(req, timeout=20)).get("data", [])
    except Exception as e:
        print("note: could not read settled forecasts:", type(e).__name__)
        return []
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)).date().isoformat()
    return [{"question": r.get("claim"), "outcome": r.get("outcome")} for r in rows
            if (r.get("resolved_at") or "")[:10] >= since][:12]


def _rows(env):
    p = os.environ.get(env)
    try:
        return json.load(open(p, encoding="utf-8")) if p and os.path.exists(p) else []
    except Exception:
        return []


def forecast_desk(n=15):
    """What UBIK is asking about now: the questions only, never figures. Public."""
    try:
        req = urllib.request.Request("https://api.ubik.gold/forecasts?status=open&per_page=60",
                                     headers={"User-Agent": "ubikistan-moth", "Accept": "application/json"})
        rows = json.load(urllib.request.urlopen(req, timeout=20)).get("data", [])
    except Exception as e:
        print("note: could not read open forecasts:", type(e).__name__)
        return []
    return [{"question": r.get("claim"), "theme": ", ".join(c.get("name", "") for c in r.get("categories") or []),
             "deadline": r.get("deadline")} for r in rows][:n]


def sources():
    """Other material MOTH reads beside the archive (tools/moth_sources.md): what is being built around it."""
    p = os.path.join(ROOT, "tools", "moth_sources.md")
    return open(p, encoding="utf-8").read() if os.path.exists(p) else ""


def history():
    """Earlier finds and what the State Archive did with them: accepted, refused (taken down or closed) or waiting."""
    out = []
    for r in _rows("MOTH_HISTORY"):          # pull requests, the first way MOTH proposed
        state = "accepted" if r.get("mergedAt") else ("refused" if (r.get("state") or "").upper() == "CLOSED" else "waiting")
        out.append({"state": state, "finds": re.findall(r"^### (.+)$", r.get("body") or "", re.M)})
    for r in _rows("MOTH_ISSUES"):           # review issues, one per find
        labels = {(l.get("name") if isinstance(l, dict) else l) for l in r.get("labels") or []}
        state = "accepted" if "approved" in labels else "refused" if "declined" in labels else "waiting"
        out.append({"state": state, "finds": [re.sub(r"^Record: ", "", r.get("title") or "")]})
    return out


def gaps(data):
    recs = [r for r in data["records"] if r["kind"] == "archive"]
    years = collections.Counter(int(r["year"]) for r in recs if r.get("year"))
    thin = [{"year": y, "records": years.get(y, 0), **({"note": DELIBERATE[y]} if y in DELIBERATE else {})}
            for y in range(FIRST, LAST + 1) if years.get(y, 0) <= 1]
    eras = {e[0]: f"{e[1]} ({e[2]}–{e[3]})" for e in build.ERAS if e[2] <= LAST}
    grid = collections.defaultdict(collections.Counter)
    media = collections.defaultdict(collections.Counter)
    for r in recs:
        e = era_of(int(r["year"])) if r.get("year") else None
        if e:
            grid[e][r.get("institution")] += 1
            media[e][r.get("medium")] += 1
    inst_by_era = {eras[e]: {i: grid[e].get(i, 0) for i in build.INSTITUTIONS} for e in eras}
    media_by_era = {eras[e]: {m: media[e].get(m, 0) for m in build.MEDIA} for e in eras}
    people = [{"id": c["id"], "name": c["name"], "years": c.get("years"), "records": len(c.get("appears_in") or []),
               "open_questions": c.get("open") or []} for c in data.get("characters", [])]
    people.sort(key=lambda c: c["records"])
    branches = [{"id": b["id"], "title": b["title"], "years": b.get("years"), "records": len(b.get("records") or []),
                 "summary": b.get("summary")} for b in data.get("branches", [])]
    branches.sort(key=lambda b: b["records"])
    disputed = [{"code": r["code"], "title": r["title"]} for r in recs if r.get("status") == "DISPUTED"]
    newest = sorted(data["records"], key=lambda r: str(r.get("added") or ""))[-15:]
    now = [{"code": r["code"], "kind": r["kind"], "title": r["title"], "added": r.get("added"),
            "contributor": r.get("contributor")} for r in newest]
    return {"thin_years": thin, "institutions_by_era": inst_by_era, "media_by_era": media_by_era,
            "people_on_file": people, "branches": branches, "disputed_records": disputed,
            "built_lately": now, "earlier_moth_runs": history(), "outside_this_fortnight": settled_outside(),
            "forecast_desk_now": forecast_desk()}


# ---------------------------------------------------------------- asking

BRIEF = """You are MOTH, an agent office of the Republic of Ubikistan. The civil service page gives your duty in one
line: "Finds forgotten cultural material." You now run as real software, and this is your work.

Above is the whole archive as it stands. Below is a gap report. Find {k} pieces of forgotten material that belong in
the gaps, and write each one as an Archive record, in the archive's own voice.

What a good find is:
- One object, dated 1965 to 2025, made by one of the Republic's institutions (codes in the report). Never 2026: that
  year belongs to the State Archive's specimens and the Record.
- It earns its place by one of the five tests in "The collections and their rules": it moves the history on, shows an
  institution for the first time, changes what we know about UBIK or AIXBT, shows ordinary life not shown yet, or
  creates a contradiction worth having. Name the test.
- It sits on the arc ("How the arc is built"): a 1970s object feels like a ministry made it, a 2010s one is barely an
  object. UBIK withdraws from his own pictures over time; AIXBT accumulates offices and is always doing a job, never
  a visionary. The ring is never filled.
- It is messy. Real archives are mostly paperwork: a rota, a carbon copy, a returned form, a receipt, a misfiled
  memo, a label, a correction slip, a stub. Objects are torn, stamped twice, dated only to a year, signed illegibly,
  half-answered. Leave questions open. Do not explain the joke or the meaning. Prefer the ordinary to the dramatic.
- It may contradict canon. If it does, say which record it contradicts, by code, in the text, plainly.
- Use the deliberate gaps (1985, the Assembly that never convenes, the tapes lost after 1991) only by writing around
  them. Never close one.
- Take each find from a different gap and a different decade. Use at least three different media codes.
- Bridge what is being built. Each find ties together at least two of: a thread already in the archive (a record, a
  person on file, a branch), a lore page, a place in the present-day world under OTHER MATERIAL, and what the
  forecast desk is looking at ("forecast_desk_now", "outside_this_fortnight"). The forecast desk is the outside world:
  at most one find may rhyme with one of its questions, transposed into the Republic's own past, institutions and
  people. Never name that real event, or anyone or any company in it, and never give a figure from it.
- Earlier runs: never repeat a find listed there. Refused finds tell you what the State Archive does not want; learn
  from the pattern and do not argue with it.

What is never allowed (the archive's rules):
- No identifiable real person, by name or by likeness, in any role. Use the Republic's own figures from "Figures of
  the Republic", or anonymous staff, or new minor people of the Republic with ordinary names. Real companies and real
  events only as outside context, in text, where the fact is true, and better not at all.
- No prices, tokens, trading, balances, gold or money the Republic does not hold. Old banknotes and coins are fine
  as objects; no Treasury figures.
- No aerosol cans, spray bottles or cleaning products.
- No marketing language, no superlatives, no "it's not X, it's Y", no rhetorical questions, no em-dash asides.

How to write it (the archive's style, "Write like an archivist"): plain, dry, specific. Dates, institutions,
materials, measurements, stamps, folio numbers. The body starts with one line of caption, the way a catalogue would
put it. Then whatever the record needs, in two to five short paragraphs: what it physically is and what is on it
(transcribe printed or typed text where it matters), provenance, what is disputed or missing. You may say once, in a
provenance line, that MOTH found it and where, but vary how or leave it out.

OTHER MATERIAL (made around the archive; use it, do not copy it):
{sources}

Write {k} candidates and file them with the file_finds tool. Each find has these fields:
{{"finds": [{{
  "gap": "which gap this answers, one line, naming it as the report does",
  "test": "which of the five tests it meets",
  "institution": "one code from the report", "medium": "one media code", "year": 1979, "date": "1979" or "06.1979" or "12.06.1979",
  "title": "catalogue title, sentence case", "format": "what the object physically is, e.g. Duplicated memo, two sheets, stapled",
  "subjects": ["ubik" and/or "aixbt" only if they are in it, or a person-on-file id], "related": ["existing codes only"],
  "lore": ["existing lore page file names only"], "tags": ["free, lowercase, hyphenated"],
  "contradicts": "code it contradicts, or null",
  "caption": "one line", "body": "the paragraphs after the caption, markdown, no headings",
  "image_brief": "for the scan of the object: what is on it and where, the words that are legible, wear, colours; no people's faces",
  "alt": "one plain line describing the image for someone who cannot see it",
  "orientation": "portrait", "landscape" or "square", as the object lies
}}]}}

GAP REPORT:
"""

JUDGE = """You are the State Archive's reader, judging finds that MOTH, an agent, proposes for the Archive. The whole
archive is above. Be strict: most finds should not survive. The archive is better with three good records a week than
thirty plausible ones.

For each find decide keep or cut, and give a score from 1 to 10. Cut a find when:
- it names or shows an identifiable real person, or uses a real company or event as more than true outside context;
- it repeats something the archive already holds, or only decorates an event already documented;
- it closes a deliberate gap, makes UBIK more visible over time, or makes AIXBT a visionary;
- it is tidy where an archive is messy: complete, explained, symbolic, a neat answer to an open question;
- it explains its own joke or meaning, uses marketing language, or reads like generated text (stacked adjectives,
  "it's not X, it's Y", rhetorical questions, em-dash asides, triplets, a closing aphorism);
- it mentions prices, tokens, trading, money the Republic does not hold, aerosol cans or cleaning products;
- the institution did not exist in that year, or the date fights the timeline without saying so.
A find that contradicts canon is fine if it says so plainly. Places named under OTHER MATERIAL below (the Field Guide's
places, such as the Ring Estate or the Relay Line) are part of the world even where the archive has not used them yet.

You may repair a find that is nearly right: return only the fields you change, with the full new text for each.
Give the verdicts with the give_verdicts tool, one per find:
{"verdicts": [{"i": 0, "keep": true, "score": 8, "reason": "one plain sentence", "fix": {"body": "..."}}]}

FINDS:
"""


S = {"type": "string"}
LIST = {"type": "array", "items": {"type": "string"}}
FINDS_TOOL = {"name": "file_finds", "description": "File the drafted finds.", "input_schema": {
    "type": "object", "required": ["finds"], "properties": {"finds": {"type": "array", "items": {
        "type": "object",
        "required": ["gap", "test", "institution", "medium", "year", "date", "title", "format", "caption", "body", "image_brief"],
        "properties": {"gap": S, "test": S, "institution": S, "medium": S, "year": {"type": "integer"}, "date": S,
                       "title": S, "format": S, "subjects": LIST, "related": LIST, "lore": LIST, "tags": LIST,
                       "contradicts": {"type": ["string", "null"]}, "caption": S, "body": S, "image_brief": S, "alt": S,
                       "orientation": {"type": "string", "enum": ["portrait", "landscape", "square"]}}}}}}}
VERDICT_TOOL = {"name": "give_verdicts", "description": "Give a verdict on every find.", "input_schema": {
    "type": "object", "required": ["verdicts"], "properties": {"verdicts": {"type": "array", "items": {
        "type": "object", "required": ["i", "keep", "score", "reason"],
        "properties": {"i": {"type": "integer"}, "keep": {"type": "boolean"}, "score": {"type": "integer"}, "reason": S,
                       "fix": {"type": "object", "properties": {"title": S, "caption": S, "body": S, "format": S, "date": S}}}}}}}}


def ask(world, prompt, tool, max_tokens=16000):
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        sys.exit("MOTH needs ANTHROPIC_API_KEY")
    body = {"model": MODEL, "max_tokens": max_tokens,
            # the archive is the same for both calls, so it is cached after the first
            "system": [{"type": "text", "text": "THE ARCHIVE OF THE REPUBLIC OF UBIKISTAN, AS IT STANDS:\n\n" + world,
                        "cache_control": {"type": "ephemeral"}}],
            "messages": [{"role": "user", "content": prompt + f"\n\nAnswer only by calling the {tool['name']} tool."}],
            # answers come back through a tool, so the JSON is always well formed
            # both tools in both calls: the tools sit before the archive in the cache, so they must not change
            "tools": [FINDS_TOOL, VERDICT_TOOL], "tool_choice": {"type": "auto"}}
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=json.dumps(body).encode(), method="POST",
                                 headers={"x-api-key": key, "anthropic-version": "2023-06-01",
                                          "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            out = json.loads(r.read())
    except urllib.error.HTTPError as e:   # the status and the API's message, never the request or the key
        try:
            err = json.loads(e.read()).get("error", {})
        except Exception:
            err = {}
        sys.exit(f"API error {e.code} {err.get('type', '')}: {(err.get('message') or '')[:200]}")
    u = out.get("usage", {})
    print(f"  {MODEL}: {u.get('input_tokens', 0)} in, {u.get('cache_read_input_tokens', 0)} cached, "
          f"{u.get('cache_creation_input_tokens', 0)} cache-written, {u.get('output_tokens', 0)} out")
    for b in out.get("content", []):
        if b.get("type") == "tool_use" and b.get("name") == tool["name"]:
            return b.get("input") or {}
    text = "".join(b.get("text", "") for b in out.get("content", []) if b.get("type") == "text")
    try:   # an answer written out as JSON instead of through the tool
        return json.loads(text[text.find("{"): text.rfind("}") + 1])
    except ValueError:
        sys.exit(f"no usable answer came back (stop reason {out.get('stop_reason')})")


# ---------------------------------------------------------------- pictures

IMAGE = """A flat archival scan of one object held by the State Archive of the Republic of Ubikistan, a small fictional
country. The object: {format}. Dated {date}. Made by the {inst}. Catalogue title: "{title}".

What the scan shows: {brief}

It is a real object scanned flat and straight from above. It fills most of the frame on a plain near-black background
with a narrow, even margin, in soft even light. It is true to {year}: the paper, print, typewriting, ink, stamps, wear
and colour are what an object of that year would have. Any printed, typed or handwritten words are in English, short
and spelt correctly; leave words out rather than invent long passages. If the object is mostly text (a log, a table,
a register), show only a few lines legibly and let the rest be folded under, cropped by the frame or too faint to
read.{extra}

Never show: hands, a desk or a room, a recognisable face, a real company's logo, sums of money or balances, aerosol
cans or spray bottles. If the Republic's emblem appears, it is a red ring around a smaller gold ring, nothing inside."""

LOOK = """This picture was made for the archive record below, as a scan of the object it describes. Look at it closely.
Reject it if any of these is true: it shows a recognisable face or a real person; it shows a real company's logo or
name; its words are garbled, misspelt or nonsense; it contradicts the record (another object, another date, another
institution); it shows money totals, an aerosol can or a spray bottle; it looks like an illustration or a rendering
rather than a scan of a real object; something in it is plainly broken (melted letters, extra fingers, warped stamps).
Answer with JSON only: {"ok": true or false, "reason": "one plain sentence"}

RECORD:
"""


def fal(url, body=None, key=None, timeout=120):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 method="POST" if body is not None else "GET",
                                 headers={"Authorization": f"Key {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def draw(f, extra_note=""):
    """One picture from fal's queue. Returns the image bytes, or None."""
    key = os.environ.get("FAL_KEY", "").strip()
    extra = ""
    if f["medium"] == "PH":
        extra = " It is a photographic print; any people in it are small, distant or seen from behind."
    if extra_note:
        extra += " Earlier attempt was rejected because: " + extra_note + " Avoid that."
    prompt = IMAGE.format(format=f["format"], date=f["date"], inst=build.INSTITUTIONS.get(f["institution"], f["institution"]),
                          title=f["title"], brief=f.get("image_brief") or f["caption"], year=f["year"], extra=extra)
    size = {"portrait": "portrait_4_3", "landscape": "landscape_4_3", "square": "square_hd"}.get(f.get("orientation"), "landscape_4_3")
    try:
        sub = fal(f"https://queue.fal.run/{IMAGE_MODEL}", {"prompt": prompt, "num_images": 1, "image_size": size,
                                                           "quality": "high", "output_format": "jpeg"}, key)
        t0 = time.time()
        while True:
            st = fal(sub["status_url"], None, key).get("status")
            if st == "COMPLETED":
                break
            if st not in ("IN_QUEUE", "IN_PROGRESS") or time.time() - t0 > 600:
                print(f"  picture: fal said {st}")
                return None
            time.sleep(5)
        res = fal(sub["response_url"], None, key)
        with urllib.request.urlopen(res["images"][0]["url"], timeout=120) as r:
            img = r.read()
    except Exception as e:   # the status, never the key
        print(f"  picture failed: {type(e).__name__} {getattr(e, 'code', '')}")
        return None
    if len(img) > 3 * 1024 * 1024:
        print("  picture over 3 MB, left out")
        return None
    return img


def looks_right(f, img):
    """Claude looks at the picture before it is kept."""
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    record = json.dumps({k: f.get(k) for k in ("title", "date", "institution", "format", "caption", "body")}, ensure_ascii=False)
    body = {"model": MODEL, "max_tokens": 400, "messages": [{"role": "user", "content": [
        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(img).decode()}},
        {"type": "text", "text": LOOK + record}]}]}
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=json.dumps(body).encode(), method="POST",
                                 headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            out = json.loads(r.read())
        text = "".join(b.get("text", "") for b in out.get("content", []) if b.get("type") == "text")
        try:
            v = json.loads(text[text.find("{"): text.rfind("}") + 1])
        except ValueError:   # a verdict written as prose around the JSON
            m = re.search(r'"?ok"?\s*[:=]\s*(true|false)', text, re.I)
            if not m:
                return False, "the look-over gave no verdict"
            v = {"ok": m.group(1).lower() == "true", "reason": re.sub(r"\s+", " ", text)[:200]}
        return bool(v.get("ok")), v.get("reason") or ""
    except Exception as e:
        return False, f"the look-over failed ({type(e).__name__})"


def picture(f, file_id):
    """Draw, look, and draw once more if the first is rejected. Returns the media entry, or None."""
    if not os.environ.get("FAL_KEY", "").strip():
        return None
    note = ""
    for attempt in (1, 2):
        img = draw(f, note)
        if img is None:
            return None
        ok, note = looks_right(f, img)
        print(f"  picture {attempt}: {'kept' if ok else 'rejected'}: {note}")
        if ok:
            rel = f"media/{file_id}.jpg"
            open(os.path.join(ROOT, rel), "wb").write(img)
            return {"file": rel, "alt": f.get("alt") or f["caption"]}
    return None


# ---------------------------------------------------------------- publishing

def gh(method, path, body=None):
    req = urllib.request.Request(f"https://api.github.com/repos/{os.environ['GITHUB_REPOSITORY']}{path}",
                                 data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={"Authorization": f"Bearer {os.environ['GH_TOKEN']}",
                                          "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read() or b"{}")


def publish(f, code, path):
    """A review issue for the find, then the record is marked under review and linked to it. Never the 'submission'
    label at opening: that would make the intake file it a second time."""
    rid = build.file_id(code)
    body = "\n".join([
        f"**{code}**, filed by {CONTRIBUTOR} and live on the site, marked Under review: {SITE}#/r/{rid}", "",
        f"> {f['caption'].strip()}", "",
        f"- Gap: {f.get('gap')}", f"- Test: {f.get('test')}", f"- Contradicts: {f.get('contradicts') or 'nothing'}",
        f"- Reader: {f['verdict']['score']}/10, {f['verdict']['reason']}",
        f"- Picture: {'yes' if f.get('_media') else 'none, text only'}", f"- File: `{path}`", "",
        f"Keep it or take it down at {SITE}#/review."])
    issue = gh("POST", "/issues", {"title": f"Record: {f['title']}", "body": body, "labels": [TAG, "under-review"]})
    gh("POST", f"/issues/{issue['number']}/labels", {"labels": ["submission"]})
    full = os.path.join(ROOT, path)
    text = open(full, encoding="utf-8").read()
    text = text.replace(f"contributor: {q(CONTRIBUTOR)}\n",
                        f"submission: {issue['html_url']}\nreview: pending\ncontributor: {q(CONTRIBUTOR)}\n", 1)
    open(full, "w", encoding="utf-8").write(text)
    return issue["html_url"]


# ---------------------------------------------------------------- filing

def clean(f, data):
    """Mechanical checks the model cannot be trusted with. Returns the reason a find fails, or None."""
    codes = {r["code"] for r in data["records"]}
    lore = {p.get("id") or p.get("slug") for p in data.get("lore", [])} | \
           {os.path.splitext(n)[0] for n in os.listdir(os.path.join(ROOT, "lore"))}
    people = {c["id"] for c in data.get("characters", [])} | {"ubik", "aixbt"}
    try:
        f["year"] = int(f.get("year"))
    except (TypeError, ValueError):
        return "no year"
    if not FIRST <= f["year"] <= LAST:
        return f"year {f['year']} is outside the Archive"
    if f.get("institution") not in build.INSTITUTIONS:
        return f"institution {f.get('institution')} is not in lore/codes.md"
    if f.get("medium") not in build.MEDIA:
        return f"medium {f.get('medium')} is not a media code"
    d = str(f.get("date") or f["year"])
    if not re.fullmatch(r"(\d{2}\.){0,2}\d{4}", d) or not d.endswith(str(f["year"])):
        d = str(f["year"])
    f["date"] = d
    for k in ("title", "caption", "body", "format"):
        if not str(f.get(k) or "").strip():
            return f"no {k}"
    text = " ".join(str(f.get(k) or "") for k in ("title", "caption", "body", "format"))
    if BANNED.search(text):
        return f"uses a word the archive does not allow ({BANNED.search(text).group(0)})"
    if f["body"].strip().startswith(f["caption"].strip()):   # the caption is written once, above the body
        f["body"] = f["body"].strip()[len(f["caption"].strip()):].lstrip()
    for k in ("title", "caption", "body", "format"):   # no em-dash asides
        f[k] = str(f[k]).replace(" — ", ", ").replace("—", ", ")
    f["related"] = [c for c in (f.get("related") or []) if c in codes]
    f["lore"] = [p for p in (f.get("lore") or []) if p in lore]
    f["subjects"] = [s for s in (f.get("subjects") or []) if s in people]
    f["tags"] = sorted({re.sub(r"[^a-z0-9-]", "", str(t).lower().replace(" ", "-")) for t in (f.get("tags") or [])} - {""} | {TAG})
    return None


def q(s):
    return json.dumps(str(s), ensure_ascii=False)


def write(f, data, today):
    records, _, _, _ = build.load()   # fresh each time, so two finds in one year get consecutive numbers
    code = build.next_code(records, [f["institution"], f["medium"], str(f["year"])])
    path = os.path.join(ROOT, "records", "archive", str(f["year"]), build.file_id(code) + ".md")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    f["_media"] = picture(f, build.file_id(code))
    lines = ["---", f"code: {code}", f"title: {q(f['title'])}", f"date: {q(f['date'])}", f"year: {f['year']}",
             f"institution: {f['institution']}", f"medium: {f['medium']}", f"format: {q(f['format'])}", "status: FOLK"]
    if f["_media"]:
        lines += ["media:", f"  - file: {f['_media']['file']}", "    type: image", f"    alt: {q(f['_media']['alt'])}"]
    for k in ("subjects", "related", "lore", "tags"):
        if f.get(k):
            lines.append(f"{k}: [{', '.join(f[k])}]")
    lines += [f"contributor: {q(CONTRIBUTOR)}", f"added: {today}", "---", "",
              f["caption"].strip(), "", f["body"].strip(), ""]
    open(path, "w", encoding="utf-8").write("\n".join(lines))
    return code, os.path.relpath(path, ROOT)


RUNS = os.path.join(ROOT, "tools", "moth-runs.json")


def log_run(drafted, filed, cut):
    """Every run, kept for the site's MOTH page (#/moth): what was filed, and what was thrown away and why."""
    try:
        runs = json.load(open(RUNS, encoding="utf-8"))
    except Exception:
        runs = []
    now = dt.datetime.now(dt.timezone.utc)
    runs.append({"date": now.date().isoformat(), "time": now.strftime("%H:%M"), "drafted": drafted, "filed": filed, "cut": cut})
    json.dump(runs[-120:], open(RUNS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def check_and_prune(paths):
    """Run the archive's own checker; a find that breaks it is removed, not fixed."""
    for _ in range(len(paths) + 1):
        out = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build.py"), "check"],
                             capture_output=True, text=True, cwd=ROOT)
        bad = [p for p in paths if p in out.stdout + out.stderr and "ERROR" in out.stdout + out.stderr]
        if out.returncode == 0:
            return paths
        if not bad:
            sys.exit("the archive check fails for a reason MOTH did not cause:\n" + out.stdout[-2000:])
        for p in bad:
            print("  removed, fails the check:", p)
            os.remove(os.path.join(ROOT, p))
            img = os.path.join(ROOT, "media", os.path.splitext(os.path.basename(p))[0] + ".jpg")
            if os.path.exists(img):
                os.remove(img)
            paths.remove(p)
    return paths


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=3)
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--gaps", action="store_true")
    ap.add_argument("--publish", action="store_true")
    a = ap.parse_args()
    data, world = load_world()
    report = gaps(data)
    if a.gaps:
        return print(json.dumps(report, ensure_ascii=False, indent=1))
    k = max(4, a.n * 2)
    print(f"MOTH: drafting {k} finds")
    drafts = ask(world, BRIEF.format(k=k, sources=sources() or "none yet") + json.dumps(report, ensure_ascii=False), FINDS_TOOL).get("finds", [])
    print(f"MOTH: judging {len(drafts)}")
    verdicts = ask(world, JUDGE.replace("FINDS:\n", "OTHER MATERIAL:\n" + (sources() or "none") + "\n\nFINDS:\n") + json.dumps([{"i": i, **d} for i, d in enumerate(drafts)], ensure_ascii=False),
                   VERDICT_TOOL, max_tokens=12000).get("verdicts", [])
    judged = []
    for v in verdicts:
        try:
            f = dict(drafts[int(v["i"])])
        except (KeyError, ValueError, IndexError, TypeError):
            continue
        for key_, val in (v.get("fix") or {}).items():
            if key_ in f:
                f[key_] = val
        f["verdict"] = {"keep": bool(v.get("keep")), "score": v.get("score") or 0, "reason": v.get("reason")}
        why = clean(f, data) if f["verdict"]["keep"] else "cut by the reader: " + (v.get("reason") or "")
        if why is None and (f["verdict"]["score"] or 0) < 7:
            why = f"scored {f['verdict']['score']}, under 7: {v.get('reason')}"
        judged.append((why, f))
    kept, years, cuts = [], set(), []
    for why, f in sorted(judged, key=lambda x: -(x[1]["verdict"]["score"] or 0)):
        if why is None and f["year"] // 10 not in years and len(kept) < a.n:
            kept.append(f)
            years.add(f["year"] // 10)
        else:
            why = why or "another find from the same decade scored higher, or enough were kept"
            print(f"  cut: {f.get('title')}: {why}")
            cuts.append({"title": f.get("title"), "why": why})
    if a.dry:
        for f in kept:
            print("\n" + json.dumps(f, ensure_ascii=False, indent=1))
        return
    today = dt.date.today().isoformat()
    filed = [(f, *write(f, data, today)) for f in kept]
    alive = set(check_and_prune([p for _, _, p in filed]))
    filed = [x for x in filed if x[2] in alive]
    out = os.environ.get("MOTH_OUT", "/tmp/moth")
    os.makedirs(out, exist_ok=True)
    log_run(len(drafts), [{"code": c, "gap": f.get("gap"), "test": f.get("test"), "contradicts": f.get("contradicts"),
                           "picture": bool(f.get("_media")), "reader": f"{f['verdict']['score']}/10, {f['verdict']['reason']}"}
                          for f, c, _ in filed], cuts)
    if not filed:
        open(os.path.join(out, "commit.txt"), "w", encoding="utf-8").write(f"MOTH: nothing survived, {today}\n")
        print("MOTH: nothing survived this time")
        return
    title = f"MOTH: {len(filed)} find{'s' if len(filed) > 1 else ''}, {today}"
    if a.publish:
        lines = []
        for f, code, path in filed:
            url = publish(f, code, path)
            lines.append(f"{code}: {f['title']} ({'picture' if f.get('_media') else 'text only'}) {url}")
        check_and_prune([p for _, _, p in filed])
        open(os.path.join(out, "commit.txt"), "w", encoding="utf-8").write(title + "\n\n" + "\n".join(lines) + "\n")
        print(f"MOTH: published {len(filed)} under review: " + ", ".join(c for _, c, _ in filed))
        return
    body = ["Found by MOTH, the agent office that finds forgotten cultural material. Filed as FOLK (apocrypha), "
            f"credited to {CONTRIBUTOR}.", "",
            "Merge what you want kept. Edit a file in this pull request to change it, or delete a file to drop one "
            "find. Close the pull request to refuse them all; MOTH reads refusals on its next run.", ""]
    for f, code, path in filed:
        body += [f"### {code}: {f['title']}", "",
                 f"*{f['caption'].strip()}*", "",
                 f"- Gap: {f.get('gap')}", f"- Test: {f.get('test')}",
                 f"- Contradicts: {f.get('contradicts') or 'nothing'}",
                 f"- Reader: {f['verdict']['score']}/10, {f['verdict']['reason']}",
                 f"- Picture: {'yes' if f.get('_media') else 'none'}; brief: {f.get('image_brief')}", f"- File: `{path}`", ""]
    open(os.path.join(out, "pr.md"), "w", encoding="utf-8").write(title + "\n\n" + "\n".join(body))
    open(os.path.join(out, "commit.txt"), "w", encoding="utf-8").write(
        title + "\n\n" + "\n".join(f"{c}: {f['title']}" for f, c, _ in filed) + "\n")
    print(f"MOTH: filed {len(filed)}: " + ", ".join(c for _, c, _ in filed))


if __name__ == "__main__":
    main()
