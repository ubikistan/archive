# The pages

The Ubikistan World State and the Forecasts page, as a build. The sources are in `parts/` (the static page, the live modules, the account and attestation dialogs, the public snapshot of ubik.gold's edition), `tools/assemble.py` puts each page together into `src/`, and Vite bundles the result into `../prototypes/`, which is what both ubikistan.org and ubikistan.github.io/archive/prototypes/ serve.

```
npm install            # once; needs Node 20+ and Python 3
npm run dev            # assemble + Vite dev server on http://localhost:5173 (desk proxied at /api)
npm run build          # assemble + bundle into ../prototypes/
npm run check          # ping every outside call; add --site https://ubikistan.org to check a deployed copy
npm run deploy         # build, check, then rsync ../prototypes/ to the server over ssh
```

## Where the pages get their data

Nothing in the build carries holder content. Each page inlines the public snapshot in `parts/snapshot/` (what anyone may read) and then asks the desk, the archive's Cloudflare Worker, for the current edition, the archive of editions, market prices and sign-in. The desk passes a reader's own ubik.gold key through; ubik.gold decides what it opens.

The desk's address is a `<meta name="desk">` tag set at build time from `VITE_DESK` in `.env`:

- empty (the default): the pages call `https://ubikistan-guest-desk.ubikistan-archive.workers.dev` directly. The web server's CSP must allow it in `connect-src`.
- `/api`: same-origin. The web server proxies `/api/*` to the desk (`tools/Caddyfile.example`), sending `Origin: https://ubikistan.org`. The desk then sees the server's address rather than the reader's, so its refusal of the United States applies to the server's country; the page's own 18+/not-US attestation still runs. Vite's dev server proxies `/api` the same way.

The desk only answers pages on origins it lists (`worker/index.js`, `ALLOWED_ORIGINS`): ubikistan.github.io, ubikistan.org, localhost.

## Deploying

`.env.local` (ignored by git) holds the target:

```
DEPLOY_HOST=…
DEPLOY_USER=…
DEPLOY_PATH=/var/www/ubikistan.org
DEPLOY_KEY=~/path/to/deploy_key
```

`npm run deploy` rsyncs the built folder with `--delete`, leaving out the READMEs, `lock.py` and the sealed `archive/`. The server serves `world-state/`, `forecasts/`, `disclaimer/`, `assets/` and `fonts/` (licences) at its root; every link between the pages is relative, so the same build also serves under `/archive/prototypes/` on GitHub Pages.

## Updating the public snapshot

The snapshot only matters for the seconds before the desk answers, and for a reader the desk refuses. Refresh it now and then:

```
curl -s "https://ubik.gold/synthesis?include=all" > parts/snapshot/synthesis.json
curl -s "https://ubik.gold/forecasts?status=open&include=history,details" > parts/snapshot/open.json
curl -s "https://ubik.gold/forecasts?status=settled&include=history,details" > parts/snapshot/settled.json
```

Fetched without a key, so it holds only the public part. The builder also strips the stills and sources. Since 24 October the public part has no figure for open forecasts (`probability` is null, and `/forecasts` pages by 20, so merge `&page=2` into `open.json`); the pages show a dash and a note pointing to app.ubik.gold for a key, and fill the figures in when a reader's key comes back "holder".

## When a new edition brings new questions

`parts/markets.js` maps question ids to Polymarket market ids (prices shown next to forecasts) and `parts/fc_instr.js` names the instruments each question touches (the Forecasts page). Both are hand-made and need a look at each new edition.
