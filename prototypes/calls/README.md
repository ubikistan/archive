# Ubikistan Calls (community)

A phone-first page that turns the engine's forecasts into positions: prediction markets, stocks and crypto, each with a Long / Short / Cash stance, conviction, edge against the market, horizon, entry and exit, and direct links to the venues. A History tab lists every settled call as a win or a loss.

The rule: where a contract trades, edge = UBIK probability − market price; five points or more is Buy YES or Buy NO, less is cash. Where nothing trades, above 60% backs the YES leg, below 40% the NO leg, between is cash. Positions are implied by forecasts, not advice; no price targets.

Data is a snapshot of the preview API (forecasts read 15 Oct 2026, Polymarket 13 Oct, Kalshi via AIXBT 14 Oct, AIXBT topics 16 Oct). The mapping from question to instruments and venues is hand-written in the page.

## Sealed

`index.html` is encrypted in the file (AES-256-GCM, PBKDF2) with the same passphrase as the World State prototype; see `../world-state/lock.py`. Nothing is sent anywhere when it is opened.

A community project of the Republic of Ubikistan, built on UBIK's public forecast data. Powered by UBIK; not affiliated with, and not endorsed by, the UBIK token, team or platform.
