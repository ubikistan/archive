# Red Ripple bot versions

Each released version of `worker/ripple_bot.js`, kept as it was when it went live. These files are not loaded by the desk.

To go back to an earlier version, copy its file over `worker/ripple_bot.js` and push; the desk redeploys itself.

| Version | Date | What changed |
|---|---|---|
| 1.0 | 2026-11-05 | First release: reads both groups, links X accounts, finds and measures posts, morning digest, weekly leaderboard, settings. |
| 1.1 | 2026-11-05 | Watch list: core admins add X accounts with /watch and the bot scores them without anyone linking. /scan runs a search now. New accounts are searched three days back. |
| 1.2 | 2026-11-05 | Command menu: the / menu in Telegram lists the bot's commands; group admins also see the admin ones. |
| 1.3 | 2026-11-05 | Reads X with the archive app's full sign-in (OAuth 1.0a, like the daily poster), trims stray spaces from keys, and says what X answered when it refuses. |
| 1.4 | 2026-11-05 | Live numbers: posts score from the moment they are found, refresh every three hours and are fixed at 48 h. The board shows views and replies; /check @name lists each post with its raw numbers. |
| 1.5 | 2026-11-05 | UBIK focus: each post gets a 0 to 1 score for how much it is about UBIK (the AI reads it once; a rule decides without a key), and its impact is multiplied by it. Long posts are read in full. /focus corrects one post. |
| 1.6 | 2026-11-05 | Previews of new posts in the X Posts topic (/setup posts), runs every 15 minutes, a daily scan of what X says about UBIK and the wider generative TV and AI agent conversation, and a steer for both groups: topics, posts to engage with, best hours (/narrative). Replies go to the topic the command came from. |
| 1.7 | 2026-11-05 | Emojis: medals and markers on the leaderboard, numbers in /check, previews, scan, today, watch list and the steer's sections. |
| 1.8 | 2026-11-05 | Speaks Ubikistani: gUbik, ⭕⭕, Ubikistanians, ubikis, ubikify, Ubikly mode, Ubillions (of views), taken from the group's own chat. Never about price. |
| 1.9 | 2026-11-05 | Morning read ranks the last 48 h by live numbers × UBIK focus (no longer only posts already fixed). The bunching warning ignores replies and shows Amsterdam time. When the AI fails, the bot says why (/version). |
| 2.0 | 2026-11-05 | The playbook is the yardstick: the bot reads ubikistan.org/ripple, sorts every post by thesis node and format, rates its fit with the playbook's rules and language, and the morning steer compares the week with the plan. /playbook shows the coverage; /set node_start starts the node cycle. |
| 2.1 | 2026-11-05 | AI check: /aitest makes one small call and shows exactly what came back; sorting records why an answer could not be read; smaller sorting batches; the key is trimmed. |
| 2.2 | 2026-11-05 | Posts the AI could not sort (sorted by the simple rule instead) are sorted again by the AI, at most once an hour. |
| 2.3 | 2026-11-05 | The AI writes without its thinking step and with more room, so the steer and sorting come back as text. Team accounts (/set team) stay off the leaderboard and reach ranking; their posts are previewed as team posts to amplify. |
| 2.4 | 2026-11-05 | /set takes name value or name = value; number settings are checked before they are saved; the bot never sends X an empty request. |
| 2.5 | 2026-11-05 | Reads counted the way X bills them (each post once per UTC day). Live numbers refresh twice, at 6 and 24 hours, then fix at 48 h; refreshing pauses when under a quarter of the day's limit is left, so finding new posts always comes first. |
| 2.6 | 2026-11-08 | No more tags: X accounts are shown as names linked to their X profile, people in the chat by name, and the AI's steer the same way, so nobody gets notified. |
| 2.7 | 2026-11-12 | /export sends a spreadsheet (CSV) of every registered post: account, date, kind, text, views, replies, quotes, bookmarks, reposts, likes, impact, UBIK focus, node, format, fit, flag and link. Core group admins only. |
