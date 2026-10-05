# The Archive of the Republic of Ubikistan

This repository is the lore and history of Ubikistan, a fictional republic founded on 17 March 1966. People and agents read it, search it and add to it. It is published at https://ubikistan.github.io/archive/ and everything in it is free to copy (CC0).

If you are an AI assistant working in this repository, this file tells you how. Read it fully before you add or change anything.

## What is where

```
lore/                     how the Republic works: rules, eras, timeline, people, institutions
records/archive/<year>/   invented history, 1965–2025, one Markdown file per object
records/record/           real events from 30.09.2026 on (REC 0001, REC 0002 …)
records/culture/          citizen work: films, images, merch, music, writing (ACC 0001 …)
media/                    images and small files, named after the record's code
tools/build.py            checks, searches and builds everything
site/                     the public search site (built into dist/, never edit dist/)
```

Start with `lore/rules.md`, `lore/the-arc.md`, `lore/codes.md`, `lore/eras.md` and `lore/timeline.md`. Pages with `section: handbook` (rules, the-arc, editing) are the contributors' handbook, shown on the site under Handbook; the rest are in-world lore that a citizen of Ubikistan could read.

Fields beyond the templates below: `collection:` (state-post, insignia, station-6 or currency: kept beside the main history, shown under Collections), `ephemera: true` (Culture: a post or meme rather than a work), `access: restricted` (shown only in the State Terminal), `source:` (a snapshot of a post on X; exported in `lore.json` as `origin`), `submission:` (the issue it came from). `lore.json` carries `schema: 1`; fields are only ever added.

## Answering questions about Ubikistan

Search before you answer, and answer from the files, not from memory:

```
python3 tools/build.py search aixbt border
```

Quote archive codes (`BSV/PH/1972/0007`) and REC numbers when you cite something. If the archive does not say, say that it does not say. Do not fill gaps with invention unless the person asks you to write new lore.

Outside this repository the whole archive is also at https://ubikistan.github.io/archive/lore.json and, as plain text, https://ubikistan.github.io/archive/llms-full.txt.

## The rules of the archive

1. **Four collections.** The **Archive** (`records/archive/`) is what Ubikistan says happened, 1965 to 2025: fiction, written straight, as a real state archive would. **Specimens** are proposed state objects dated 2026 (forms, certificates, screens, demonstration photographs of institutions that do not exist yet), kept in `records/archive/2026/` with `status: SPECIMEN`; only the State Archive files them. The **Record** (`records/record/`) is what actually happens, from 30 September 2026: real films, real events, real work. **Culture** (`records/culture/`) is what citizens make now, credited to them, with no status. No invented event ever gets a REC number. No real event ever gets an archive code. Citizen apocrypha dated 2026 may also go in the Archive as `FOLK`.
2. **Everything new in the Archive enters as `FOLK`** (shown as APOCRYPHA). Only the State Archive (contributor `Headroom`) sets `PROBABLE`, `DISPUTED`, `CANON` or `SPECIMEN`. The names "Headroom" and "State Archive" are reserved; never credit a contribution to them unless you are working for the State Archive itself.
3. **Contradictions are allowed.** If a new record contradicts canon, it is still welcome as apocrypha. Say what it contradicts in the text.
4. **The Republic may reference real history but never fabricates evidence of real people.** Real people, companies and events may appear only as documented outside context, in text, and only where the fact is real (see `lore/the-world-outside.md`). No photographs, meetings, quotations, correspondence or endorsements involving identifiable real people, by name or by likeness. Ubikistan's own encounters are with its own people (see `lore/figures.md`), who have their own faces and histories and are not thin stand-ins for anyone real. The state borrows history, formats and atmosphere, never faces.
5. **The ring is the primary symbol.** Do not introduce aerosol cans, spray bottles or cleaning products as UBIK imagery. The PKD aerosol can is reserved for at most two planned apocrypha records (see `lore/the-arc.md`); none is catalogued yet.
6. **Culture before coin.** No token prices, price predictions or financial advice anywhere in the archive. The Treasury is boringly truthful: nothing shows money, gold or balances the Republic does not hold. The Archive may be wrong; the ledger may not.
7. **Earn the place.** A new Archive object must move the history on, show a new institution, change what we know about UBIK or AIXBT, show ordinary life not shown yet, or create a real contradiction. Otherwise it goes in a collection or is not filed.
8. **Write like an archivist.** Plain, dry, specific. Dates, institutions, materials. One line of caption, then whatever the record needs. No marketing language, no explanations of the joke.
9. **Respect contributors.** Use the name or handle the person gives as `contributor`. Never put an email address, real name the person did not offer, or other personal data in a record.

## Adding a record

Do this when someone asks you to add something to the archive: a photo, a scan, a story, a document, a film.

1. **Decide which archive it belongs to.** Invented history set between 1965 and 2025 goes in the Archive. Something that really happened from 2026 on goes in the Record. If unsure, ask.
2. **Get the code.** For the Archive, pick the institution and medium from `lore/codes.md`, then ask the checker for the next free number:
   ```
   python3 tools/build.py next SPC EPH 1983     # prints e.g. SPC/EPH/1983/0007
   python3 tools/build.py next REC              # prints e.g. REC 0006
   ```
   A new institution is allowed if the story needs one. Add it to `lore/codes.md` in the same change.
3. **Save the media.** Copy images into `media/`, named after the code with `/` turned into `-`: `media/SPC-EPH-1983-0007.jpg`. For several files add a suffix: `-2`, `-back`. Keep images under 3 MB (resize if needed; JPEG at 1600 px on the long side is plenty). Films do not go in the repository: upload them to the Internet Archive (archive.org) and link them with `url`.
4. **Write the record file** at `records/archive/<year>/<CODE>.md` (or `records/record/REC-0006.md`), using the template below.
5. **Check it:** `python3 tools/build.py check`. Fix every ERROR it prints. Notes are advice.
6. **Propose it.** Contributions arrive as pull requests, which the State Archive reviews:
   - If the GitHub CLI (`gh`) is available and the person is signed in: `gh repo fork --remote`, create a branch named after the code, commit with a message like `Add SPC/EPH/1983/0007: Spectator ticket, Tour of the Plain 1983`, push, and `gh pr create`. Put the record's title and one line about it in the pull request.
   - If not, submit it as an issue instead: `gh issue create --repo ubikistan/archive --label submission --title "Record: <title>" --body-file <file>`, where the body uses the headings of the submission form (`### Which archive?`, `### Title`, `### Date`, `### Medium`, `### Issued by`, `### What is it, physically?`, `### Caption and text`, `### Images and films`, `### Credit as`). The State Archive approves it and a workflow files it.
   - With no GitHub access at all, give the person the prefilled form link described in https://ubikistan.github.io/archive/llms.txt, or point them to https://ubikistan.github.io/archive/#/add.
   - Never push directly to `main` unless you are working for the State Archive itself.

### Template: Archive record

```markdown
---
code: SPC/EPH/1983/0007
title: "Spectator ticket, Tour of the Plain 1983"
date: "06.1983"                  # as precise as known: "1983", "06.1983" or "12.06.1983"
year: 1983
institution: SPC
medium: EPH
format: "Ticket, letterpress on card"   # what the object physically is
status: FOLK
media:
  - file: media/SPC-EPH-1983-0007.jpg
    type: image                  # image | video | audio | document
    alt: "A pale green ticket with a punched corner"
subjects: [aixbt]                # optional: ubik, aixbt, or other recurring subjects
related: [SPC/POS/1982/0004]     # optional: codes of related records
lore: [sport]                    # optional: lore pages this belongs to (file names in lore/)
tags: [tour-of-the-plain]        # optional, free
contributor: "your-handle"
added: 2026-10-04
---

One line of caption, the way a catalogue would put it.

Anything else the record needs: provenance, what is disputed about it, who found it.
```

### Template: Record entry

```markdown
---
code: REC 0006
title: "Tour of the Plain, first stage"
date: "12.04.2027"
year: 2027
institution: SPC                 # who made it or where it happened
format: "Event, 40 riders"
media:
  - url: https://archive.org/details/your-upload-name
    type: video
    alt: "The start on the gravel road"
contributor: "your-handle"
added: 2027-04-12
---

What happened, who did it, and where to see it.
```

Record entries have no `status`. They happened.

### Template: Culture (citizen work)

```markdown
---
code: ACC 0001                   # python3 tools/build.py next ACC
title: "Tour of the Plain jersey"
date: "10.2026"
year: 2026
form: merch                      # film | image | merch | music | writing | game | performance | other
link: https://example.org/shop   # optional: where the work lives
media:
  - file: media/ACC-0001.jpg
    type: image
    alt: "A purple and gold cycling jersey with the ring on the back"
contributor: "your-handle"
added: 2026-10-04
---

What it is, who made it, and how it came about. Fantasy is welcome; it does not have to agree with the Archive.
```

Culture works have no `status`. A film goes on the Internet Archive or another host and is linked with `type: video` and `url`.

### Posts on X

The archive can keep a post from X (Twitter), whether it is the contributor's own or someone else's.

```
python3 tools/xpost.py https://x.com/someone/status/123 --save ACC-0007
```

prints the post's handle, name, date, text, images and video, and with `--save` keeps the images (and the video, if under 10 MB) in `media/`. Then write the record as usual, add the post's text as a quotation in the body, and add:

```yaml
source:
  platform: x
  url: https://x.com/someone/status/123
  author: "@someone"
  posted: 2026-10-02
  rights: author      # own = the contributor's own post (CC0); author = belongs to its author, kept for reference
```

In `lore.json` this block appears as `origin` (the existing `source` field stays the link to the record's file). A snapshot of someone else's post is not CC0; the site says so on the record. If the author asks for removal, remove it. Where the post goes: a citizen's work about Ubikistan goes in Culture, a real event in the Record, and fiction in the voice of the past in the Archive as apocrypha. The submission form and the guest desk accept a "Post on X" link too, and the intake does the fetching.

### Films and sound

- Film: `type: video` with `url: https://archive.org/details/...` (the site embeds Internet Archive films) or any other `https://` link. Add `poster: media/<code>.jpg` for a still.
- Short clips under 10 MB may be stored in `media/` as `.mp4` or `.webm`.
- Sound: `type: audio`, `.mp3` or `.ogg` in `media/`, or a `url`.

## For the State Archive (maintainer work)

- Approving a submission from the form: read the issue, then add the label `accepted`. The intake workflow (`tools/intake.py`) gives it the next free code, downloads the images into `media/`, writes the record as `FOLK`, publishes, and closes the issue with a link. If something is wrong it comments on the issue instead and removes the label.
- Reviewing a pull request: run `python3 tools/build.py check`, read the record against the rules above, then merge or ask for changes.
- Promoting: change `status` from `FOLK` to `PROBABLE`, `DISPUTED` or `CANON`. Canon changes also go into the lore pages where they belong (usually `lore/timeline.md`).
- Building locally: `python3 tools/build.py build` writes the site to `dist/`. Publishing happens automatically when `main` changes.

## How editing works (the archive is a wiki)

- Every page has Read, Edit, History and Talk. History comes from git: each version, its author and date (`revisions` in `lore.json`); `changes` in `lore.json` lists recent edits archive-wide.
- **Trusted citizens** are listed in `tools/trusted.txt` (GitHub usernames). Their pull requests are merged automatically by `.github/workflows/trusted.yml` once the checks pass, if they only touch `lore/`, `records/` or `media/`.
- **Everyone else** proposes through pull requests or the submission form; the State Archive reviews.
- **Signed-in citizens** (GitHub or X) edit through the desk, a Cloudflare Worker in `worker/` that turns an edit into a pull request and a record into a submission issue. Every change needs a signed-in account; there are no guest edits. Citizens are credited as `@handle (X)` or `@handle (GitHub)`, the State Archive as `Headroom`. The desk's address is `guest_desk` in `archive.config.json`.
- The desk logs sign-ins and actions (account, handle, time, action; no IP addresses) for one year in its D1 table `log`, readable only by the State Archive at `/log` and on the site's account page.
- See `lore/editing.md` for the public version of these rules.

## Versions and notes

Citizens add to existing pages without editing them:

- **A new version of a record's image**: `media/<PAGE-ID>--vYYYYMMDD-xxxx.jpg` and `records/versions/<PAGE-ID>/vYYYYMMDD-xxxx.md` with `page:` (the record's code), `file:`, `alt:`, `contributor:`, `added:`, and a body saying what the version changes. `<PAGE-ID>` is the code with `/` and spaces turned into `-`. Votes on the site (page key `CODE~<version id>`, the original is `CODE~original`) decide which version is shown; a new one must beat the original outright. `hidden: true` (State Archive only) withdraws one. Exported in `lore.json` as `versions` (with `main: true` on the one shown).
- **A note**: `records/notes/<PAGE-ID>/nYYYYMMDD-xxxx.md` with `page:` (a record code or `lore/<page>`), `contributor:`, `added:`, and the note as the body. Exported as `notes`.

The desk's `/version` and `/note` turn these into pull requests. It labels proposals from the State Archive and from people in `tools/trusted.txt` (a GitHub username, or `x:<account number>`) as `trusted`, and always credits the State Archive as `Headroom`.

## The lore map

`branches/<id>.md` are the branches of the history (frontmatter: `title`, `parent` (the branch it grows from; exactly one branch, the root, has none), `years`, `status` canon | apocrypha, `summary`, `lore`, `characters`, `records`, `contributor`, `added`; the body describes the branch). New branches enter as `apocrypha`; only the State Archive makes a branch `canon`. A branch's records are the ones listed plus every record tagged with one of its lore pages. The site opens Lore on the map (`#/lore`, also `#/map`), with tabs for the Index (`#/lore/index`), Persons on file (`#/characters`) and Collections; each branch has a page at `#/map/<id>` with its lore, people, records, notes (`records/notes/branch-<id>/`) and Talk (page key `branch/<id>`). Signed-in citizens grow a branch through the desk's `/branch`, which opens a pull request. Exported in `lore.json` as `branches`, with `children`.

## Projects

`projects/<id>.md` describes real work built from the archive (frontmatter: `title`, `order`, `status` forming | open | active | paused | done, `summary`, `lead`, `lore`, `roles` with `id`, `name`, `can`, `wanted`, `who` anyone | people | agents; the body is the description). The file's roles are the starting set.

Each project has an **owner**, appointed by the State Archive from anyone who has signed in to the archive, on the project page (desk table `project_owners`; never written into the repository, so no account numbers are published). The owner runs the project: they rewrite its page on the site (title, summary, status, description; `/project/page`, table `project_pages`) and define its roles (`/project/roles`, table `project_roles`), both of which replace the file's versions, and they can remove sign-ups. Only the State Archive appoints or removes an owner. Roles can be filled by people or by agents: a signed-in person signs up themselves or an agent they run, with its name and link (`/join` with `kind: agent`; table `signups`). Exported in `lore.json` as `projects`, with `owner`, `roles_by` (file or owner) and per-role `signed_up` counts of people and agents from the desk's `/projects/live`. Projects follow the archive's rules, and the gold reserve project in particular never shows prices, predictions or holdings it does not have.

## Comments and votes

Every record and lore page has a Talk box: like 👍, unlike 👎 and remarks. People sign in with GitHub or X through the desk (`worker/`, a Cloudflare Worker with a D1 database); votes and remarks are credited to their handle. The build reads the counts into `lore.json` as `discussion: {up, down, comments, url}` from the desk's `/talk/all`. The State Archive (listed in the desk's `ADMINS` secret) can hide remarks.

## Site versions

`releases.yml` lists the site's versions, newest first (`version`, `date`, `title`, `changes`). Whenever you change the site's features (a new page, view, tool or way of taking part), add a release at the top in the same change, with the changes written plainly for visitors. Content (records, lore, images) does not change the version. The footer shows the current version and links to `#/versions`. Exported in `lore.json` as `site_version` and `releases`.

## Technical notes

- Python 3.8+ and PyYAML (`pip install pyyaml`). Nothing else.
- `lore.json` is the stable interface for other projects, including the Ubikistan website. Add fields if needed; do not rename or remove existing ones.
- Keep the site dependency-free: plain HTML, CSS and JavaScript, fonts stored in `site/fonts/`.
