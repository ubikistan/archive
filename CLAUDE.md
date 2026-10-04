# The Archive of the Republic of Ubikistan

This repository is the lore and history of Ubikistan, a fictional republic founded on 17 March 1966. People and agents read it, search it and add to it. It is published at https://ubikistan.github.io/archive/ and everything in it is free to copy (CC0).

If you are an AI assistant working in this repository, this file tells you how. Read it fully before you add or change anything.

## What is where

```
lore/                     how the Republic works: rules, eras, timeline, people, institutions
records/archive/<year>/   invented history, 1965–2025, one Markdown file per object
records/record/           real events from 30.09.2026 on (REC 0001, REC 0002 …)
media/                    images and small files, named after the record's code
tools/build.py            checks, searches and builds everything
site/                     the public search site (built into dist/, never edit dist/)
```

Start with `lore/rules.md`, `lore/codes.md`, `lore/eras.md` and `lore/timeline.md`. They hold the rules every record has to obey.

## Answering questions about Ubikistan

Search before you answer, and answer from the files, not from memory:

```
python3 tools/build.py search aixbt border
```

Quote archive codes (`BSV/PH/1972/0007`) and REC numbers when you cite something. If the archive does not say, say that it does not say. Do not fill gaps with invention unless the person asks you to write new lore.

Outside this repository the whole archive is also at https://ubikistan.github.io/archive/lore.json and, as plain text, https://ubikistan.github.io/archive/llms-full.txt.

## The rules of the archive

1. **Two archives.** The Archive (`records/archive/`) is what Ubikistan says happened, 1965 to 2025. It is fiction, written straight, as a real state archive would. The Record (`records/record/`) is what actually happens, from 30 September 2026: real films, real events, real work. No invented event ever gets a REC number. No real event ever gets an archive code.
2. **Everything new enters as `FOLK`** (shown as APOCRYPHA). Only the State Archive (contributor `Headroom`) promotes records to `PROBABLE`, `DISPUTED` or `CANON`. The checker enforces this.
3. **Contradictions are allowed.** If a new record contradicts canon, it is still welcome as apocrypha. Say what it contradicts in the text.
4. **The state borrows formats, never faces.** No real, identifiable people in Ubikistan's history: no politicians, founders, celebrities or private persons, by name or by likeness.
5. **The ring is the primary symbol.** Do not introduce aerosol cans, spray bottles or cleaning products as UBIK imagery. The PKD aerosol can exists only as apocrypha in two specific records.
6. **Culture before coin.** No token prices, price predictions or financial advice anywhere in the archive.
7. **Write like an archivist.** Plain, dry, specific. Dates, institutions, materials. One line of caption, then whatever the record needs. No marketing language, no explanations of the joke.
8. **Respect contributors.** Use the name or handle the person gives as `contributor`. Never put an email address, real name the person did not offer, or other personal data in a record.

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

### Films and sound

- Film: `type: video` with `url: https://archive.org/details/...` (the site embeds Internet Archive films) or any other `https://` link. Add `poster: media/<code>.jpg` for a still.
- Short clips under 10 MB may be stored in `media/` as `.mp4` or `.webm`.
- Sound: `type: audio`, `.mp3` or `.ogg` in `media/`, or a `url`.

## For the State Archive (maintainer work)

- Approving a submission from the form: read the issue, then add the label `accepted`. The intake workflow (`tools/intake.py`) gives it the next free code, downloads the images into `media/`, writes the record as `FOLK`, publishes, and closes the issue with a link. If something is wrong it comments on the issue instead and removes the label.
- Reviewing a pull request: run `python3 tools/build.py check`, read the record against the rules above, then merge or ask for changes.
- Promoting: change `status` from `FOLK` to `PROBABLE`, `DISPUTED` or `CANON`. Canon changes also go into the lore pages where they belong (usually `lore/timeline.md`).
- Building locally: `python3 tools/build.py build` writes the site to `dist/`. Publishing happens automatically when `main` changes.

## Comments and votes

Every record and lore page has a comment thread with 👍/👎 votes, run by giscus and stored in this repository's Discussions (one discussion per record, titled with its code; lore pages use `lore/<name>`). The build reads the counts into `lore.json` as `discussion: {url, up, down, comments, reactions}`. Settings are in `archive.config.json`.

## Technical notes

- Python 3.8+ and PyYAML (`pip install pyyaml`). Nothing else.
- `lore.json` is the stable interface for other projects, including the Ubikistan website. Add fields if needed; do not rename or remove existing ones.
- Keep the site dependency-free: plain HTML, CSS and JavaScript, fonts stored in `site/fonts/`.
