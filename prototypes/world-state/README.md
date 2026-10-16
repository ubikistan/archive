# Ubikistan World State

A single static page built on a snapshot of the pre cog preview API (editions of 12–14 October 2026; market prices read 13 October), to show what the engine's data looks like with a human surface. Not an official page, and not connected to the deployment: every number in it is inlined.

Open `index.html` in a browser; there is no build step and no dependency beyond Google Fonts. The identity (mark, Michroma wordmark, gold/teal/pink on warm dark grey, Archivo and Newsreader) follows ubik.gold. On first arrival a cover asks whether to read as a human or as an agent and remembers the answer (`#cover` shows it again). Five pages, agent first, switched by the tabs in the masthead and addressable by hash: `#agent` (the Agent edition: the day as data, with a JSON view, `llms.txt` and the endpoints, plus Ask UBIK), `#edition` (the Human edition: the board first, every open question sortable with its probability, change, 14-day sparkline, market price and deadline, a What-changed stream with timestamps, then the edition), `#films` (one film per edition, hosted on the Internet Archive and played in place; social copies linked, not archived), `#dashboard` (the numbers), `#ledger` (the record, with sub-tabs Forecasts, Record, History, Mine).

What it shows: the day's synthesis; each current as a digest (lead lines with provenance tags, "why you should care", forecasts) that opens into the full section; a sheet per forecast in the team's schema (gold header with the question, the number and a 100-dot grid; why; folds for Thesis, How the news leads here, Reasoning, Considerations, Would confirm, Would count against, Related markets) with the ledger folded underneath (history, resolution rule, record ID, share card) and previous/next within the edition; UBIK's number next to the market price where a contract exists; the record and ledger; editions history; a signals ticker; world clocks; light, dark and UBIK modes (the last one the identity at night: black, gold, teal, pink); a share card per forecast; a Dashboard view (score tiles, a zoomable world map of where the questions are, a resolution horizon, every open question as a probability row with the market and issue marks, largest moves, UBIK vs market gaps, a calibration plot, questions by theme); a Chat page for the holder MCP endpoint (searches the snapshot for now); a Mine page where each viewer follows themes, places and free-text topics, adds sections to their feed and stars questions, kept in their browser until they sign in (a prototype sign-in with GitHub, X or a wallet handle, local only), and sees only what moved, what resolves next and which sections concern them.

Snapshot caveats: Polymarket prices were read on 13 October 2026 and are hard-coded. The crypto section (05, bylined AIXBT) and its three forecasts are sample content written for the prototype, not engine output. The publication window (holders 06:00 UTC, public 18:00 UTC) is proposed, not announced.


## Sealed

`index.html` (and the archived version) are published sealed: the page is encrypted inside the file with AES-256-GCM, the key derived from a passphrase with PBKDF2-SHA256 (300,000 rounds). Without the passphrase the content is not in the file. The gate remembers the passphrase on a device if asked. `lock.py SOURCE.html OUT.html "passphrase"` seals a page; the plaintext source stays off the repository. Earlier commits on this branch hold the unsealed page.

## Phones

Below 640px the page is one column: a scrolling tab strip under the wordmark, sign-in top right, the board as cards, the sheet full-bleed, the films stacked, the appearance switch and the social links in the footer. No horizontal scroll anywhere except the tab, clock, filter and ledger strips, which are meant to.

## Archive

- `archive/2026-10-14-editorial-first.html`: the editorial-first version (cover, agent and human editions, films, dashboard, ledger, Mine), frozen before the board-first update of 14 October 2026. (A local tag `world-state-editorial-first` exists; tags cannot be pushed from this environment.)

## Community edition

A community project of the Republic of Ubikistan, built on UBIK's public forecast data. Powered by UBIK; not affiliated with, and not endorsed by, the UBIK token, team or platform.
