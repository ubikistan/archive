# Red Ripple bot versions

Each released version of `worker/ripple_bot.js`, kept as it was when it went live. These files are not loaded by the desk.

To go back to an earlier version, copy its file over `worker/ripple_bot.js` and push; the desk redeploys itself.

| Version | Date | What changed |
|---|---|---|
| 1.0 | 2026-11-05 | First release: reads both groups, links X accounts, finds and measures posts, morning digest, weekly leaderboard, settings. |
| 1.1 | 2026-11-05 | Watch list: core admins add X accounts with /watch and the bot scores them without anyone linking. /scan runs a search now. New accounts are searched three days back. |
| 1.2 | 2026-11-05 | Command menu: the / menu in Telegram lists the bot's commands; group admins also see the admin ones. |
| 1.3 | 2026-11-05 | Reads X with the archive app's full sign-in (OAuth 1.0a, like the daily poster), trims stray spaces from keys, and says what X answered when it refuses. |
