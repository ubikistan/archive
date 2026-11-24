# Ubikistan Forecasts · Degen

A fixed, shareable cut of the Forecasts page in degen mode only, with no holder gate. Unlisted: nothing on the site links to it.

It shows what anyone may read on ubik.gold without a key. Every settled forecast is read as a leg: at 60% or more the YES leg, at 40% or less the NO leg, between is cash. The leg is taken from the last figure the engine stood at before the question settled. Where `pages/parts/fc_instr.js` names an instrument for the question (the questions of 17 to 21 October 2026) the leg carries its name and a chart link; otherwise it is the YES or NO side of the question itself. Win and loss count the question's outcome, never a price. Open forecasts are listed with their question and deadline only, since their figures are for holders.

No venue or contract links, no resolution rules and no evidence quotations are copied in; each card links to its record on ubik.gold.

## Rebuilding

The page does not update itself. To refresh it:

```
curl -s "https://ubik.gold/forecasts?status=settled&include=history,details&per_page=100" > settled.json
curl -s "https://ubik.gold/forecasts?status=open&include=history,details&per_page=100" > open.json
python3 prototypes/degen/build.py pages/parts/calls.static.html pages/parts/fc_instr.js settled.json open.json prototypes/degen/index.html "24 Nov 2026"
```

The last argument is the date shown as READ. Past 100 forecasts of either kind, fetch `&page=2` as well and merge the `data` lists.

A non-commercial, community-run page built on content published by ubik.gold under its terms; not run or endorsed by ubik.gold. Not financial advice; for entertainment and education only; AI-generated; not for persons under 18 or in the United States.
