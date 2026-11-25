# Market Map: forecasting game, handoff prompt

Paste everything below the line into Claude (or Claude Code) in your Market Map repository.

---

You are adding a forecasting game to the UBIK Market Map (ubikmarketmap.com). A working reference build exists and is public (CC0). Read it first, then build the same features into this site, keeping this site's own data (calendar, ideas, venues) as the source for the market notes.

**Reference, read these before writing code**
- Live: https://ubikistan.github.io/archive/prototypes/market-map/
- Page: https://github.com/ubikistan/archive/tree/main/prototypes/market-map (`index.html`, `app.js`, `data.js`, `img/`)
- Server: https://github.com/ubikistan/archive/blob/main/worker/mm.js and the `mm_` tables at the end of https://github.com/ubikistan/archive/blob/main/worker/schema.sql

## What to build, in this order

1. **Live questions.** Fetch `https://api.ubik.gold/forecasts?status=open&per_page=100` and `?status=settled&per_page=100` in the browser (CORS is open; follow `meta.pages`). A question's deadline: `due.at` when it holds a time, otherwise the date at 23:59:59 New York time (`-05:00`). Match questions to this site's notes by `question_id`. Questions without notes still appear, marked "Not mapped yet". Keep a snapshot as fallback when the fetch fails.
2. **Front page.** A featured card (Today's five: the same five questions for everyone each day, picked by hashing the Amsterdam date with the question id, preferring questions that settle within 14 days). Topic chips (All, Saved, New, Settling this week, the categories, the top countries). A grid of compact cards: emblem, question, live countdown, Yes / No buttons, then a second tap for Lean or Sure (Yes: 0.65 / 0.90, No: 0.35 / 0.10, stored as the chance of YES). Footer badges: New (issued in the last 2 days), Settling today (under 24h), Hot (top 3 by forecasts in the last 24h), forecast count, bookmark. Search in the header with "/" as shortcut. A "How it works" dialog. Clicking a question opens a dialog with the full notes and a Share button that copies a link to that card.
3. **The crowd stays hidden until you forecast.** Before: only "N forecasts in". After: the share leaning YES as a green/red bar. This keeps the leaderboard honest; nobody can copy the crowd.
4. **Accounts and the server.** Sign in with X or GitHub. One forecast per person per question; it can change until the deadline, then it locks. Refuse forecasts on questions that are not open. Log every forecast, change and withdrawal with its time (for "most forecast today", the feed and later the crowd's history). Endpoints, as in `mm.js`: `GET /mm/crowd`, `GET /mm/board?days=`, `GET /mm/mine`, `GET /mm/feed`, `POST /mm/forecast {qid, p}` (p null withdraws), `POST /mm/sync {forecasts}` (forecasts made before signing in; open questions only).
5. **Points.** Per settled forecast: `10` for taking part, plus `skill = (0.25 - brier) * 200`, where `brier = (p - outcome)^2`. A positive skill is multiplied by `hardness = 1 + 2 * UBIK's Brier on that question + min(0.5, days between the forecast's last change and the deadline / 28)`. Sum the points per person, so volume counts; random guessing scores about zero and confident misses cost. Show Brier next to the points.
6. **Leaderboard.** A right sidebar on desktop (top 5, your rank, "Full leaderboard"), a Board tab on phones; All time and 30 days. UBIK sits in the list as a yellow row, scored by the same rules without the hardness bonus, counting only from the day the board opened. Until real people have settled forecasts, show clearly labelled sample rows with invented names and no links.
7. **Live layer.** A fixed ticker at the bottom with a pulsing "Live" dot: forecasts in the last hour, the latest forecasts (picture, handle, question; never which side), questions settling soon with live countdowns, just-settled results (outcome, UBIK's figure, the crowd's lean, yours), new questions, UBIK's record, the leader. Pause on hover; static when the visitor prefers reduced motion. A "Latest forecasts" list in the sidebar too.
8. **Profile pictures.** Take the picture at sign-in (X: `GET /2/users/me?user.fields=profile_image_url`, swap `_normal.` for `_bigger.`; GitHub: `avatar_url`), keep only `pbs.twimg.com` and `avatars.githubusercontent.com` addresses, and fall back to a coloured disc with the initial.
9. **You.** Your points, your Brier against UBIK's on the same questions, wins against UBIK, a daily streak, settled results (marked NEW the first time they show), waiting forecasts with countdowns, and two share texts: today's five as coloured squares, and your record against UBIK.

## Rules that are not negotiable

- No money, no prizes, no token prices, no price talk. Say forecast, settles, scored; never bet, odds or prediction. Footer: "Forecasts are probabilities, not financial advice."
- UBIK's own figure on an open question is for UBIK holders. Never show it. After a question settles, ubik.gold publishes it, and only then may it appear.
- No photographs of real people. Topic emblems are object photographs, one per category (see `img/`).
- Sample or test data is always labelled as such.

## Two ways to run the server

- **A. Share the Ubikistan desk** (fastest, one leaderboard for both sites). Base address: `https://ubikistan-guest-desk.ubikistan-archive.workers.dev`. Sign-in: send the visitor to `/auth/x?return=<your page>&nonce=<random>` (or `/auth/github`); they come back to `<your page>#/signed-in?t=<token>&n=<nonce>&back=<hash>`. Keep the token and send it as `Authorization: Bearer <token>`. `GET /me` returns handle, provider and picture. This only works after Headroom adds your domain to the desk's allowed origins; ask before you build on it.
- **B. Your own server.** A Cloudflare Worker with a D1 database: copy `worker/mm.js` and the `mm_` tables, and give it its own X and GitHub sign-in.

## Done when

- Forecasting works from the grid, the featured card and the dialog, signed in and signed out.
- A settled question shows the outcome, UBIK's figure and Brier, your points, and whether you beat UBIK.
- The page works at 390 px wide without sideways scrolling, and keyboard focus is visible.
- The ticker, sidebar and counts update without a reload (crowd every 60 s, feed every 30 s).
