#!/usr/bin/env python3
"""MOTH, the agent office that finds forgotten cultural material (lore/civil-service.md), run as software.

MOTH reads the whole archive, looks for gaps (thin years, institutions with no objects, people on file with open
questions, branches that stop, disputes nobody followed up, what citizens are building now), drafts a handful of
Archive records to sit in them, has a second pass judge every draft against the archive's rules, and files the few
that survive as FOLK (apocrypha), credited to "MOTH (agent)". The State Archive reviews them as a pull request
(.github/workflows/moth.yml): merge, edit or close. Closed pull requests are read back on the next run as refusals.

  python3 tools/moth.py --gaps        print the gap report and stop (no API call)
  python3 tools/moth.py --dry         draft and judge, print the finds, write nothing
  python3 tools/moth.py               draft, judge and write the finds into records/archive/
  python3 tools/moth.py --n 2         keep at most two finds (default 3)

Needs dist/lore.json and dist/llms-full.txt (python3 tools/build.py build) and ANTHROPIC_API_KEY.
Optional: MOTH_MODEL (default claude-opus-5-5), MOTH_HISTORY (a JSON list of earlier MOTH pull requests, from gh),
MOTH_OUT (where the pull request text goes, default /tmp/moth).
Text only: MOTH writes no images. Each find carries an image brief in the pull request for later.
"""
import argparse, collections, datetime as dt, json, os, re, subprocess, sys, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import build  # noqa: E402  the archive's own institutions, media, eras and numbering

MODEL = os.environ.get("MOTH_MODEL", "claude-opus-5-5")
CONTRIBUTOR = "MOTH (agent)"
TAG = "moth"
FIRST, LAST = 1965, 2025
DELIBERATE = {1985: "1985 is missing on purpose (lore/the-arc.md). Write around it, never close it."}
# words that never appear in a find: price talk, the reserved aerosol, the forecast desk's vocabulary
BANNED = re.compile(r"\$[A-Z]|\b(token price|price target|airdrop|to the moon|pump|financial advice|aerosol|spray can|"
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


def history():
    """Earlier MOTH pull requests: merged were accepted, closed without merging were refused, open still wait."""
    p = os.environ.get("MOTH_HISTORY")
    if not p or not os.path.exists(p):
        return []
    try:
        rows = json.load(open(p, encoding="utf-8"))
    except Exception:
        return []
    out = []
    for r in rows:
        state = "accepted" if r.get("mergedAt") else ("refused" if (r.get("state") or "").upper() == "CLOSED" else "waiting")
        titles = re.findall(r"^### (.+)$", r.get("body") or "", re.M)
        out.append({"pull_request": r.get("number"), "state": state, "finds": titles})
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
            "built_lately": now, "earlier_moth_runs": history(), "outside_this_fortnight": settled_outside()}


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
- At most one find may rhyme with something in "outside_this_fortnight", transposed into the Republic's own past and
  its own institutions and people. Never name that real event, or anyone or any company in it.
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

Write {k} candidates. Return JSON only:
{{"finds": [{{
  "gap": "which gap this answers, one line, naming it as the report does",
  "test": "which of the five tests it meets",
  "institution": "one code from the report", "medium": "one media code", "year": 1979, "date": "1979" or "06.1979" or "12.06.1979",
  "title": "catalogue title, sentence case", "format": "what the object physically is, e.g. Duplicated memo, two sheets, stapled",
  "subjects": ["ubik" and/or "aixbt" only if they are in it, or a person-on-file id], "related": ["existing codes only"],
  "lore": ["existing lore page file names only"], "tags": ["free, lowercase, hyphenated"],
  "contradicts": "code it contradicts, or null",
  "caption": "one line", "body": "the paragraphs after the caption, markdown, no headings",
  "image_brief": "for a later photograph of the object: flat on a grey card, what is visible, wear, colours; no people's faces"
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
A find that contradicts canon is fine if it says so plainly.

You may repair a find that is nearly right: return only the fields you change, with the full new text for each.
Return JSON only:
{"verdicts": [{"i": 0, "keep": true, "score": 8, "reason": "one plain sentence", "fix": {"body": "..."}}]}

FINDS:
"""


def ask(world, prompt, max_tokens=16000):
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        sys.exit("MOTH needs ANTHROPIC_API_KEY")
    body = {"model": MODEL, "max_tokens": max_tokens,
            # the archive is the same for both calls, so it is cached after the first
            "system": [{"type": "text", "text": "THE ARCHIVE OF THE REPUBLIC OF UBIKISTAN, AS IT STANDS:\n\n" + world,
                        "cache_control": {"type": "ephemeral"}}],
            "messages": [{"role": "user", "content": prompt}]}
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
    text = "".join(b.get("text", "") for b in out.get("content", []) if b.get("type") == "text")
    return json.loads(text[text.find("{"): text.rfind("}") + 1])


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
    lines = ["---", f"code: {code}", f"title: {q(f['title'])}", f"date: {q(f['date'])}", f"year: {f['year']}",
             f"institution: {f['institution']}", f"medium: {f['medium']}", f"format: {q(f['format'])}", "status: FOLK"]
    for k in ("subjects", "related", "lore", "tags"):
        if f.get(k):
            lines.append(f"{k}: [{', '.join(f[k])}]")
    lines += [f"contributor: {q(CONTRIBUTOR)}", f"added: {today}", "---", "",
              f["caption"].strip(), "", f["body"].strip(), ""]
    open(path, "w", encoding="utf-8").write("\n".join(lines))
    return code, os.path.relpath(path, ROOT)


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
            paths.remove(p)
    return paths


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=3)
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--gaps", action="store_true")
    a = ap.parse_args()
    data, world = load_world()
    report = gaps(data)
    if a.gaps:
        return print(json.dumps(report, ensure_ascii=False, indent=1))
    k = max(4, a.n * 2)
    print(f"MOTH: drafting {k} finds")
    drafts = ask(world, BRIEF.format(k=k) + json.dumps(report, ensure_ascii=False)).get("finds", [])
    print(f"MOTH: judging {len(drafts)}")
    verdicts = ask(world, JUDGE + json.dumps([{"i": i, **d} for i, d in enumerate(drafts)], ensure_ascii=False),
                   max_tokens=12000).get("verdicts", [])
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
    kept, years = [], set()
    for why, f in sorted(judged, key=lambda x: -(x[1]["verdict"]["score"] or 0)):
        if why is None and f["year"] // 10 not in years and len(kept) < a.n:
            kept.append(f)
            years.add(f["year"] // 10)
        else:
            print(f"  cut: {f.get('title')}: {why or 'another find from the same decade scored higher, or enough were kept'}")
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
    if not filed:
        print("MOTH: nothing survived this time")
        return
    title = f"MOTH: {len(filed)} find{'s' if len(filed) > 1 else ''}, {today}"
    body = ["Found by MOTH, the agent office that finds forgotten cultural material. Filed as FOLK (apocrypha), "
            f"credited to {CONTRIBUTOR}, text only.", "",
            "Merge what you want kept. Edit a file in this pull request to change it, or delete a file to drop one "
            "find. Close the pull request to refuse them all; MOTH reads refusals on its next run.", ""]
    for f, code, path in filed:
        body += [f"### {code}: {f['title']}", "",
                 f"*{f['caption'].strip()}*", "",
                 f"- Gap: {f.get('gap')}", f"- Test: {f.get('test')}",
                 f"- Contradicts: {f.get('contradicts') or 'nothing'}",
                 f"- Reader: {f['verdict']['score']}/10, {f['verdict']['reason']}",
                 f"- Image brief, for later: {f.get('image_brief')}", f"- File: `{path}`", ""]
    open(os.path.join(out, "pr.md"), "w", encoding="utf-8").write(title + "\n\n" + "\n".join(body))
    open(os.path.join(out, "commit.txt"), "w", encoding="utf-8").write(
        title + "\n\n" + "\n".join(f"{c}: {f['title']}" for f, c, _ in filed) + "\n")
    print(f"MOTH: filed {len(filed)}: " + ", ".join(c for _, c, _ in filed))


if __name__ == "__main__":
    main()
