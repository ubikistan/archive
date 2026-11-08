/*
 * Project Red Ripple: the Telegram bot.
 *
 * Lives inside the desk. It reads the core group and the community group, links each member's Telegram
 * account to their X account (signed in with X through the desk), finds their posts about UBIK on X,
 * measures each post 48 hours after it went up, writes a morning digest for the core group and a weekly
 * leaderboard for both groups. It never posts, replies or likes on X.
 *
 *   POST /tg/hook/<secret>   Telegram's webhook (checked with Telegram's secret header)
 *   GET  /tg/setup           point Telegram's webhook at the desk (idempotent)
 *   POST /tg/link {t}        finish linking an X account; called by ubikistan.org/ripple/link/ with a desk session
 *   board(env, week)         the leaderboard, also served to the logbook at GET /ripple/board
 *
 * Secrets: TG_BOT_TOKEN (from @BotFather), X_READ_KEY, X_READ_SECRET, X_READ_TOKEN, X_READ_TOKEN_SECRET (the archive's
 * X app, signed in as OAuth 1.0a like tools/daily.py; without the two token values it tries an app-only bearer),
 * ANTHROPIC_API_KEY (optional: the written digest). Settings live in tg_cfg and can be
 * changed from the core group with /set.
 */

// Every release gets a new number and a line here, and a copy in worker/ripple_bot_versions/v<number>.js
// (not loaded; kept so any earlier version can be put back by copying it over this file).
export const VERSION = "2.6";
const CHANGES = [
  ["1.0", "2026-11-05", "First release: reads both groups, links X accounts, finds and measures posts, morning digest, weekly leaderboard, settings."],
  ["1.1", "2026-11-05", "Watch list: core admins add X accounts with /watch and the bot scores them without anyone linking. /scan runs a search now. New accounts are searched three days back."],
  ["1.2", "2026-11-05", "Command menu: the / menu in Telegram lists the bot's commands; group admins also see the admin ones."],
  ["1.3", "2026-11-05", "Reads X with the archive app's full sign-in (OAuth 1.0a, like the daily poster), trims stray spaces from keys, and says what X answered when it refuses."],
  ["1.4", "2026-11-05", "Live numbers: posts score from the moment they are found, refresh every three hours and are fixed at 48 h. The board shows views and replies; /check name lists each post with its raw numbers."],
  ["1.5", "2026-11-05", "UBIK focus: each post gets a 0 to 1 score for how much it is about UBIK (the AI reads it once; a rule decides without a key), and its impact is multiplied by it. Long posts are read in full."],
  ["1.6", "2026-11-05", "Previews of new posts in the X Posts topic, runs every 15 minutes, a daily scan of what X is saying about UBIK and the wider generative TV and AI agent conversation, and a steer for both groups: topics, posts to engage with, best hours. Replies go to the topic the command came from."],
  ["1.7", "2026-11-05", "Emojis: medals and markers on the leaderboard, numbers in /check, previews, scan, today, watch list and the steer's sections."],
  ["1.8", "2026-11-05", "Speaks Ubikistani: gUbik, ⭕⭕, Ubikistanians, ubikis, ubikify, Ubikly mode, Ubillions (of views), taken from the group's own chat. Never about price."],
  ["1.9", "2026-11-05", "Morning read ranks the last 48 h by live numbers × UBIK focus (no longer only posts already fixed). The bunching warning ignores replies and shows Amsterdam time. When the AI fails, the bot says why (/version)."],
  ["2.0", "2026-11-05", "The playbook is the yardstick: the bot reads ubikistan.org/ripple, sorts every post by thesis node and format, rates its fit with the playbook's rules and language, and the morning steer compares the week with the plan. /playbook shows the coverage."],
  ["2.1", "2026-11-05", "AI check: /aitest makes one small call and shows exactly what came back; sorting records why an answer could not be read; smaller sorting batches."],
  ["2.2", "2026-11-05", "Posts the AI could not sort (sorted by the simple rule instead) are sorted again by the AI, at most once an hour."],
  ["2.3", "2026-11-05", "The AI writes without its thinking step and with more room, so the steer and sorting come back as text. Team accounts (/set team) stay off the leaderboard and reach ranking; their posts are previewed as team posts to amplify."],
  ["2.4", "2026-11-05", "/set takes name value or name = value; number settings are checked before they are saved; the bot never sends X an empty request."],
  ["2.5", "2026-11-05", "Reads counted the way X bills them (each post once per UTC day). Live numbers refresh twice, at 6 and 24 hours, then fix at 48 h; refreshing pauses when under a quarter of the day's limit is left, so finding new posts always comes first."],
  ["2.6", "2026-11-08", "No more tags: X accounts are shown as names linked to their X profile, people in the chat by name, and the AI's steer the same way, so nobody gets notified."],
];

const DESK = "https://ubikistan-guest-desk.ubikistan-archive.workers.dev";

// the group's own words (from the chat): gUbik is the greeting, ⭕⭕ the sign-off, Ubikistanians and ubikis the people,
// ubikify to turn something into UBIK content, Ubikly mode going all in, Ubillions huge reach (views, never money)
const pick = (l) => l[Math.floor(Math.random() * l.length)];
const GREET = ["gUbik", "gUbik Ubikistanians", "gUbik ubikis", "gUbik frens"];
const SIGN = "⭕⭕";
const VOICE = `Write in the group's own voice. Its words: "gUbik" (the greeting), "⭕⭕" (the sign-off), "Ubikistanians" and "ubikis" (the people), "ubikify" (turn something into UBIK content), "Ubikly mode" (going all in on UBIK content), "Ubillions" (huge reach, only ever about views, never money). Use two or three of them naturally, not in every sentence.`;
const LINK_PAGE = "https://ubikistan.org/ripple/link/";
const TZ = "Europe/Amsterdam";
const NODES = ["Generative TV", "Characters as channels", "What the character knows", "Community first", "The lineage and the world"];
const DEFAULTS = {
  digest: "on", digest_hour: "9",
  board: "on", board_day: "7", board_hour: "19",
  daily_cap: "600",              // X posts read per day, at most (about $0.005 each)
  per_day: "3",                  // posts per person per day that count on the leaderboard
  ai_model: "claude-haiku-5-5",
  weights: JSON.stringify({ views: 0.01, replies: 3, quotes: 4, bookmarks: 3, reposts: 2, likes: 0.5 }),
  keep_days: "7",                // how long message text is kept for the digest
  focus: "ai",                   // how much a post is about UBIK: ai, rules or off
  previews: "on",                // post new posts from the watch list in the X Posts topic
  preview_replies: "off",        // include replies in the previews
  preview_min_focus: "0.25",     // skip posts that are barely about UBIK
  narrative: "on",               // daily scan of what X is saying, for the steer
  community_steer: "on",         // a short steer for the community group each morning
  team: "ubik_gold 0rxbt rel_op aixbt_agent aixbt_labs zedd368", // the UBIK team's accounts: previewed, never ranked
  node_start: "",                // Monday node 1 starts (YYYY-MM-DD); empty uses the logbook's setting
  scene_queries: JSON.stringify(['("generative TV" OR "AI streamer" OR "AI vtuber" OR "world model" OR "AI characters") lang:en -is:retweet -is:reply', '("AI agent" OR "AI agents") (forecast OR forecasting OR "prediction market") lang:en -is:retweet -is:reply']),
};
const SETTABLE = Object.keys(DEFAULTS);
const X_LINK = /https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{5,25})/g;
const PRICE = /\b(price|pump|dump|chart|mc|mcap|market ?cap|ath|floor|bags?|moon|rekt|\d+x|buy(ing)?|sell(ing)?)\b|\$0?\.\d/i;

/* ---------------- small helpers ---------------- */

const now = () => new Date();
const iso = (d) => new Date(d).toISOString();
function local(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" })
    .formatToParts(new Date(d)).map((x) => [x.type, x.value]));
  const wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday];
  return { day: `${p.year}-${p.month}-${p.day}`, hour: parseInt(p.hour, 10), weekday: wd };
}
function isoWeek(day) { // "2026-11-05" -> "2026-W45"
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d)); const wd = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - wd);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y0) / 864e5 + 1) / 7)).padStart(2, "0")}`;
}
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const short = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const postUrl = (p) => `https://x.com/${p.handle || "i"}/status/${p.id}`;

async function cfgAll(env) {
  const { results } = await env.DB.prepare("SELECT k, v FROM tg_cfg").all();
  return Object.assign({}, DEFAULTS, Object.fromEntries(results.map((r) => [r.k, r.v])));
}
async function cfgSet(env, k, v) {
  if (v == null) return env.DB.prepare("DELETE FROM tg_cfg WHERE k = ?").bind(k).run();
  return env.DB.prepare("INSERT INTO tg_cfg (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, String(v)).run();
}
async function hookSecret(env) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("ripple-hook:" + (env.TG_BOT_TOKEN || "")));
  return Array.from(new Uint8Array(h).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------------- Telegram ---------------- */

async function tg(env, method, body) {
  if (!env.TG_BOT_TOKEN) return null;
  const r = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  return j.ok ? j.result : null;
}
const threadOf = (msg) => (msg && msg.is_topic_message && msg.message_thread_id ? { message_thread_id: msg.message_thread_id } : {});
const say = (env, chat, text, extra) => tg(env, "sendMessage", Object.assign({ chat_id: chat, text: text.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true }, extra || {}));
async function botName(env) {
  const c = await cfgAll(env);
  if (c.bot_username) return c.bot_username;
  const me = await tg(env, "getMe");
  if (me && me.username) { await cfgSet(env, "bot_username", me.username); return me.username; }
  return "";
}
async function isChatAdmin(env, chat, user) {
  if (!chat || !user) return false;
  const m = await tg(env, "getChatMember", { chat_id: chat, user_id: user });
  return !!m && (m.status === "creator" || m.status === "administrator");
}

const MENU = [
  ["leaderboard", "This week's Red Ripple board"],
  ["watchlist", "The X accounts I score"],
  ["check", "Every post of one account with its numbers: /check name"],
  ["playbook", "How the last 7 days match the playbook"],
  ["today", "Node, lead format and numbers for today"],
  ["me", "Your place on the board"],
  ["link", "Link your X account"],
  ["version", "Which version of the bot is running"],
  ["help", "What I can do"],
];
const ADMIN_MENU = [
  ["watch", "Add X accounts to score: /watch name name"],
  ["unwatch", "Stop scoring an account: /unwatch name"],
  ["scan", "Search X now instead of waiting an hour"],
  ["focus", "Correct a post's UBIK focus: /focus <link> 0.8"],
  ["digest", "Post the morning read now"],
  ["narrative", "Scan what X is saying now, then post the steer"],
  ["aitest", "Check that the AI answers"],
  ["settings", "Show the settings"],
  ["set", "Change a setting: /set name value"],
  ["setup", "Register: /setup core, /setup community, or /setup posts in the X Posts topic"],
];
const asCommands = (l) => l.map(([command, description]) => ({ command, description }));

export async function setup(env) {
  if (!env.TG_BOT_TOKEN) return { ok: false, error: "No bot token yet." };
  await tg(env, "setMyCommands", { commands: asCommands([["start", "Link your X account"], ...MENU.filter((m) => m[0] !== "link")]), scope: { type: "all_private_chats" } });
  await tg(env, "setMyCommands", { commands: asCommands(MENU), scope: { type: "all_group_chats" } });
  await tg(env, "setMyCommands", { commands: asCommands([...MENU, ...ADMIN_MENU]), scope: { type: "all_chat_administrators" } });
  const secret = await hookSecret(env);
  const ok = await tg(env, "setWebhook", { url: `${DESK}/tg/hook/${secret}`, secret_token: secret, allowed_updates: ["message", "my_chat_member"], drop_pending_updates: false });
  await cfgSet(env, "hook", ok ? secret : null);
  await botName(env);
  return { ok: !!ok };
}

async function person(env, from) {
  if (!from || from.is_bot) return;
  const at = iso(now());
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ").slice(0, 80);
  await env.DB.prepare("INSERT INTO tg_people (tg_id, username, name, first_seen, last_seen) VALUES (?, ?, ?, ?, ?) ON CONFLICT(tg_id) DO UPDATE SET username = excluded.username, name = excluded.name, last_seen = excluded.last_seen")
    .bind(String(from.id), String(from.username || ""), name, at, at).run();
}
// names are written without @ so Telegram never turns them into tags that notify people
function who(p) { return p ? (p.name || p.username || "someone") : "someone"; }
const xh = (h) => `<a href="https://x.com/${encodeURIComponent(String(h || ""))}">${esc(h)}</a>`;
const untag = (html) => html.replace(/(^|[^\w/])@([A-Za-z0-9_]{1,15})\b/g, (_, pre, h) => pre + xh(h));

export async function hook(req, env, secretInPath) {
  const secret = await hookSecret(env);
  if (!env.TG_BOT_TOKEN || secretInPath !== secret || req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) return new Response("no", { status: 403 });
  const u = await req.json().catch(() => null);
  try { if (u) await update(env, u); } catch (e) { console.log("ripple bot:", e && e.stack || e); }
  return new Response("ok");
}

async function update(env, u) {
  const c = await cfgAll(env);
  if (u.my_chat_member) {
    const m = u.my_chat_member;
    if (m.new_chat_member && ["member", "administrator"].includes(m.new_chat_member.status) && m.chat.type !== "private" && ![c.core_chat, c.community_chat].includes(String(m.chat.id)))
      await say(env, m.chat.id, "Red Ripple bot here. A group admin can send <b>/setup core</b> or <b>/setup community</b> to tell me what this group is.");
    return;
  }
  const msg = u.message;
  if (!msg || !msg.chat) return;
  const chat = String(msg.chat.id), text = String(msg.text || msg.caption || "");
  const known = chat === c.core_chat || chat === c.community_chat;
  const cmd = /^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (msg.chat.type === "private") { await person(env, msg.from); return dm(env, msg, cmd, c); }
  if (cmd && cmd[1].toLowerCase() === "setup") return setupChat(env, msg, (cmd[2] || "").trim().toLowerCase(), c);
  if (!known) return;
  await person(env, msg.from);
  for (const nm of msg.new_chat_members || []) await person(env, nm);
  if (msg.from && !msg.from.is_bot && !msg.new_chat_members) {
    const day = local(msg.date * 1000).day, from = String(msg.from.id);
    const links = [...text.matchAll(X_LINK)];
    await env.DB.prepare("INSERT INTO tg_daily (day, chat, tg_id, msgs, links) VALUES (?, ?, ?, 1, ?) ON CONFLICT(day, chat, tg_id) DO UPDATE SET msgs = msgs + 1, links = links + excluded.links")
      .bind(day, chat, from, links.length).run();
    if (text && !cmd) await env.DB.prepare("INSERT INTO tg_msgs (chat, tg_id, at, text) VALUES (?, ?, ?, ?)").bind(chat, from, iso(msg.date * 1000), text.slice(0, 600)).run();
    for (const m of links)
      await env.DB.prepare("INSERT OR IGNORE INTO x_posts (id, handle, source, shared_by, found_at) VALUES (?, ?, 'shared', ?, ?)").bind(m[2], m[1].toLowerCase(), from, iso(now())).run();
  }
  if (cmd) return groupCommand(env, msg, cmd[1].toLowerCase(), (cmd[2] || "").trim(), c);
}

async function setupChat(env, msg, role, c) {
  const r = (text, extra) => say(env, String(msg.chat.id), text, Object.assign(threadOf(msg), extra || {}));
  const chat = String(msg.chat.id), from = msg.from && msg.from.id;
  if (!["core", "community", "posts"].includes(role)) return r("Send <b>/setup core</b> in the core group, <b>/setup community</b> in the community group, or <b>/setup posts</b> in the topic where previews of new posts should go.");
  if (role === "posts") {
    if (!await isChatAdmin(env, chat, from)) return r("Only an admin of this group can do that.");
    if (chat !== c.core_chat && chat !== c.community_chat) return r("Set this group up as core or community first.");
    await cfgSet(env, "posts_chat", chat); await cfgSet(env, "posts_thread", msg.is_topic_message ? msg.message_thread_id : null); await cfgSet(env, "posts_since", iso(now()));
    return r("New posts from the watch list will appear here from now on, with a preview. /set previews off stops them.");
  }
  if (!await isChatAdmin(env, chat, from)) return r("Only an admin of this group can do that.");
  const current = role === "core" ? c.core_chat : c.community_chat;
  if (current && current !== chat && !(c.core_chat && await isChatAdmin(env, c.core_chat, from)))
    return r(`Another group is already set as the ${role} group. An admin of the core group can move it.`);
  await cfgSet(env, role === "core" ? "core_chat" : "community_chat", chat);
  await cfgSet(env, role === "core" ? "core_thread" : "community_thread", msg.is_topic_message ? msg.message_thread_id : null);
  await person(env, msg.from);
  const bot = await botName(env);
  return r(`${pick(GREET)} ${SIGN} This is now the Red Ripple <b>${role}</b> group. I read the messages here to write the digest and keep the numbers; message text is kept ${esc(c.keep_days)} days, counts longer.\n\nEveryone: link your X account once so your posts count. Open a chat with me and tap Start: ${bot ? `https://t.me/${bot}?start=link` : "find me by name"}`);
}

async function linkButton(env, tgId) {
  const t = await env._sign({ tg: String(tgId), k: "link", exp: Math.floor(Date.now() / 1000) + 3600 });
  return { reply_markup: { inline_keyboard: [[{ text: "Link my X account", url: `${LINK_PAGE}?t=${encodeURIComponent(t)}` }]] } };
}

async function dm(env, msg, cmd, c) {
  const chat = msg.chat.id, id = String(msg.from.id);
  const name = cmd ? cmd[1].toLowerCase() : "";
  const me = await env.DB.prepare("SELECT * FROM tg_people WHERE tg_id = ?").bind(id).first();
  if (name === "start" || name === "link") {
    const linked = me && me.x_handle ? `You are linked to <b>${xh(me.x_handle)}</b>. Tap below to link a different account.` : "Link your X account so your posts about UBIK count on the Red Ripple board. It takes one sign-in with X; I only read public posts.";
    return say(env, chat, linked, await linkButton(env, id));
  }
  if (name === "me") return say(env, chat, await meText(env, id));
  if (name === "version") return say(env, chat, await versionText(env));
  if (name === "unlink") { await env.DB.prepare("UPDATE tg_people SET x_id = NULL, x_handle = NULL, linked_at = NULL WHERE tg_id = ?").bind(id).run(); return say(env, chat, "Unlinked. Your posts no longer count."); }
  return say(env, chat, helpText(true));
}

async function versionText(env) {
  const c = await cfgAll(env);
  const ai = `\nAI: ${c.ai_model} · ${c.ai_error ? "⚠️ last problem: " + esc(c.ai_error) : "no problems recorded"}`;
  return `🤖 <b>Red Ripple bot ${VERSION}</b>${ai}\n\n` + CHANGES.slice(-5).reverse().map(([v, d, t]) => `${v} · ${d} · ${esc(t)}`).join("\n");
}

function helpText(dm) {
  return [
    `${SIGN} <b>Red Ripple bot</b> · gUbik`,
    "/link  link your X account" + (dm ? "" : " (in a private chat with me)"),
    "/me  your week so far",
    "/leaderboard  this week's board",
    "/today  node, format and numbers for today",
    "/watchlist  the X accounts I score",
    "/check name  each post with its views, replies and score",
    "/playbook  how the week matches the playbook",
    "/version  which version of me is running",
    "Core group admins: /watch name name  /unwatch name  /scan  /focus link 0.8  /digest  /narrative  /settings  /set name value",
    "I never post, reply or like on X.",
  ].join("\n");
}

async function groupCommand(env, msg, name, arg, c) {
  const r = (text, extra) => say(env, String(msg.chat.id), text, Object.assign(threadOf(msg), extra || {}));
  const chat = String(msg.chat.id), from = msg.from && msg.from.id;
  const core = chat === c.core_chat;
  if (name === "help" || name === "start") return r(helpText(false));
  if (name === "link") { const bot = await botName(env); return r(`Open a private chat with me and tap Start: https://t.me/${bot}?start=link`, { reply_to_message_id: msg.message_id }); }
  if (name === "me") return r(await meText(env, String(from)), { reply_to_message_id: msg.message_id });
  if (name === "leaderboard" || name === "board") return r(boardText(await board(env), !core));
  if (name === "today") return r(await todayText(env));
  if (name === "version") return r(await versionText(env));
  if (name === "check") return r(await checkText(env, arg));
  if (name === "playbook") return r(await playbookCheckText(env, c, core) + `\n\n📖 <a href="${PLAYBOOK_URL}">The playbook</a> ${SIGN}`);
  if (name === "watchlist") { const l = await watched(env); return r(l.length ? `👁 <b>Scoring ${l.length} X account${l.length === 1 ? "" : "s"}</b>\n` + l.map((h) => xh(h)).join(" ") : "Nobody on the watch list yet. A core admin adds accounts with /watch name."); }
  if (!core) return;
  if (!await isChatAdmin(env, chat, from)) return r("That one is for admins of this group.");
  if (name === "digest") return sendDigest(env, c, true);
  if (name === "aitest") {
    if (!env.ANTHROPIC_API_KEY) return r("🤖 No Anthropic key on the desk. Add RIPPLE_ANTHROPIC_KEY in GitHub and redeploy.");
    let res;
    try { const t0 = await claude(env, c, "Answer briefly.", "Reply with the word gUbik.", 50); res = `${t0.ok ? "✅" : "⚠️"} ${t0.why} · ${short(t0.text, 80)}`; }
    catch (e) { res = "no answer: " + String(e); }
    return r(`🤖 <b>AI test</b> · model ${esc(c.ai_model)}\n${esc(res)}`);
  }
  if (name === "narrative") {
    if (c.last_scene && Date.now() - Date.parse(c.last_scene) < 3600e3) { r("Using the scan from less than an hour ago."); return sendDigest(env, c, true); }
    const sc = await scanScene(env, c).catch((e) => ({ error: String(e) }));
    if (sc.error) return r(`The scan of X hit a problem: ${esc(sc.error)}`);
    return sendDigest(env, c, true);
  }
  if (name === "watch" || name === "unwatch") {
    const hs = [...new Set(arg.split(/[\s,]+/).map((h) => h.replace(/^@/, "").replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "").split(/[/?]/)[0].toLowerCase()).filter(Boolean))];
    const bad = hs.filter((h) => !/^[a-z0-9_]{1,15}$/.test(h));
    if (!hs.length || bad.length) return r(`Use /${name} name name …` + (bad.length ? ` (not an X handle: ${bad.map(esc).join(", ")})` : ""));
    if (name === "watch") {
      const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM x_watch").first()).n;
      if (n + hs.length > 300) return r("The watch list holds 300 accounts at most.");
      for (const h of hs) await env.DB.prepare("INSERT OR IGNORE INTO x_watch (handle, added_by, at) VALUES (?, ?, ?)").bind(h, String(from), iso(now())).run();
      return r(`👁 Watching ${hs.map((h) => xh(h)).join(" ")}. Welcome, ubikis. Their posts from the last three days are picked up on the next run (hourly, or /scan now). ${(await watched(env)).length} accounts on the list.`);
    }
    for (const h of hs) await env.DB.prepare("DELETE FROM x_watch WHERE handle = ?").bind(h).run();
    return r(`Stopped watching ${hs.map((h) => xh(h)).join(" ")}.`);
  }
  if (name === "focus") {
    const m = /status\/(\d{1,25})\S*\s+([01](?:\.\d+)?)\s*$/.exec(arg) || /^(\d{1,25})\s+([01](?:\.\d+)?)\s*$/.exec(arg);
    if (!m || +m[2] > 1) return r("Use /focus <post link> <0 to 1>, for example /focus https://x.com/name/status/123 0.8");
    await env.DB.prepare("INSERT OR REPLACE INTO x_focus (id, focus, by, at) VALUES (?, ?, 'admin', ?)").bind(m[1], +m[2], iso(now())).run();
    return r(`UBIK focus for that post set to ${+m[2]}.`);
  }
  if (name === "scan") {
    const d = await discover(env, c).catch((e) => ({ error: String(e) }));
    const m = await measure(env, c).catch((e) => ({ error: String(e) }));
    const f = await scoreFocus(env, c).catch(() => ({ scored: 0 }));
    await previews(env, c).catch(() => null);
    if (d.error || m.error) return r(`⚠️ The scan hit a problem with X.${d.error ? `\nSearch: ${esc(d.error)}` : ""}${m.error && m.error !== d.error ? `\nMeasuring: ${esc(m.error)}` : ""}`);
    return r(`🔎 Scan done${(d.found || 0) >= 10 ? ", Ubikly mode out there" : ""}. ${d.found || 0} posts about UBIK found, ${m.refreshed || 0} live numbers refreshed, ${m.measured || 0} fixed at 48 h, ${f.scored} rated for UBIK focus. X reads today: ${await readsToday(env)} of ${capOf(c)} (each post counts once a day, as X bills).${d.capped || m.capped ? " Today's read limit is reached; raise it with /set daily_cap." : ""}${d.skipped ? " " + esc(d.skipped) : ""}`);
  }
  if (name === "settings") return r("<b>Settings</b>\n" + SETTABLE.map((k) => `${k} = ${esc(c[k])}`).join("\n") + "\n\nChange one with /set name value. /set name reset goes back to the default.");
  if (name === "set") {
    const m = /^([a-z_]+)\s*(?:=\s*|\s+)([\s\S]+)$/.exec(arg);
    if (!m || !SETTABLE.includes(m[1])) return r("Use /set name value. Names: " + SETTABLE.join(", "));
    let v = m[2].trim();
    if (v === "reset") { await cfgSet(env, m[1], null); return r(`${m[1]} is back to ${esc(DEFAULTS[m[1]])}.`); }
    if (m[1] === "weights") { try { const w = JSON.parse(v); if (typeof w !== "object") throw 0; v = JSON.stringify(w); } catch { return r('Weights are JSON, like {"views":0.01,"replies":3}.'); } }
    if (/_hour$/.test(m[1]) && !(/^\d{1,2}$/.test(v) && +v <= 23)) return r("Hours run from 0 to 23, Amsterdam time.");
    if (["daily_cap", "per_day", "keep_days"].includes(m[1]) && !(/^\d+$/.test(v) && +v >= 1 && +v <= 100000)) return r(`${m[1]} is a whole number, like /set ${m[1]} ${DEFAULTS[m[1]]}`);
    if (m[1] === "preview_min_focus" && !(/^(0(\.\d+)?|1(\.0+)?)$/.test(v))) return r("preview_min_focus is a number from 0 to 1, like 0.25");
    if (m[1] === "board_day" && !(+v >= 1 && +v <= 7)) return r("Days run from 1 (Monday) to 7 (Sunday).");
    if (["digest", "board"].includes(m[1]) && !["on", "off"].includes(v)) return r("That one is on or off.");
    if (m[1] === "focus" && !["ai", "rules", "off"].includes(v)) return r("focus is ai, rules or off.");
    if (m[1] === "team") { const hs = v.split(/[\s,]+/).map((h) => h.replace(/^@/, "").toLowerCase()).filter(Boolean); if (hs.some((h) => !/^[a-z0-9_]{1,15}$/.test(h))) return r("team is a list of X handles: /set team ubik_gold 0rxbt"); v = hs.join(" "); }
    if (m[1] === "node_start" && !(/^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v + "T12:00:00Z").getUTCDay() === 1)) return r("node_start is a Monday, like 2026-11-02.");
    if (["previews", "preview_replies", "narrative", "community_steer"].includes(m[1]) && !["on", "off"].includes(v)) return r("That one is on or off.");
    if (m[1] === "scene_queries") { try { const q = JSON.parse(v); if (!Array.isArray(q) || q.some((x) => typeof x !== "string")) throw 0; } catch { return r('scene_queries is a JSON list of X searches, like ["\\"AI streamer\\" lang:en"].'); } }
    await cfgSet(env, m[1], v);
    return r(`${m[1]} = ${esc(v)}`);
  }
}

/* ---------------- linking an X account ---------------- */

export async function link(body, user, env) {
  if (!user || user.p !== "x") throw env._refuse("Sign in with X to link your account.", 401);
  const t = await env._unsign(String((body && body.t) || ""));
  if (!t || t.k !== "link" || !t.tg) throw env._refuse("This link has expired. Ask the bot for a new one with /link.", 400);
  const xid = String(user.sub).replace(/^x:/, "");
  await env.DB.prepare("UPDATE tg_people SET x_id = NULL, x_handle = NULL, linked_at = NULL WHERE x_id = ? AND tg_id != ?").bind(xid, t.tg).run();
  const at = iso(now());
  await env.DB.prepare("INSERT INTO tg_people (tg_id, first_seen, last_seen, x_id, x_handle, linked_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(tg_id) DO UPDATE SET x_id = excluded.x_id, x_handle = excluded.x_handle, linked_at = excluded.linked_at")
    .bind(t.tg, at, at, xid, String(user.h).toLowerCase(), at).run();
  await say(env, t.tg, `Linked to <b>${xh(user.h)}</b>. Welcome, Ubikistanian. Your posts about UBIK now count on the Red Ripple board ${SIGN}`);
  return { handle: user.h };
}

/* ---------------- who gets scored: the watch list plus linked members ---------------- */

async function watched(env) {
  return (await env.DB.prepare("SELECT handle FROM x_watch UNION SELECT x_handle FROM tg_people WHERE x_handle IS NOT NULL ORDER BY 1").all()).results.map((r) => r.handle);
}

/* ---------------- X: finding and measuring posts ---------------- */

const trim = (v) => String(v || "").trim();
const rfc = (v) => encodeURIComponent(v).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
// OAuth 1.0a HMAC-SHA1 signature over method, URL and every parameter (query and oauth_*)
export async function oauth1Header(method, url, params, k, nonce, ts) {
  const o = { oauth_consumer_key: k.key, oauth_nonce: nonce || Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""), oauth_signature_method: "HMAC-SHA1", oauth_timestamp: String(ts || Math.floor(Date.now() / 1000)), oauth_token: k.token, oauth_version: "1.0" };
  const all = Object.entries(Object.assign({}, params, o)).map(([a, b]) => [rfc(a), rfc(b)]).sort((x, y) => x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] < y[1] ? -1 : 1);
  const base = [method.toUpperCase(), rfc(url), rfc(all.map(([a, b]) => a + "=" + b).join("&"))].join("&");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(rfc(k.secret) + "&" + rfc(k.tokenSecret)), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(base)))));
  return "OAuth " + Object.entries(Object.assign(o, { oauth_signature: sig })).sort().map(([a, b]) => `${rfc(a)}="${rfc(b)}"`).join(", ");
}
// returns { get(path, params) } or { error } explaining what is missing or what X said
async function xAuth(env) {
  const k = { key: trim(env.X_READ_KEY), secret: trim(env.X_READ_SECRET), token: trim(env.X_READ_TOKEN), tokenSecret: trim(env.X_READ_TOKEN_SECRET) };
  if (!k.key || !k.secret) return { error: "The X keys are not set on the desk." };
  const run = async (path, params, headers) => {
    const url = "https://api.x.com/2" + path;
    const qs = Object.entries(params || {}).map(([a, b]) => rfc(a) + "=" + rfc(b)).join("&");
    const r = await fetch(url + (qs ? "?" + qs : ""), { headers: await headers(url, params || {}) });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, j };
  };
  if (k.token && k.tokenSecret) return { get: (path, params) => run(path, params, async (url, p) => ({ Authorization: await oauth1Header("GET", url, p, k) })) };
  let bearer = env.KV ? await env.KV.get("ripple:x_bearer") : null;
  if (!bearer) {
    const r = await fetch("https://api.x.com/oauth2/token", { method: "POST", headers: { Authorization: "Basic " + btoa(`${k.key}:${k.secret}`), "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
    const j = await r.json().catch(() => ({}));
    if (!j.access_token) return { error: `X refused the app sign-in (${r.status}${j.errors && j.errors[0] ? ": " + (j.errors[0].message || j.errors[0].code) : j.error ? ": " + j.error : ""}).` };
    bearer = j.access_token;
    if (env.KV) await env.KV.put("ripple:x_bearer", bearer, { expirationTtl: 86400 });
  }
  return { get: (path, params) => run(path, params, async () => ({ Authorization: "Bearer " + bearer })) };
}
function xError(status, j) {
  const e = (j && (j.detail || j.title || (j.errors && j.errors[0] && (j.errors[0].message || j.errors[0].detail)))) || "";
  return `X answered ${status}${e ? ": " + short(e, 160) : ""}`;
}
// X bills each post once per UTC day however often it is read, so reads are counted as unique posts per UTC day
const utcDay = () => new Date().toISOString().slice(0, 10);
const capOf = (c) => parseInt(String(c.daily_cap).replace(/[^\d]/g, ""), 10) || parseInt(DEFAULTS.daily_cap, 10);
export async function readsToday(env) { return (await env.DB.prepare("SELECT COUNT(*) AS n FROM x_reads WHERE day = ?").bind(utcDay()).first()).n; }
async function budget(env, c, ids) { // records the posts read; returns how many more may be read today
  const day = utcDay();
  for (const id of ids || []) await env.DB.prepare("INSERT OR IGNORE INTO x_reads (day, id) VALUES (?, ?)").bind(day, String(id)).run();
  return Math.max(0, capOf(c) - await readsToday(env));
}
const fullText = (t) => String((t.note_tweet && t.note_tweet.text) || t.text || "").slice(0, 2000);
const live = (m) => JSON.stringify(Object.assign({}, m || {}, { _at: iso(now()) }));
function kindOf(t) { const r = (t.referenced_tweets || []).map((x) => x.type); return r.includes("quoted") ? "quote" : r.includes("replied_to") ? "reply" : "post"; }
function impactOf(m, w) {
  if (!m) return null;
  return Math.round(((m.impression_count || 0) * (w.views || 0) + (m.reply_count || 0) * (w.replies || 0) + (m.quote_count || 0) * (w.quotes || 0) + (m.bookmark_count || 0) * (w.bookmarks || 0) + (m.retweet_count || 0) * (w.reposts || 0) + (m.like_count || 0) * (w.likes || 0)) * 10) / 10;
}

export async function discover(env, c) {
  c = Object.assign({}, DEFAULTS, c);
  const x = await xAuth(env); if (x.error) return { error: x.error };
  const all = await watched(env);
  if (!all.length) return { found: 0 };
  const fresh = new Set((await env.DB.prepare("SELECT handle FROM x_watch WHERE searched_at IS NULL").all()).results.map((r) => r.handle));
  const runAt = iso(Date.now() - 30_000);
  const regular = all.filter((h) => !fresh.has(h)), newOnes = all.filter((h) => fresh.has(h));
  const since0 = c.last_search && Date.parse(c.last_search) > Date.now() - 6.9 * 864e5 ? c.last_search : iso(Date.now() - 864e5);
  let found = 0;
  for (const [handles, since] of [[regular, since0], [newOnes, iso(Date.now() - 3 * 864e5)]]) {
    if (!handles.length) continue;
    const r = await searchHandles(env, c, x, handles, since);
    found += r.found || 0;
    if (r.error || r.capped) return Object.assign(r, { found });
  }
  for (const h of newOnes) await env.DB.prepare("UPDATE x_watch SET searched_at = ? WHERE handle = ?").bind(runAt, h).run();
  await cfgSet(env, "last_search", runAt);
  return { found };
}

async function searchHandles(env, c, x, handles, since) {
  let base = c.no_cashtag ? '(ubik OR ubikistan OR "ubik.gold" OR @ubik_gold)' : '(ubik OR ubikistan OR "ubik.gold" OR @ubik_gold OR $UBIK)';
  const chunks = []; let cur = [];
  for (const h of handles) { const next = [...cur, "from:" + h]; if ((base + " (" + next.join(" OR ") + ") -is:retweet").length > 480 && cur.length) { chunks.push(cur); cur = ["from:" + h]; } else cur = next; }
  if (cur.length) chunks.push(cur);
  let found = 0;
  for (let i = 0; i < chunks.length; i++) {
    let token = "", pages = 0;
    do {
      if (await budget(env, c) <= 0) return { found, capped: true };
      const q = `${base} (${chunks[i].join(" OR ")}) -is:retweet`;
      const p = { query: q, start_time: since, max_results: "100", "tweet.fields": "created_at,public_metrics,referenced_tweets,author_id,note_tweet", expansions: "author_id", "user.fields": "username" };
      if (token) p.next_token = token;
      const { status, j } = await x.get("/tweets/search/recent", p);
      if (status === 400 && !c.no_cashtag && JSON.stringify(j).toLowerCase().includes("cashtag")) { await cfgSet(env, "no_cashtag", "1"); c.no_cashtag = "1"; base = '(ubik OR ubikistan OR "ubik.gold" OR @ubik_gold)'; i--; break; }
      if (status !== 200) return { found, error: xError(status, j) };
      const users = Object.fromEntries(((j.includes && j.includes.users) || []).map((u) => [u.id, u.username]));
      const data = j.data || [];
      await budget(env, c, data.map((t) => t.id));
      for (const t of data) {
        await env.DB.prepare("INSERT INTO x_posts (id, author_id, handle, created_at, text, kind, source, found_at, metrics) VALUES (?, ?, ?, ?, ?, ?, 'search', ?, ?) ON CONFLICT(id) DO UPDATE SET author_id = excluded.author_id, handle = excluded.handle, created_at = excluded.created_at, text = excluded.text, kind = excluded.kind, metrics = CASE WHEN x_posts.measured_at IS NULL THEN excluded.metrics ELSE x_posts.metrics END")
          .bind(t.id, t.author_id, String(users[t.author_id] || "").toLowerCase(), t.created_at, fullText(t), kindOf(t), iso(now()), live(t.public_metrics)).run();
        found++;
      }
      token = (j.meta && j.meta.next_token) || ""; pages++;
    } while (token && pages < 5);
  }
  return { found };
}

export async function measure(env, c) {
  c = Object.assign({}, DEFAULTS, c);
  const x = await xAuth(env); if (x.error) return { error: x.error };
  const cutoff = iso(Date.now() - 48 * 3600e3);
  const due = (await env.DB.prepare("SELECT id, created_at FROM x_posts WHERE measured_at IS NULL AND (created_at IS NULL OR created_at <= ?) ORDER BY found_at LIMIT 100").bind(cutoff).all()).results;
  const spare = (await budget(env, c)) > capOf(c) / 4;
  const young = !spare ? [] : (await env.DB.prepare("SELECT id, created_at, metrics FROM x_posts WHERE measured_at IS NULL AND created_at > ? ORDER BY created_at DESC LIMIT 300").bind(cutoff).all()).results
    .filter((r) => {
      const age = Date.now() - Date.parse(r.created_at); let at = 0;
      try { at = Date.parse(JSON.parse(r.metrics || "{}")._at || 0) || 0; } catch {}
      const step = age >= 24 * 3600e3 ? 24 : age >= 6 * 3600e3 ? 6 : 0;          // refresh once after 6 h and once after 24 h
      return step && at < Date.parse(r.created_at) + step * 3600e3;
    });
  const results = due.concat(young).slice(0, 100);
  if (!results.length) return { measured: 0, refreshed: 0 };
  const left = await budget(env, c); if (left <= 0) return { measured: 0, capped: true };
  const ids = results.slice(0, left).map((r) => r.id);
  if (!ids.length) return { measured: 0, refreshed: 0 };
  const { status, j } = await x.get("/tweets", { ids: ids.join(","), "tweet.fields": "created_at,public_metrics,referenced_tweets,author_id,note_tweet", expansions: "author_id", "user.fields": "username" });
  if (status !== 200) return { measured: 0, error: xError(status, j) };
  const users = Object.fromEntries(((j.includes && j.includes.users) || []).map((u) => [u.id, u.username]));
  const w = JSON.parse(c.weights);
  let measured = 0, refreshed = 0;
  await budget(env, c, (j.data || []).map((t) => t.id));
  const seen = new Set();
  for (const t of j.data || []) {
    seen.add(t.id);
    const old = Date.parse(t.created_at) <= Date.now() - 48 * 3600e3;
    await env.DB.prepare("UPDATE x_posts SET author_id = ?, handle = ?, created_at = ?, text = ?, kind = ?, metrics = ?, measured_at = ?, impact = ? WHERE id = ?")
      .bind(t.author_id, String(users[t.author_id] || "").toLowerCase(), t.created_at, fullText(t), kindOf(t), live(t.public_metrics), old ? iso(now()) : null, old ? impactOf(t.public_metrics, w) : null, t.id).run();
    if (old) measured++; else refreshed++;
  }
  for (const id of ids) if (!seen.has(id)) await env.DB.prepare("UPDATE x_posts SET measured_at = ?, impact = 0, metrics = '{\"gone\":true}' WHERE id = ?").bind(iso(now()), id).run();
  return { measured, refreshed };
}

/* ---------------- the AI ---------------- */

// one call to the model; no thinking step, so the whole allowance goes to the written answer
async function claude(env, c, system, content, maxTokens) {
  const call = (extra) => fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": String(env.ANTHROPIC_API_KEY || "").trim(), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ model: c.ai_model, max_tokens: maxTokens, system, messages: [{ role: "user", content }] }, extra)) });
  let r = await call({ thinking: { type: "disabled" } });
  let j = await r.json().catch(() => ({}));
  if (r.status === 400 && /thinking/i.test(JSON.stringify(j))) { r = await call({}); j = await r.json().catch(() => ({})); }
  const text = (j.content || []).filter((x) => x.type === "text").map((x) => x.text).join("\n").trim();
  const why = `${r.status}${j.error ? " " + short(j.error.message || j.error.type || "", 120) : ""}${j.stop_reason ? " · stopped: " + j.stop_reason : ""}${j.content ? " · blocks: " + (j.content.map((x) => x.type).join(",") || "none") : ""}`;
  return { ok: r.ok && !!text, text, why };
}
const teamOf = (c) => new Set(String(c.team || "").toLowerCase().split(/[\s,]+/).map((h) => h.replace(/^@/, "")).filter(Boolean));

/* ---------------- the playbook: ubikistan.org/ripple, read live ---------------- */

const PLAYBOOK_URL = "https://ubikistan.org/ripple/";
const FORMATS = ["update", "long form", "thread", "meme", "creative", "team comms", "tv signal", "price talk", "reply", "other"];
const LEAD = ["", "thread", "meme", "tv signal", "long form", "update", "creative", "long form"]; // Mon..Sun lead formats (Sunday: the confluence piece)
const LEAD_TEXT = ["", "Thread that opens the node", "Memes on the node", "Future of TV signals", "Long form or article", "Dev notes", "Creative projects", "Confluence: the week gathered"];
const PLAYBOOK_FALLBACK = `Project Red Ripple playbook (summary). Thesis nodes, one per week in this order: 1 Generative TV (the moat: an always-on, steerable stream where UBIK lives; shorts cut from it); 2 Characters as channels (people attach to personalities; AIXBT carries UBIK); 3 What the character knows (daily world synthesis, forecasts scored with Brier, record public); 4 Community first (holding 200k UBIK opens the full forecasts; no paid marketing; community is the distribution); 5 The lineage and the world (AIXBT team, Philip K. Dick, Ubikistan, culture before coin).
Weekly rhythm: Mon thread opening the node, Tue memes, Wed future of TV signals, Thu long form, Fri dev notes, Sat creative projects, Sun confluence recap.
Rules: everyone writes their own words, angles not scripts; quote posts with an own angle beat reposts; no price targets, no buy calls, price talk only as own read and never coordinated; avoid many accounts posting in the same minutes; source every number; link the team's public posts.
Language: use forecast, issued, resolves, Brier score, market price, world model, generative TV, the character and its world, live; avoid prediction, call, signal, bet, odds next to a ticker, chatbot, launching soon, yield, meme coin, AI influencer, best AI.`;

export async function playbookText(env) {
  if (env.KV) { const t = await env.KV.get("ripple:playbook"); if (t) return t; }
  try {
    const r = await fetch(PLAYBOOK_URL, { headers: { "User-Agent": "RedRippleBot" } });
    if (!r.ok) throw new Error(String(r.status));
    let h = await r.text();
    h = h.replace(/<(script|style|svg|head)[\s\S]*?<\/\1>/gi, " ").replace(/<\/(p|li|tr|h[1-6]|div|dt|dd|section)>/gi, "\n").replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
      .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
    const t = h.slice(0, 16000);
    if (t.length < 2000) throw new Error("short");
    if (env.KV) await env.KV.put("ripple:playbook", t, { expirationTtl: 6 * 3600 });
    return t;
  } catch (e) { return PLAYBOOK_FALLBACK; }
}

/* ---------------- the scene: what everyone else on X is saying ---------------- */

export async function scanScene(env, c) {
  c = Object.assign({}, DEFAULTS, c);
  if (c.narrative !== "on") return { skipped: "off" };
  const x = await xAuth(env); if (x.error) return { error: x.error };
  let queries; try { queries = JSON.parse(c.scene_queries); } catch { queries = []; }
  const runs = [["ubik", '(ubik OR "$UBIK" OR "ubik.gold" OR @ubik_gold OR ubikistan) -is:retweet', 60], ...queries.map((q, i) => ["wider" + i, q, 40])];
  let read = 0;
  await env.DB.prepare("DELETE FROM x_scene WHERE found_at < ?").bind(iso(Date.now() - 7 * 864e5)).run();
  for (const [tag, q, n] of runs) {
    if (await budget(env, c) < n) return { read, capped: true };
    const { status, j } = await x.get("/tweets/search/recent", { query: q, max_results: String(n), sort_order: "relevancy", start_time: iso(Date.now() - 864e5), "tweet.fields": "created_at,public_metrics,author_id,note_tweet", expansions: "author_id", "user.fields": "username" });
    if (status !== 200) { if (status === 400 && tag === "ubik") continue; return { read, error: xError(status, j) }; }
    const users = Object.fromEntries(((j.includes && j.includes.users) || []).map((u) => [u.id, u.username]));
    await budget(env, c, (j.data || []).map((t) => t.id));
    for (const t of j.data || []) {
      await env.DB.prepare("INSERT OR REPLACE INTO x_scene (id, handle, created_at, text, metrics, query, found_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(t.id, String(users[t.author_id] || "").toLowerCase(), t.created_at, fullText(t), JSON.stringify(t.public_metrics || {}), tag, iso(now())).run();
      read++;
    }
  }
  await cfgSet(env, "last_scene", iso(now()));
  return { read };
}

/* ---------------- previews of new posts in the X Posts topic ---------------- */

export async function previews(env, c) {
  c = Object.assign({}, DEFAULTS, c);
  if (c.previews !== "on" || !c.posts_chat || !c.posts_since) return { sent: 0 };
  const watchSet = new Set(await watched(env));
  const minFocus = parseFloat(c.preview_min_focus) || 0;
  const recent = iso(Math.max(Date.parse(c.posts_since) - 6 * 3600e3, Date.now() - 12 * 3600e3));
  const list = (await env.DB.prepare("SELECT x.* FROM x_posts x LEFT JOIN x_previewed v ON v.id = x.id WHERE v.id IS NULL AND x.found_at >= ? AND x.created_at >= ? ORDER BY x.created_at LIMIT 40").bind(c.posts_since, recent).all()).results
    .filter((p) => watchSet.has(p.handle) && (c.preview_replies === "on" || p.kind !== "reply"));
  const fmap = await focusMap(env, list.map((p) => p.id));
  let sent = 0;
  for (const p of list) {
    await env.DB.prepare("INSERT OR IGNORE INTO x_previewed (id, at) VALUES (?, ?)").bind(p.id, iso(now())).run();
    const f = focusFor(c, p, fmap);
    if ((f < minFocus && !teamOf(c).has(p.handle)) || sent >= 15) continue;
    const url = postUrl(p);
    const isTeam = teamOf(c).has(p.handle);
    if (isTeam && p.kind === "reply") continue;
    const label = isTeam ? "🛰 team post · amplify with your own angle" : p.kind === "quote" ? "🔁 quoted" : p.kind === "reply" ? "💬 replied" : "📣 posted";
    await say(env, c.posts_chat, `<b>${xh(p.handle)}</b> ${label} · ⭕ ${f}\n${esc(short(p.text, 300))}\n<a href="${url}">${url.replace("https://", "")}</a> ${SIGN}`,
      Object.assign({ disable_web_page_preview: false, link_preview_options: { url, prefer_small_media: true } }, c.posts_thread ? { message_thread_id: +c.posts_thread } : {}));
    sent++;
  }
  return { sent };
}

/* ---------------- UBIK focus: how much a post is about UBIK ---------------- */

const UBIK_RX = /\$ubik\b|ubik\.gold|ubikistan|@ubik_gold|\bubik\b/gi;
export function ruleFocus(text) {
  const t = String(text || "");
  const hits = (t.match(UBIK_RX) || []).length;
  const others = new Set((t.match(/\$[A-Za-z][A-Za-z0-9]{1,9}\b/g) || []).map((x) => x.toUpperCase()).filter((x) => x !== "$UBIK")).size;
  if (!hits) return 0.2;
  return Math.max(0.1, Math.min(1, Math.round(hits / (hits + others * 0.8) * 100) / 100));
}
async function focusMap(env, ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const { results } = await env.DB.prepare(`SELECT id, focus FROM x_focus WHERE id IN (${part.map(() => "?").join(",")})`).bind(...part).all();
    results.forEach((r) => out[r.id] = r.focus);
  }
  return out;
}
const focusFor = (c, p, map) => c.focus === "off" ? 1 : (p.id in map ? map[p.id] : ruleFocus(p.text));

const CLASSIFY_SYSTEM = `You sort X posts for Project Red Ripple against its playbook. UBIK ($UBIK, ubik.gold, @ubik_gold, Ubikistan) is a crypto project: an AI character with a forecasting engine and a generative TV stream, made by the AIXBT team.
For each post return:
"focus" 0 to 1, how much of the post is about UBIK: 1 about UBIK; 0.7 UBIK main subject with context; 0.5 one of two subjects; 0.25 one of several projects; 0.1 only in a ticker list or in passing; 0 not about UBIK.
"node" which thesis node it serves most: 1 Generative TV (stream, world, video, shorts, steering), 2 Characters as channels (personality, attachment, AIXBT and UBIK as characters, distribution), 3 What the character knows (synthesis, forecasts, scores, record, agents connecting by MCP), 4 Community first (holding, access, community, no paid marketing), 5 Lineage and world (AIXBT history, Philip K. Dick, Ubikistan, culture); 0 none.
"format" one of: ${FORMATS.join(", ")}. A reply is "reply" unless it is clearly something else; "tv signal" is news about AI video, world models, AI streamers or AI characters elsewhere, tied to UBIK.
"fit" 0 to 1, how well it follows the playbook rules and language: own words with an angle; no price targets or buy calls; "forecast" not "prediction"; no "odds" next to a ticker; no hype like "best AI" or "launching soon"; sourced numbers.
"flag" a few words naming the main slip, or "" if none (for example "price target", "says prediction", "list of tickers", "no angle").
Answer with JSON only: [{"id":"...","focus":0.0,"node":0,"format":"...","fit":0.0,"flag":""}] for every post, in the same order.`;

export async function scoreFocus(env, c) {
  c = Object.assign({}, DEFAULTS, c);
  if (c.focus === "off") return { scored: 0 };
  const retry = c.focus === "ai" && env.ANTHROPIC_API_KEY ? iso(Date.now() - 3600e3) : "";
  const posts = (await env.DB.prepare("SELECT x.id, x.text, x.kind FROM x_posts x LEFT JOIN x_class k ON k.id = x.id WHERE (k.id IS NULL OR (k.by = 'rules' AND k.at < ?)) AND x.text != '' AND x.found_at >= ? ORDER BY x.found_at LIMIT 120").bind(retry, iso(Date.now() - 10 * 864e5)).all()).results;
  if (!posts.length) return { scored: 0 };
  let scored = 0;
  for (let i = 0; i < posts.length; i += 20) {
    const batch = posts.slice(i, i + 20);
    let got = {}, cls = {}, by = "rules";
    if (c.focus === "ai" && env.ANTHROPIC_API_KEY) {
      try {
        const a = await claude(env, c, CLASSIFY_SYSTEM, JSON.stringify(batch.map((p) => ({ id: p.id, kind: p.kind, text: short(p.text, 1200) }))), 4000);
        const txt = a.text;
        let arr;
        try { arr = JSON.parse(txt.slice(txt.indexOf("["), txt.lastIndexOf("]") + 1)); }
        catch (e) { await cfgSet(env, "ai_error", `${iso(now()).slice(0, 16)} sorting: answer not readable (${a.why}): ${short(txt, 100)}`); throw e; }
        arr.forEach((x) => {
          const f = Number(x.focus); if (!x || !x.id) return;
          if (f >= 0 && f <= 1) got[String(x.id)] = Math.round(f * 100) / 100;
          const n = parseInt(x.node, 10), fit = Number(x.fit);
          cls[String(x.id)] = { node: n >= 0 && n <= 5 ? n : 0, format: FORMATS.includes(x.format) ? x.format : "other", fit: fit >= 0 && fit <= 1 ? Math.round(fit * 100) / 100 : null, flag: short(String(x.flag || ""), 60) };
        });
        by = "ai";
      } catch (e) { got = {}; cls = {}; by = "rules"; if (!/answer not readable/.test((await cfgAll(env)).ai_error || "")) await cfgSet(env, "ai_error", `${iso(now()).slice(0, 16)} sorting: ${short(String(e && e.message || e), 140)}`); }
    }
    for (const p of batch) {
      const f = p.id in got ? got[p.id] : ruleFocus(p.text);
      // an admin's /focus correction stays
      await env.DB.prepare("INSERT INTO x_focus (id, focus, by, at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET focus = excluded.focus, by = excluded.by, at = excluded.at WHERE x_focus.by != 'admin'").bind(p.id, f, p.id in got ? by : "rules", iso(now())).run();
      const k = cls[p.id] || { node: 0, format: p.kind === "reply" ? "reply" : "other", fit: null, flag: "" };
      await env.DB.prepare("INSERT OR REPLACE INTO x_class (id, node, format, fit, flag, by, at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(p.id, k.node, k.format, k.fit, k.flag, cls[p.id] ? "ai" : "rules", iso(now())).run();
      scored++;
    }
  }
  return { scored };
}

/* ---------------- the board ---------------- */

export async function board(env, week) {
  const c = await cfgAll(env);
  const wk = week || isoWeek(local(now()).day);
  const { results } = await env.DB.prepare("SELECT * FROM x_posts WHERE created_at >= ? ORDER BY created_at").bind(iso(Date.now() - 400 * 864e5 * (week ? 1 : 0) - 10 * 864e5)).all();
  const perDay = parseInt(c.per_day, 10) || 3;
  const w = JSON.parse(c.weights);
  const byHandle = Object.fromEntries((await watched(env)).map((h) => [h, true]));
  const team = teamOf(c);
  const fmap = await focusMap(env, results.map((p) => p.id));
  const rows = {}, count = {};
  for (const p of results) {
    if (!p.created_at || !p.handle || !byHandle[p.handle] || team.has(p.handle)) continue; // the board: watch list and linked members, not the team
    const d = local(p.created_at).day;
    if (isoWeek(d) !== wk) continue;
    const k = p.handle + "|" + d; count[k] = (count[k] || 0) + 1;
    const r = rows[p.handle] || (rows[p.handle] = { handle: p.handle, member: !!byHandle[p.handle], posts: 0, counted: 0, impact: 0, pending: 0, views: 0, replies: 0, quotes: 0, bookmarks: 0, best: null });
    r.posts++;
    if (count[k] > perDay) continue;
    r.counted++;
    const m = metricsOf(p), score = (p.measured_at != null ? (p.impact || 0) : (impactOf(m, w) || 0)) * focusFor(c, p, fmap);
    if (p.measured_at == null) r.pending++;
    r.impact += score; r.views += m.impression_count || 0; r.replies += m.reply_count || 0; r.quotes += m.quote_count || 0; r.bookmarks += m.bookmark_count || 0;
    if (!r.best || score > (r.best.impact || 0)) r.best = { id: p.id, impact: Math.round(score), url: postUrl(p), kind: p.kind };
  }
  const list = Object.values(rows).map((r) => Object.assign(r, { impact: Math.round(r.impact) })).sort((a, b) => b.impact - a.impact || b.counted - a.counted);
  const chat = (await env.DB.prepare("SELECT d.tg_id, SUM(d.msgs) AS msgs, p.username, p.name FROM tg_daily d LEFT JOIN tg_people p ON p.tg_id = d.tg_id WHERE d.day >= ? GROUP BY d.tg_id ORDER BY msgs DESC LIMIT 5").bind(weekStartDay(wk)).all()).results;
  return { week: wk, rows: list, chat: chat.map((x) => ({ who: who(x), msgs: x.msgs })), per_day: perDay };
}
function metricsOf(p) { try { return JSON.parse(p.metrics || "{}") || {}; } catch { return {}; } }
const k1 = (n) => n >= 10000 ? Math.round(n / 1000) + "k" : n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
function weekStartDay(wk) {
  const [y, w] = wk.split("-W").map(Number);
  const j4 = new Date(Date.UTC(y, 0, 4)); const dow = j4.getUTCDay() || 7;
  const mon = new Date(Date.UTC(y, 0, 4 - dow + 1 + (w - 1) * 7));
  return mon.toISOString().slice(0, 10);
}
function boardText(b, community) {
  const lines = [`${SIGN} <b>Red Ripple · ${b.week}</b>`, community ? `${pick(GREET)}. Ranked by reach of posts about UBIK on X. Thank you all 🙏` : "Ranked by impact. Numbers are live until a post is 48 h old, then fixed. /check name shows the posts.", ""];
  if (!b.rows.length) lines.push("No scored posts yet this week.");
  b.rows.slice(0, 10).forEach((r, i) => {
    const medal = ["🥇", "🥈", "🥉"][i] || `${i + 1}.`;
    lines.push(`${medal} ${xh(r.handle)} · ⚡ ${r.impact} · 📝 ${r.counted} · 👀 ${k1(r.views)} · 💬 ${r.replies}${r.best ? ` · <a href="${r.best.url}">🔗 best</a>` : ""}${i === 0 && r.impact > 0 ? " · 🔥 Ubikly mode" : ""}`);
  });
  if (b.chat.length) lines.push("\n🗣 Most active in the chat: " + b.chat.map((x) => `${esc(x.who)} (${x.msgs})`).join(", "));
  const views = b.rows.reduce((t, r) => t + r.views, 0);
  if (b.rows.length) lines.push(`\n👀 ${k1(views)} views this week together${views >= 1e6 ? ". Ubillions incoming" : views >= 1e5 ? ", on the road to Ubillions" : ""} ${SIGN}`);
  if (b.rows.length && !community) lines.push("⚡ impact · 📝 posts · 👀 views · 💬 replies");
  return lines.join("\n");
}
async function checkText(env, arg) {
  const h = String(arg || "").trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(h)) return "Use /check name, for example /check spiegeltrades";
  const c = await cfgAll(env), w = JSON.parse(c.weights), perDay = parseInt(c.per_day, 10) || 3;
  const wk = isoWeek(local(now()).day);
  const posts = (await env.DB.prepare("SELECT * FROM x_posts WHERE handle = ? AND created_at >= ? ORDER BY created_at").bind(h, iso(Date.now() - 10 * 864e5)).all()).results.filter((p) => isoWeek(local(p.created_at).day) === wk);
  if (!posts.length) return `No posts about UBIK from ${xh(h)} found this week.`;
  const perDayCount = {}, fmap = await focusMap(env, posts.map((p) => p.id));
  const cls = {}; for (const p of posts) { const k = await env.DB.prepare("SELECT node, format, fit, flag FROM x_class WHERE id = ?").bind(p.id).first(); if (k) cls[p.id] = k; }
  const lines = [`🔍 <b>${xh(h)} · ${wk}</b> · ${posts.length} post${posts.length === 1 ? "" : "s"} found`];
  for (const p of posts.slice(-12)) {
    const d = local(p.created_at).day; perDayCount[d] = (perDayCount[d] || 0) + 1;
    const m = metricsOf(p), raw = p.measured_at != null ? p.impact : impactOf(m, w), f = focusFor(c, p, fmap), score = (raw || 0) * f;
    const state = perDayCount[d] > perDay ? "⏸ not counted (over the daily limit)" : p.measured_at != null ? "✅ fixed" : "🟢 live";
    lines.push(`\n${d.slice(5)} <a href="${postUrl(p)}">${p.kind}</a> · 👀 ${k1(m.impression_count || 0)} 💬 ${m.reply_count || 0} 🔁 ${m.quote_count || 0} 🔖 ${m.bookmark_count || 0} ♻️ ${m.retweet_count || 0} ❤️ ${m.like_count || 0}\n⚡ ${Math.round(raw || 0)} × ⭕ focus ${f} = <b>${Math.round(score)}</b> · ${state}` + (cls[p.id] ? `\n🧩 ${cls[p.id].node ? "node " + cls[p.id].node : "no node"} · ${esc(cls[p.id].format)}${cls[p.id].fit != null ? ` · fit ${cls[p.id].fit}` : ""}${cls[p.id].flag ? ` · ⚠️ ${esc(cls[p.id].flag)}` : ""}` : ""));
  }
  lines.push(`\n⚡ Impact = (views × ${w.views} + replies × ${w.replies} + quotes × ${w.quotes} + bookmarks × ${w.bookmarks} + reposts × ${w.reposts} + likes × ${w.likes}) × UBIK focus (0 to 1, how much the post is about UBIK; set by ${c.focus === "ai" ? "the AI" : c.focus === "rules" ? "a rule" : "nothing: off"}). Correct one with /focus link 0.8`);
  return lines.join("\n");
}

async function meText(env, tgId) {
  const p = await env.DB.prepare("SELECT * FROM tg_people WHERE tg_id = ?").bind(tgId).first();
  if (!p || !p.x_handle) return "I don't know your X account yet. Open a private chat with me and send /link, or ask a core admin to /watch you.";
  const b = await board(env);
  const i = b.rows.findIndex((r) => r.handle === p.x_handle);
  if (i < 0) return `${xh(p.x_handle)}: no posts about UBIK found yet this week.`;
  const r = b.rows[i];
  return `${["🥇", "🥈", "🥉"][i] || "⭕"} ${xh(p.x_handle)}${i === 0 ? " · 🔥 Ubikly mode" : ""} · ${b.week}: place ${i + 1} of ${b.rows.length}, impact ${r.impact}, ${r.counted} counted post${r.counted === 1 ? "" : "s"}, ${k1(r.views)} views, ${r.replies} replies${r.pending ? ` (${r.pending} still live)` : ""}.`;
}

/* ---------------- today and the digest ---------------- */

async function ripple(env, coll, id) {
  const r = await env.DB.prepare("SELECT data FROM ripple WHERE coll = ? AND id = ?").bind(coll, id).first();
  return r ? JSON.parse(r.data) : null;
}
async function nodeNow(env) {
  const c = await cfgAll(env);
  const s = await ripple(env, "settings", "main");
  const start = (/^\d{4}-\d{2}-\d{2}$/.test(c.node_start || "") && c.node_start) || (s && s.start) || "2026-11-09";
  const days = Math.floor((Date.parse(local(now()).day) - Date.parse(start)) / 864e5);
  return days < 0 ? null : Math.floor(days / 7) % 5;
}
export async function coverage(env, c, days) {
  c = Object.assign({}, DEFAULTS, c);
  const watchSet = new Set(await watched(env));
  const teamSet = teamOf(c);
  const rows = (await env.DB.prepare("SELECT x.id, x.handle, x.created_at, x.metrics, x.text, k.node, k.format, k.fit, k.flag FROM x_posts x LEFT JOIN x_class k ON k.id = x.id WHERE x.created_at >= ?").bind(iso(Date.now() - days * 864e5)).all()).results.filter((p) => watchSet.has(p.handle) && !teamSet.has(p.handle));
  const nodes = {}, formats = {}, flags = [];
  let fitSum = 0, fitN = 0;
  for (const p of rows) {
    const v = metricsOf(p).impression_count || 0;
    const n = p.node == null ? -1 : p.node, f = p.format || "unsorted";
    (nodes[n] = nodes[n] || { posts: 0, views: 0 }); nodes[n].posts++; nodes[n].views += v;
    (formats[f] = formats[f] || { posts: 0, views: 0 }); formats[f].posts++; formats[f].views += v;
    if (p.fit != null) { fitSum += p.fit; fitN++; }
    if (p.flag) flags.push({ handle: p.handle, url: postUrl(p), flag: p.flag, fit: p.fit });
  }
  const n = await nodeNow(env), l = local(now());
  return { days, posts: rows.length, week_node: n == null ? null : n + 1, week_node_name: n == null ? "setup week (node 1 not started)" : NODES[n], today_lead: LEAD_TEXT[l.weekday], today_lead_format: LEAD[l.weekday], nodes, formats, avg_fit: fitN ? Math.round(fitSum / fitN * 100) / 100 : null, flags: flags.slice(-12) };
}

async function playbookCheckText(env, c, core) {
  const cv = await coverage(env, c, 7);
  const L = [`🧭 <b>Playbook check · last 7 days</b>`, `🧩 This week: ${cv.week_node ? `node ${cv.week_node} · ${esc(cv.week_node_name)}` : esc(cv.week_node_name)}`, `✍️ Today's lead: ${esc(cv.today_lead)}`, `📝 ${cv.posts} posts sorted${cv.avg_fit != null ? ` · playbook fit ${cv.avg_fit}` : ""}`, "", "<b>Nodes</b>"];
  NODES.forEach((name, i) => { const x = cv.nodes[i + 1]; L.push(`${x ? "✅" : "🕳"} ${i + 1} ${esc(name)}${x ? ` · ${x.posts} post${x.posts === 1 ? "" : "s"} · 👀 ${k1(x.views)}` : " · nothing yet"}${cv.week_node === i + 1 ? " ← this week" : ""}`); });
  if (cv.nodes[0]) L.push(`➖ no node · ${cv.nodes[0].posts} posts`);
  if (cv.nodes[-1]) L.push(`⏳ not sorted yet · ${cv.nodes[-1].posts} posts`);
  L.push("", "<b>Formats</b>");
  const fl = Object.entries(cv.formats).sort((a, b) => b[1].posts - a[1].posts);
  L.push(fl.map(([f, x]) => `${esc(f)} ${x.posts}${x.posts ? ` (👀 ${k1(x.views)})` : ""}`).join(" · ") || "none yet");
  const missing = FORMATS.filter((f) => !["reply", "other", "price talk"].includes(f) && !cv.formats[f]);
  if (missing.length) L.push(`🕳 Not seen this week: ${missing.join(", ")}`);
  if (core && cv.flags.length) { L.push("", "<b>Off the playbook</b>"); cv.flags.slice(-6).forEach((x) => L.push(`⚠️ ${xh(x.handle)} · ${esc(x.flag)} · <a href="${x.url}">post</a>`)); }
  return L.join("\n");
}

async function todayText(env) {
  const n = await nodeNow(env), l = local(now());
  const lead = ["", "Thread that opens the node", "Memes on the node", "Future of TV signals", "Long form or article", "Dev notes", "Creative projects", "Confluence: the week gathered"][l.weekday];
  const posts = (await env.DB.prepare("SELECT COUNT(*) AS n FROM x_posts WHERE created_at >= ?").bind(iso(Date.now() - 864e5)).first()).n;
  return `${pick(GREET)} ${SIGN}\n📅 <b>Today</b>\n🧩 Node: ${n == null ? "setup week" : `${n + 1} · ${NODES[n]}`}\n✍️ Lead format: ${lead}\n📝 Posts about UBIK in the last 24 h: ${posts}`;
}

function shingles(s) { const w = String(s).toLowerCase().replace(/https?:\S+/g, "").split(/\W+/).filter(Boolean); const out = new Set(); for (let i = 0; i + 2 < w.length; i++) out.add(w.slice(i, i + 3).join(" ")); return out; }
function similar(a, b) { const A = shingles(a), B = shingles(b); if (A.size < 4 || B.size < 4) return 0; let n = 0; for (const x of A) if (B.has(x)) n++; return n / Math.min(A.size, B.size); }

export async function gather(env, c) {
  c = Object.assign({}, DEFAULTS, c);
  const since = iso(Date.now() - 864e5);
  const chats = [["core", c.core_chat], ["community", c.community_chat]].filter((x) => x[1]);
  const groups = [];
  for (const [role, id] of chats) {
    const { results } = await env.DB.prepare("SELECT m.text, m.at, p.username, p.name FROM tg_msgs m LEFT JOIN tg_people p ON p.tg_id = m.tg_id WHERE m.chat = ? AND m.at >= ? ORDER BY m.at").bind(id, since).all();
    const by = {}; results.forEach((m) => { const k = who(m); by[k] = (by[k] || 0) + 1; });
    const price = results.filter((m) => PRICE.test(m.text)).length;
    groups.push({ role, messages: results.length, people: Object.keys(by).length, top: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 5), price_share: results.length ? Math.round(price / results.length * 100) : 0, sample: results.slice(-150).map((m) => `${who(m)}: ${short(m.text, 280)}`) });
  }
  const found = (await env.DB.prepare("SELECT * FROM x_posts WHERE created_at >= ? ORDER BY created_at").bind(since).all()).results;
  const warnings = [];
  const times = found.filter((p) => p.kind !== "reply").map((p) => ({ t: Date.parse(p.created_at), h: p.handle })).sort((a, b) => a.t - b.t);
  for (let i = 0; i < times.length; i++) { const w = new Set(times.filter((x) => x.t >= times[i].t && x.t < times[i].t + 10 * 60e3).map((x) => x.h)); if (w.size >= 5) { warnings.push(`${w.size} accounts posted or quoted within ten minutes around ${new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(times[i].t))} Amsterdam time`); break; } }
  outer: for (let i = 0; i < found.length; i++) for (let j = i + 1; j < found.length; j++) if (found[i].handle !== found[j].handle && similar(found[i].text, found[j].text) >= 0.6) { warnings.push(`${found[i].handle} and ${found[j].handle} posted near-identical text`); break outer; }
  groups.forEach((g) => { if (g.messages >= 10 && g.price_share >= 40) warnings.push(`${g.price_share}% of the ${g.role} chat was price talk`); });
  const crew = (await env.DB.prepare("SELECT handle FROM ripple_crew").all()).results.map((r) => r.handle);
  const recent = new Set((await env.DB.prepare("SELECT DISTINCT handle FROM x_posts WHERE created_at >= ?").bind(iso(Date.now() - 3 * 864e5)).all()).results.map((r) => r.handle));
  const quiet = crew.filter((h) => !recent.has(h));
  const n = await nodeNow(env);
  const drops = (await env.DB.prepare("SELECT data FROM ripple WHERE coll = 'drops'").all()).results.map((r) => JSON.parse(r.data)).filter((d) => d.date >= local(Date.now() - 864e5).day);
  const formats = {}; found.forEach((p) => formats[p.kind] = (formats[p.kind] || 0) + 1);
  const watchSet = new Set(await watched(env));
  const two = (await env.DB.prepare("SELECT * FROM x_posts WHERE created_at >= ?").bind(iso(Date.now() - 2 * 864e5)).all()).results.filter((p) => watchSet.has(p.handle));
  const f2 = await focusMap(env, two.map((p) => p.id));
  const wts = JSON.parse(c.weights);
  let ours = two.map((p) => { const m = metricsOf(p), focus = focusFor(c, p, f2); return { handle: p.handle, kind: p.kind, url: postUrl(p), views: m.impression_count || 0, replies: m.reply_count || 0, quotes: m.quote_count || 0, focus, impact: Math.round(((p.measured_at != null ? p.impact : impactOf(m, wts)) || 0) * focus), text: short(p.text, 240) }; })
    .sort((a, b) => b.impact - a.impact);
  const teamSet = teamOf(c);
  const teamPosts = ours.filter((p) => teamSet.has(p.handle)).slice(0, 8);
  ours = ours.filter((p) => !teamSet.has(p.handle)).slice(0, 30);
  const hist = (await env.DB.prepare("SELECT created_at, metrics FROM x_posts WHERE created_at >= ?").bind(iso(Date.now() - 14 * 864e5)).all()).results;
  const hours = {}; hist.forEach((p) => { const m = metricsOf(p); if (!m.impression_count) return; const h = local(p.created_at).hour; (hours[h] = hours[h] || { posts: 0, views: 0 }); hours[h].posts++; hours[h].views += m.impression_count; });
  const byHour = Object.entries(hours).filter(([, v]) => v.posts >= 2).map(([h, v]) => ({ hour: +h, posts: v.posts, avg_views: Math.round(v.views / v.posts) })).sort((a, b) => b.avg_views - a.avg_views);
  const scene = (await env.DB.prepare("SELECT * FROM x_scene WHERE created_at >= ? ORDER BY found_at DESC").bind(iso(Date.now() - 2 * 864e5)).all()).results;
  const sceneOut = (q) => scene.filter((p) => q(p)).map((p) => { const m = metricsOf(p); return { handle: p.handle, url: postUrl(p), views: m.impression_count || 0, replies: m.reply_count || 0, likes: m.like_count || 0, text: short(p.text, 240) }; }).sort((a, b) => (b.views + b.likes * 20) - (a.views + a.likes * 20)).slice(0, 15);
  const pb = await coverage(env, c, 7);
  return {
    playbook_coverage: pb,
    team_posts_to_amplify: teamPosts,
    ours, by_hour_amsterdam: byHour.slice(0, 6),
    others_on_ubik: sceneOut((p) => p.query === "ubik" && !watchSet.has(p.handle)),
    wider_conversation: sceneOut((p) => p.query !== "ubik"),
    node: n == null ? "setup week" : `${n + 1} · ${NODES[n]}`, groups,
    x: { posts: found.length, authors: new Set(found.map((p) => p.handle)).size, kinds: formats, top: ours.slice(0, 5).map((p) => ({ handle: p.handle, impact: p.impact, views: p.views, replies: p.replies, focus: p.focus, kind: p.kind, url: p.url, text: short(p.text, 160) })) },
    drops: drops.map((d) => ({ format: d.format, node: d.node, author: d.author, angle: short(d.angle, 160) })),
    warnings, quiet_core: quiet,
  };
}

function plainDigest(d) {
  const L = [`${SIGN} <b>${pick(GREET)}. Red Ripple · morning read</b>`, `🧩 Node of the week: ${esc(d.node)}`];
  L.push(`\n📝 <b>On X, last 24 h</b>\n${d.x.posts} post${d.x.posts === 1 ? "" : "s"} about UBIK from ${d.x.authors} scored account${d.x.authors === 1 ? "" : "s"}` + (Object.keys(d.x.kinds).length ? ` (${Object.entries(d.x.kinds).map(([k, v]) => `${v} ${v === 1 ? k : k === "reply" ? "replies" : k + "s"}`).join(", ")})` : ""));
  if (d.x.top.length) L.push("\n🚀 <b>Furthest reach, last 48 h</b>\n" + d.x.top.slice(0, 3).map((p, i) => `${["🥇", "🥈", "🥉"][i]} ${xh(p.handle)} · ⚡ ${p.impact} · 👀 ${k1(p.views)} · 💬 ${p.replies} · <a href="${p.url}">${p.kind}</a>`).join("\n"));
  d.groups.forEach((g) => L.push(`\n🗣 <b>${g.role === "core" ? "Core group" : "Community group"}</b>\n${g.messages} messages from ${g.people} people` + (g.top.length ? `. Most active: ${g.top.slice(0, 3).map(([k, v]) => `${esc(k)} (${v})`).join(", ")}` : "")));
  if (d.drops.length) L.push(`\n<b>Drops logged</b>\n` + d.drops.map((x) => `${esc(x.format)} by ${esc(x.author)}: ${esc(x.angle)}`).join("\n"));
  if (d.playbook_coverage) { const cv = d.playbook_coverage; const gaps = NODES.map((n, i) => cv.nodes[i + 1] ? null : n).filter(Boolean); L.push(`\n📖 <b>Playbook</b>\nThis week: ${cv.week_node ? `node ${cv.week_node} · ${esc(cv.week_node_name)}` : esc(cv.week_node_name)}. Today: ${esc(cv.today_lead)}.${gaps.length ? ` Nothing yet on: ${gaps.map(esc).join(", ")}.` : ""}`); }
  if (d.warnings.length) L.push(`\n⚠️ <b>Watch</b>\n` + d.warnings.map(esc).join("\n"));
  if (d.quiet_core.length) L.push(`\nNo posts in three days from: ${d.quiet_core.map((h) => xh(h)).join(", ")}`);
  return L.join("\n");
}

const DIGEST_SYSTEM = `You are the steering desk of Project Red Ripple: real $UBIK community members who spread the UBIK thesis on X with posts they write themselves. The thesis: UBIK is building generative TV, an always-on steerable stream where its AI characters live; the forecasts are what the character knows; the community is the distribution.
The playbook text is below; it is the yardstick. You get JSON: how the last 7 days cover the playbook (posts and views per thesis node and format, this week's node, today's lead format, average fit, posts that slipped); our members' posts of the last two days with views, replies and UBIK focus; what everyone else on X said about UBIK; the wider conversation on generative TV, AI characters and AI agents; reach by hour of day; and a sample of the group chats.
Write two parts separated by a line with only ---COMMUNITY---. Start part two with "gUbik" and end both parts with ⭕⭕.
Part one, for the core group, at most 280 words, plain text, no emoji except ⭕⭕, no em dashes, each section starting with its label and a colon:
Narrative: what X is talking about right now around UBIK and next to it, in two or three sentences.
Playbook: this week's node and today's lead format against what was actually posted; which node or format is missing or overdone; name slips worth a quiet word (price talk, prediction wording, ticker lists), at most two.
Working: which of our themes and formats got views and replies, with handles; which fell flat.
Openings: where UBIK fits a conversation that is getting attention, and the team's own recent posts worth quoting with an angle, with the post links to engage with.
Steer: three topics for today that serve this week's node and today's lead format, using what is working and what X is talking about; each one line with why and, where useful, a link to quote or reply to.
Timing: the hours (Amsterdam time) when our posts got most reach, if the data shows it; otherwise say it is too early to tell.
Watch: only real problems (price talk drift, identical wording, many accounts at once), or "Nothing".
Part two, for the wider community group, at most 100 words: "Today's angles" naming today's lead format and the three topics in friendly plain words, and one or two links worth engaging with. No handles of people who did badly, no numbers.
${VOICE}
Rules for both: never write post text for people to copy, give angles; never discuss token price or tell anyone to buy; only use links that are in the data; if the data is thin, say so briefly.`;

async function aiDigest(env, c, d) {
  if (!env.ANTHROPIC_API_KEY) { await cfgSet(env, "ai_error", "no Anthropic key on the desk"); return null; }
  const input = JSON.stringify(d).slice(0, 45000);
  const a = await claude(env, c, DIGEST_SYSTEM + "\n\nTHE PLAYBOOK:\n" + (await playbookText(env)), input, 4000);
  const t = a.text;
  if (!t) { await cfgSet(env, "ai_error", `${iso(now()).slice(0, 16)} steer: ${a.why}`); return null; }
  await cfgSet(env, "ai_error", null);
  const [core, community] = t.split(/^\s*-{2,}\s*COMMUNITY\s*-{2,}\s*$/m);
  return { core: core.trim(), community: (community || "").trim() };
}

export async function sendDigest(env, c, now_) {
  c = Object.assign({}, DEFAULTS, c);
  if (!c.core_chat) return { skipped: "no core group" };
  const d = await gather(env, c);
  const ai = await aiDigest(env, c, d).catch(async (e) => { await cfgSet(env, "ai_error", `${iso(now()).slice(0, 16)} digest: ${short(String(e), 140)}`); return null; });
  const linkify = (t) => untag(esc(t)).replace(/https:\/\/x\.com\/[A-Za-z0-9_]+\/status\/\d+/g, (u) => `<a href="${u}">${u.replace("https://", "")}</a>`);
  const ICON = { Playbook: "📖", Narrative: "🌐", Working: "📈", Openings: "🎯", Steer: "🧭", Timing: "⏰", Watch: "⚠️", Moved: "📈", Thin: "🕳", Next: "🧭" };
  const label = (t) => t.replace(/^(Playbook|Narrative|Working|Openings|Steer|Timing|Watch|Moved|Thin|Next):/gm, (_, k) => `${ICON[k]} <b>${k}</b>:`);
  const aiErr = ai ? "" : ((await cfgAll(env)).ai_error || "");
  const text = ai ? `${SIGN} <b>${pick(GREET)}. Red Ripple · morning read</b>\n🧩 Node of the week: ${esc(d.node)}\n\n${label(linkify(ai.core))}` : plainDigest(d);
  const community0 = ai && ai.community ? `${SIGN} <b>Red Ripple · today</b>\n\n${linkify(ai.community).replace(/^Today's angles:?/m, "🧭 <b>Today's angles</b>")}` : null;
  const community = community0;
  await say(env, c.core_chat, text + (aiErr ? `\n\n🤖 Written read unavailable: ${esc(aiErr)}` : ""), c.core_thread ? { message_thread_id: +c.core_thread } : {});
  if (community && c.community_chat && c.community_steer === "on") await say(env, c.community_chat, community, c.community_thread ? { message_thread_id: +c.community_thread } : {});
  return { sent: true, ai: !!ai, community: !!community };
}

/* ---------------- the regular run (every 15 minutes) ---------------- */

export async function tick(env) {
  if (!env.DB) return;
  const c = await cfgAll(env);
  const out = {};
  if (env.TG_BOT_TOKEN && c.hook !== await hookSecret(env)) out.setup = await setup(env);
  await env.DB.prepare("DELETE FROM tg_msgs WHERE at < ?").bind(iso(Date.now() - (parseInt(c.keep_days, 10) || 7) * 864e5)).run();
  for (const k of Object.keys(c)) if (/^x_reads_/.test(k)) await cfgSet(env, k, null);
  await env.DB.prepare("DELETE FROM x_reads WHERE day < ?").bind(new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10)).run();
  out.discover = await discover(env, c).catch((e) => ({ error: String(e) }));
  out.measure = await measure(env, c).catch((e) => ({ error: String(e) }));
  out.focus = await scoreFocus(env, c).catch((e) => ({ error: String(e) }));
  out.previews = await previews(env, c).catch((e) => ({ error: String(e) }));
  const l = local(now());
  if (c.digest === "on" && l.hour === +c.digest_hour && c.last_digest !== l.day) {
    await cfgSet(env, "last_digest", l.day);
    out.scene = await scanScene(env, c).catch((e) => ({ error: String(e) }));
    out.digest = await sendDigest(env, c).catch((e) => ({ error: String(e) }));
  }
  const wk = isoWeek(l.day);
  if (c.board === "on" && l.weekday === +c.board_day && l.hour === +c.board_hour && c.last_board !== wk) {
    await cfgSet(env, "last_board", wk);
    const b = await board(env);
    if (c.core_chat) await say(env, c.core_chat, boardText(b, false), c.core_thread ? { message_thread_id: +c.core_thread } : {});
    if (c.community_chat) await say(env, c.community_chat, boardText(b, true), c.community_thread ? { message_thread_id: +c.community_thread } : {});
    out.board = true;
  }
  return out;
}
