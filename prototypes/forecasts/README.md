# Ubikistan Forecasts

A phone-first page that reads the engine's forecasts across contract markets, stocks and crypto: each with a Long / Short / Cash stance, conviction, the gap against the market, horizon, entry and exit, and direct links to the venues. A History tab lists every settled forecast with its score.

The rule: where a contract trades, gap = UBIK probability − market price; five points or more is Buy YES or Buy NO, less is cash. Where nothing trades, above 60% backs the YES leg, below 40% the NO leg, between is cash. Positions are implied by forecasts, not advice; no price targets.

Data is a snapshot of the preview API (forecasts read 15 Oct 2026, Polymarket 13 Oct, Kalshi via AIXBT 14 Oct, AIXBT topics 16 Oct). The mapping from question to instruments and venues is hand-written in the page. The page was called Ubikistan Calls until 20 October 2026; the words it uses now are in `lore/ubik-forecast.md` (forecast, issued, resolves, scored).

## Sealed

`index.html` is encrypted in the file (AES-256-GCM, PBKDF2) with the same passphrase as the World State page; see `../world-state/lock.py`. Nothing is sent anywhere when it is opened.

Run by the UBIK team under ubik.gold's terms. Forecasts are probabilities, not financial advice. AI-generated · Terms: https://ubik.gold/terms
