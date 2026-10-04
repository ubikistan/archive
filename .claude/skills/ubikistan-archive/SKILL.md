---
name: ubikistan-archive
description: Search, cite and add to the Archive of the Republic of Ubikistan. Use when someone asks about Ubikistan, UBIK or AIXBT lore, or wants to add a photo, document, story or film to the archive.
---

# Ubikistan archive

The full instructions are in `CLAUDE.md` at the root of this repository. Follow them exactly.

The short version:

- **Questions:** `python3 tools/build.py search <words>`, then read the matching files and cite their codes.
- **Adding:** decide Archive (invented, 1965–2025) or Record (real, 2026 on) → `python3 tools/build.py next <INST> <MEDIUM> <YEAR>` or `next REC` → media into `media/` → record file from the template in `CLAUDE.md` with `status: FOLK` → `python3 tools/build.py check` → pull request.
- **Never:** real people as part of the history, aerosol-can imagery, prices, personal data, direct pushes to `main` for outside contributions.
