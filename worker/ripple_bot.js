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
 * Secrets: TG_BOT_TOKEN (from @BotFather), X_READ_KEY and X_READ_SECRET (an X app's consumer keys, for
 * reading posts), ANTHROPIC_API_KEY (optional: the written digest). Settings live in tg_cfg and can be
 * changed from the core group with /set.
 */

// Every release gets a new number and a line here, and a copy in worker/ripple_bot_versions/v<number>.js
// (not loaded; kept so any earlier version can be put back by copying it over this file).
export const VERSION = "1.0";
const CHANGES = [
  ["1.0", "2026-11-05", "First release: reads both groups, links X accounts, finds and measures posts, morning digest, weekly leaderboard, settings."],
];

const DESK = "https://ubikistan-guest-desk.ubikistan-archive.workers.dev";
const LINK_PAGE = "https://ubikistan.org/ripple/link/";
const TZ = "Europe/Amsterdam";
const NODES = ["Generative TV", "Characters as channels", "What the character knows", "Community first", "The lineage and the world"];
const DEFAULTS = {
  digest: "on", digest_hour: "9",
  board: "on", board_day: "7", board_hour: "19",
  daily_cap: "400",              // X posts read per day, at most (about $0.005 each)
  per_day: "3",                  // posts per person per day that count on the leaderboard
  ai_model: "claude-haiku-5-5",
  weights: JSON.stringify({ views: 0.01, replies: 3, quotes: 4, bookmarks: 3, reposts: 2, likes: 0.5 }),
  keep_days: "7",                // how long message text is kept for the digest
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

export async function setup(env) {
  if (!env.TG_BOT_TOKEN) return { ok: false, error: "No bot token yet." };
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
function who(p) { return p ? (p.username ? "@" + p.username : p.name || "someone") : "someone"; }

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
  const chat = String(msg.chat.id), from = msg.from && msg.from.id;
  if (!["core", "community"].includes(role)) return say(env, chat, "Send <b>/setup core</b> in the core group, or <b>/setup community</b> in the community group.");
  if (!await isChatAdmin(env, chat, from)) return say(env, chat, "Only an admin of this group can do that.");
  const current = role === "core" ? c.core_chat : c.community_chat;
  if (current && current !== chat && !(c.core_chat && await isChatAdmin(env, c.core_chat, from)))
    return say(env, chat, `Another group is already set as the ${role} group. An admin of the core group can move it.`);
  await cfgSet(env, role === "core" ? "core_chat" : "community_chat", chat);
  await person(env, msg.from);
  const bot = await botName(env);
  return say(env, chat, `This is now the Red Ripple <b>${role}</b> group. I read the messages here to write the digest and keep the numbers; message text is kept ${esc(c.keep_days)} days, counts longer.\n\nEveryone: link your X account once so your posts count. Open a chat with me and tap Start: ${bot ? `https://t.me/${bot}?start=link` : "find me by name"}`);
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
    const linked = me && me.x_handle ? `You are linked to <b>@${esc(me.x_handle)}</b>. Tap below to link a different account.` : "Link your X account so your posts about UBIK count on the Red Ripple board. It takes one sign-in with X; I only read public posts.";
    return say(env, chat, linked, await linkButton(env, id));
  }
  if (name === "me") return say(env, chat, await meText(env, id));
  if (name === "version") return say(env, chat, versionText());
  if (name === "unlink") { await env.DB.prepare("UPDATE tg_people SET x_id = NULL, x_handle = NULL, linked_at = NULL WHERE tg_id = ?").bind(id).run(); return say(env, chat, "Unlinked. Your posts no longer count."); }
  return say(env, chat, helpText(true));
}

function versionText() {
  return `<b>Red Ripple bot ${VERSION}</b>\n` + CHANGES.slice(-5).reverse().map(([v, d, t]) => `${v} · ${d} · ${esc(t)}`).join("\n");
}

function helpText(dm) {
  return [
    "<b>Red Ripple bot</b>",
    "/link  link your X account" + (dm ? "" : " (in a private chat with me)"),
    "/me  your week so far",
    "/leaderboard  this week's board",
    "/today  node, format and numbers for today",
    "/version  which version of me is running",
    "Core group admins: /digest  /settings  /set name value",
    "I never post, reply or like on X.",
  ].join("\n");
}

async function groupCommand(env, msg, name, arg, c) {
  const chat = String(msg.chat.id), from = msg.from && msg.from.id;
  const core = chat === c.core_chat;
  if (name === "help" || name === "start") return say(env, chat, helpText(false));
  if (name === "link") { const bot = await botName(env); return say(env, chat, `Open a private chat with me and tap Start: https://t.me/${bot}?start=link`, { reply_to_message_id: msg.message_id }); }
  if (name === "me") return say(env, chat, await meText(env, String(from)), { reply_to_message_id: msg.message_id });
  if (name === "leaderboard" || name === "board") return say(env, chat, boardText(await board(env), !core));
  if (name === "today") return say(env, chat, await todayText(env));
  if (name === "version") return say(env, chat, versionText());
  if (!core) return;
  if (!await isChatAdmin(env, chat, from)) return say(env, chat, "That one is for admins of this group.");
  if (name === "digest") return sendDigest(env, c, true);
  if (name === "settings") return say(env, chat, "<b>Settings</b>\n" + SETTABLE.map((k) => `${k} = ${esc(c[k])}`).join("\n") + "\n\nChange one with /set name value. /set name reset goes back to the default.");
  if (name === "set") {
    const m = /^([a-z_]+)\s+([\s\S]+)$/.exec(arg);
    if (!m || !SETTABLE.includes(m[1])) return say(env, chat, "Use /set name value. Names: " + SETTABLE.join(", "));
    let v = m[2].trim();
    if (v === "reset") { await cfgSet(env, m[1], null); return say(env, chat, `${m[1]} is back to ${esc(DEFAULTS[m[1]])}.`); }
    if (m[1] === "weights") { try { const w = JSON.parse(v); if (typeof w !== "object") throw 0; v = JSON.stringify(w); } catch { return say(env, chat, 'Weights are JSON, like {"views":0.01,"replies":3}.'); } }
    if (/_hour$/.test(m[1]) && !(+v >= 0 && +v <= 23)) return say(env, chat, "Hours run from 0 to 23, Amsterdam time.");
    if (m[1] === "board_day" && !(+v >= 1 && +v <= 7)) return say(env, chat, "Days run from 1 (Monday) to 7 (Sunday).");
    if (["digest", "board"].includes(m[1]) && !["on", "off"].includes(v)) return say(env, chat, "That one is on or off.");
    await cfgSet(env, m[1], v);
    return say(env, chat, `${m[1]} = ${esc(v)}`);
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
  await say(env, t.tg, `Linked to <b>@${esc(user.h)}</b>. Your posts about UBIK now count on the Red Ripple board.`);
  return { handle: user.h };
}

/* ---------------- X: finding and measuring posts ---------------- */

async function xBearer(env) {
  if (!env.X_READ_KEY || !env.X_READ_SECRET) return null;
  if (env.KV) { const t = await env.KV.get("ripple:x_bearer"); if (t) return t; }
  const r = await fetch("https://api.x.com/oauth2/token", { method: "POST", headers: { Authorization: "Basic " + btoa(`${env.X_READ_KEY}:${env.X_READ_SECRET}`), "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) return null;
  if (env.KV) await env.KV.put("ripple:x_bearer", j.access_token, { expirationTtl: 86400 });
  return j.access_token;
}
async function budget(env, c, n) { // records n reads; returns how many reads are still allowed today
  const k = "x_reads_" + local(now()).day;
  const used = parseInt(c[k] || "0", 10) + (n || 0);
  if (n) { await cfgSet(env, k, used); c[k] = String(used); }
  return Math.max(0, parseInt(c.daily_cap, 10) - used);
}
async function xGet(env, bearer, path) {
  const r = await fetch("https://api.x.com/2" + path, { headers: { Authorization: "Bearer " + bearer } });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}
function kindOf(t) { const r = (t.referenced_tweets || []).map((x) => x.type); return r.includes("quoted") ? "quote" : r.includes("replied_to") ? "reply" : "post"; }
function impactOf(m, w) {
  if (!m) return null;
  return Math.round(((m.impression_count || 0) * (w.views || 0) + (m.reply_count || 0) * (w.replies || 0) + (m.quote_count || 0) * (w.quotes || 0) + (m.bookmark_count || 0) * (w.bookmarks || 0) + (m.retweet_count || 0) * (w.reposts || 0) + (m.like_count || 0) * (w.likes || 0)) * 10) / 10;
}

export async function discover(env, c) {
  const bearer = await xBearer(env); if (!bearer) return { skipped: "no X keys" };
  const { results } = await env.DB.prepare("SELECT x_handle FROM tg_people WHERE x_handle IS NOT NULL").all();
  const handles = [...new Set(results.map((r) => r.x_handle))];
  if (!handles.length) return { found: 0 };
  const since = c.last_search && Date.parse(c.last_search) > Date.now() - 6.9 * 864e5 ? c.last_search : iso(Date.now() - 864e5);
  const runAt = iso(Date.now() - 30_000);
  let base = c.no_cashtag ? '(ubik OR ubikistan OR "ubik.gold" OR @ubik_gold)' : '(ubik OR ubikistan OR "ubik.gold" OR @ubik_gold OR $UBIK)';
  const chunks = []; let cur = [];
  for (const h of handles) { const next = [...cur, "from:" + h]; if ((base + " (" + next.join(" OR ") + ") -is:retweet").length > 480 && cur.length) { chunks.push(cur); cur = ["from:" + h]; } else cur = next; }
  if (cur.length) chunks.push(cur);
  let found = 0;
  for (let i = 0; i < chunks.length; i++) {
    let token = "", pages = 0;
    do {
      if (await budget(env, c, 0) <= 0) return { found, capped: true };
      const q = `${base} (${chunks[i].join(" OR ")}) -is:retweet`;
      const p = new URLSearchParams({ query: q, start_time: since, max_results: "100", "tweet.fields": "created_at,public_metrics,referenced_tweets,author_id", expansions: "author_id", "user.fields": "username" });
      if (token) p.set("next_token", token);
      const { status, j } = await xGet(env, bearer, "/tweets/search/recent?" + p);
      if (status === 400 && !c.no_cashtag && JSON.stringify(j).toLowerCase().includes("cashtag")) { await cfgSet(env, "no_cashtag", "1"); c.no_cashtag = "1"; base = '(ubik OR ubikistan OR "ubik.gold" OR @ubik_gold)'; i--; break; }
      if (status !== 200) return { found, error: status };
      const users = Object.fromEntries(((j.includes && j.includes.users) || []).map((u) => [u.id, u.username]));
      const data = j.data || [];
      await budget(env, c, data.length);
      for (const t of data) {
        await env.DB.prepare("INSERT INTO x_posts (id, author_id, handle, created_at, text, kind, source, found_at) VALUES (?, ?, ?, ?, ?, ?, 'search', ?) ON CONFLICT(id) DO UPDATE SET author_id = excluded.author_id, handle = excluded.handle, created_at = excluded.created_at, text = excluded.text, kind = excluded.kind")
          .bind(t.id, t.author_id, String(users[t.author_id] || "").toLowerCase(), t.created_at, short(t.text, 400), kindOf(t), iso(now())).run();
        found++;
      }
      token = (j.meta && j.meta.next_token) || ""; pages++;
    } while (token && pages < 5);
  }
  await cfgSet(env, "last_search", runAt);
  return { found };
}

export async function measure(env, c) {
  const bearer = await xBearer(env); if (!bearer) return { skipped: "no X keys" };
  const cutoff = iso(Date.now() - 48 * 3600e3);
  const { results } = await env.DB.prepare("SELECT id, created_at FROM x_posts WHERE measured_at IS NULL AND (created_at IS NULL OR created_at <= ?) ORDER BY found_at LIMIT 100").bind(cutoff).all();
  if (!results.length) return { measured: 0 };
  const left = await budget(env, c, 0); if (left <= 0) return { measured: 0, capped: true };
  const ids = results.slice(0, left).map((r) => r.id);
  const p = new URLSearchParams({ ids: ids.join(","), "tweet.fields": "created_at,public_metrics,referenced_tweets,author_id", expansions: "author_id", "user.fields": "username" });
  const { status, j } = await xGet(env, bearer, "/tweets?" + p);
  if (status !== 200) return { measured: 0, error: status };
  const users = Object.fromEntries(((j.includes && j.includes.users) || []).map((u) => [u.id, u.username]));
  const w = JSON.parse(c.weights);
  let measured = 0;
  await budget(env, c, (j.data || []).length);
  const seen = new Set();
  for (const t of j.data || []) {
    seen.add(t.id);
    const old = Date.parse(t.created_at) <= Date.now() - 48 * 3600e3;
    await env.DB.prepare("UPDATE x_posts SET author_id = ?, handle = ?, created_at = ?, text = ?, kind = ?, metrics = ?, measured_at = ?, impact = ? WHERE id = ?")
      .bind(t.author_id, String(users[t.author_id] || "").toLowerCase(), t.created_at, short(t.text, 400), kindOf(t), JSON.stringify(t.public_metrics || {}), old ? iso(now()) : null, old ? impactOf(t.public_metrics, w) : null, t.id).run();
    if (old) measured++;
  }
  for (const id of ids) if (!seen.has(id)) await env.DB.prepare("UPDATE x_posts SET measured_at = ?, impact = 0, metrics = '{\"gone\":true}' WHERE id = ?").bind(iso(now()), id).run();
  return { measured };
}

/* ---------------- the board ---------------- */

export async function board(env, week) {
  const c = await cfgAll(env);
  const wk = week || isoWeek(local(now()).day);
  const { results } = await env.DB.prepare("SELECT * FROM x_posts WHERE created_at >= ? ORDER BY created_at").bind(iso(Date.now() - 400 * 864e5 * (week ? 1 : 0) - 10 * 864e5)).all();
  const perDay = parseInt(c.per_day, 10) || 3;
  const ppl = (await env.DB.prepare("SELECT tg_id, username, name, x_handle FROM tg_people").all()).results;
  const byHandle = Object.fromEntries(ppl.filter((p) => p.x_handle).map((p) => [p.x_handle, p]));
  const rows = {}, count = {};
  for (const p of results) {
    if (!p.created_at || !p.handle || !byHandle[p.handle]) continue; // the board is for linked members only
    const d = local(p.created_at).day;
    if (isoWeek(d) !== wk) continue;
    const k = p.handle + "|" + d; count[k] = (count[k] || 0) + 1;
    const r = rows[p.handle] || (rows[p.handle] = { handle: p.handle, member: !!byHandle[p.handle], posts: 0, counted: 0, impact: 0, pending: 0, best: null });
    r.posts++;
    if (count[k] > perDay) continue;
    r.counted++;
    if (p.measured_at == null) { r.pending++; continue; }
    r.impact += p.impact || 0;
    if (!r.best || (p.impact || 0) > (r.best.impact || 0)) r.best = { id: p.id, impact: p.impact, url: postUrl(p), kind: p.kind };
  }
  const list = Object.values(rows).map((r) => Object.assign(r, { impact: Math.round(r.impact) })).sort((a, b) => b.impact - a.impact || b.counted - a.counted);
  const chat = (await env.DB.prepare("SELECT d.tg_id, SUM(d.msgs) AS msgs, p.username, p.name FROM tg_daily d LEFT JOIN tg_people p ON p.tg_id = d.tg_id WHERE d.day >= ? GROUP BY d.tg_id ORDER BY msgs DESC LIMIT 5").bind(weekStartDay(wk)).all()).results;
  return { week: wk, rows: list, chat: chat.map((x) => ({ who: who(x), msgs: x.msgs })), per_day: perDay };
}
function weekStartDay(wk) {
  const [y, w] = wk.split("-W").map(Number);
  const j4 = new Date(Date.UTC(y, 0, 4)); const dow = j4.getUTCDay() || 7;
  const mon = new Date(Date.UTC(y, 0, 4 - dow + 1 + (w - 1) * 7));
  return mon.toISOString().slice(0, 10);
}
function boardText(b, community) {
  const lines = [`<b>Red Ripple · ${b.week}</b>`, community ? "Ranked by reach of posts about UBIK on X. Thank you all." : "Ranked by impact. Posts measured 48 h after they go up."];
  if (!b.rows.length) lines.push("\nNo linked posts yet this week. Link your X account with /link.");
  b.rows.slice(0, 10).forEach((r, i) => {
    const pend = r.pending ? `, ${r.pending} still counting` : "";
    lines.push(`${i + 1}. @${esc(r.handle)} · impact ${r.impact} · ${r.counted} post${r.counted === 1 ? "" : "s"}${pend}${r.best ? ` · <a href="${r.best.url}">best</a>` : ""}`);
  });
  if (b.chat.length) lines.push("\nMost active in the chat: " + b.chat.map((x) => `${esc(x.who)} (${x.msgs})`).join(", "));
  return lines.join("\n");
}
async function meText(env, tgId) {
  const p = await env.DB.prepare("SELECT * FROM tg_people WHERE tg_id = ?").bind(tgId).first();
  if (!p || !p.x_handle) return "You haven't linked an X account yet. Open a private chat with me and send /link.";
  const b = await board(env);
  const i = b.rows.findIndex((r) => r.handle === p.x_handle);
  if (i < 0) return `@${esc(p.x_handle)}: no posts about UBIK found yet this week.`;
  const r = b.rows[i];
  return `@${esc(p.x_handle)} · ${b.week}: place ${i + 1} of ${b.rows.length}, impact ${r.impact}, ${r.counted} counted post${r.counted === 1 ? "" : "s"}${r.pending ? ` (${r.pending} still counting)` : ""}.`;
}

/* ---------------- today and the digest ---------------- */

async function ripple(env, coll, id) {
  const r = await env.DB.prepare("SELECT data FROM ripple WHERE coll = ? AND id = ?").bind(coll, id).first();
  return r ? JSON.parse(r.data) : null;
}
async function nodeNow(env) {
  const s = await ripple(env, "settings", "main");
  const start = (s && s.start) || "2026-11-09";
  const days = Math.floor((Date.parse(local(now()).day) - Date.parse(start)) / 864e5);
  return days < 0 ? null : Math.floor(days / 7) % 5;
}
async function todayText(env) {
  const n = await nodeNow(env), l = local(now());
  const lead = ["", "Thread that opens the node", "Memes on the node", "Future of TV signals", "Long form or article", "Dev notes", "Creative projects", "Confluence: the week gathered"][l.weekday];
  const posts = (await env.DB.prepare("SELECT COUNT(*) AS n FROM x_posts WHERE created_at >= ?").bind(iso(Date.now() - 864e5)).first()).n;
  return `<b>Today</b>\nNode: ${n == null ? "setup week" : `${n + 1} · ${NODES[n]}`}\nLead format: ${lead}\nPosts about UBIK found in the last 24 h: ${posts}`;
}

function shingles(s) { const w = String(s).toLowerCase().replace(/https?:\S+/g, "").split(/\W+/).filter(Boolean); const out = new Set(); for (let i = 0; i + 2 < w.length; i++) out.add(w.slice(i, i + 3).join(" ")); return out; }
function similar(a, b) { const A = shingles(a), B = shingles(b); if (A.size < 4 || B.size < 4) return 0; let n = 0; for (const x of A) if (B.has(x)) n++; return n / Math.min(A.size, B.size); }

export async function gather(env, c) {
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
  const measured = (await env.DB.prepare("SELECT x.* FROM x_posts x JOIN tg_people p ON p.x_handle = x.handle WHERE x.measured_at >= ? AND x.impact IS NOT NULL ORDER BY x.impact DESC LIMIT 5").bind(since).all()).results;
  const warnings = [];
  const times = found.map((p) => ({ t: Date.parse(p.created_at), h: p.handle })).sort((a, b) => a.t - b.t);
  for (let i = 0; i < times.length; i++) { const w = new Set(times.filter((x) => x.t >= times[i].t && x.t < times[i].t + 10 * 60e3).map((x) => x.h)); if (w.size >= 5) { warnings.push(`${w.size} accounts posted within ten minutes around ${new Date(times[i].t).toISOString().slice(11, 16)} UTC`); break; } }
  outer: for (let i = 0; i < found.length; i++) for (let j = i + 1; j < found.length; j++) if (found[i].handle !== found[j].handle && similar(found[i].text, found[j].text) >= 0.6) { warnings.push(`@${found[i].handle} and @${found[j].handle} posted near-identical text`); break outer; }
  groups.forEach((g) => { if (g.messages >= 10 && g.price_share >= 40) warnings.push(`${g.price_share}% of the ${g.role} chat was price talk`); });
  const crew = (await env.DB.prepare("SELECT handle FROM ripple_crew").all()).results.map((r) => r.handle);
  const recent = new Set((await env.DB.prepare("SELECT DISTINCT handle FROM x_posts WHERE created_at >= ?").bind(iso(Date.now() - 3 * 864e5)).all()).results.map((r) => r.handle));
  const quiet = crew.filter((h) => !recent.has(h));
  const n = await nodeNow(env);
  const drops = (await env.DB.prepare("SELECT data FROM ripple WHERE coll = 'drops'").all()).results.map((r) => JSON.parse(r.data)).filter((d) => d.date >= local(Date.now() - 864e5).day);
  const formats = {}; found.forEach((p) => formats[p.kind] = (formats[p.kind] || 0) + 1);
  return {
    node: n == null ? "setup week" : `${n + 1} · ${NODES[n]}`, groups,
    x: { posts: found.length, authors: new Set(found.map((p) => p.handle)).size, kinds: formats, top: measured.map((p) => ({ handle: p.handle, impact: p.impact, kind: p.kind, url: postUrl(p), text: short(p.text, 160) })) },
    drops: drops.map((d) => ({ format: d.format, node: d.node, author: d.author, angle: short(d.angle, 160) })),
    warnings, quiet_core: quiet,
  };
}

function plainDigest(d) {
  const L = [`<b>Red Ripple · morning read</b>`, `Node of the week: ${esc(d.node)}`];
  L.push(`\n<b>On X, last 24 h</b>\n${d.x.posts} post${d.x.posts === 1 ? "" : "s"} about UBIK from ${d.x.authors} linked account${d.x.authors === 1 ? "" : "s"}` + (Object.keys(d.x.kinds).length ? ` (${Object.entries(d.x.kinds).map(([k, v]) => `${v} ${k}${v === 1 ? "" : "s"}`).join(", ")})` : ""));
  if (d.x.top.length) L.push("Furthest reach, measured at 48 h:\n" + d.x.top.slice(0, 3).map((p) => `@${esc(p.handle)} · impact ${p.impact} · <a href="${p.url}">${p.kind}</a>`).join("\n"));
  d.groups.forEach((g) => L.push(`\n<b>${g.role === "core" ? "Core group" : "Community group"}</b>\n${g.messages} messages from ${g.people} people` + (g.top.length ? `. Most active: ${g.top.slice(0, 3).map(([k, v]) => `${esc(k)} (${v})`).join(", ")}` : "")));
  if (d.drops.length) L.push(`\n<b>Drops logged</b>\n` + d.drops.map((x) => `${esc(x.format)} by ${esc(x.author)}: ${esc(x.angle)}`).join("\n"));
  if (d.warnings.length) L.push(`\n<b>Watch</b>\n` + d.warnings.map(esc).join("\n"));
  if (d.quiet_core.length) L.push(`\nNo posts in three days from: ${d.quiet_core.map((h) => "@" + esc(h)).join(", ")}`);
  return L.join("\n");
}

const DIGEST_SYSTEM = `You write the morning read for the core group of Project Red Ripple, a group of real $UBIK community members who spread the UBIK thesis on X with posts they write themselves. The thesis: UBIK is building generative TV, an always-on steerable stream where its AI characters live; the forecasts are what the character knows; the community is the distribution.
You get yesterday's numbers and a sample of the group chats. Write at most 180 words, plain text, no headings with symbols, no emoji, no em dashes. Four short parts, each starting with its label and a colon: Moved (what got reach, with handles), Thin (which node or format nobody covered), Watch (only real warnings: price talk drift, identical wording, many accounts at once; say "Nothing" if none), Next (two or three concrete suggestions: an angle to pick up, a conversation to join, a quiet person to invite back by name). Never write post text for people to copy. Never discuss token price. Be direct and specific; if the data is thin, say so in one line.`;

async function aiDigest(env, c, d) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const input = JSON.stringify(d).slice(0, 30000);
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: c.ai_model, max_tokens: 600, system: DIGEST_SYSTEM, messages: [{ role: "user", content: input }] }) });
  const j = await r.json().catch(() => ({}));
  const t = (j.content || []).filter((x) => x.type === "text").map((x) => x.text).join("\n").trim();
  return t || null;
}

export async function sendDigest(env, c, now_) {
  if (!c.core_chat) return { skipped: "no core group" };
  const d = await gather(env, c);
  const ai = await aiDigest(env, c, d).catch(() => null);
  const text = ai ? `<b>Red Ripple · morning read</b>\nNode of the week: ${esc(d.node)}\n\n${esc(ai)}` + (d.x.top.length ? "\n\nFurthest reach:\n" + d.x.top.slice(0, 3).map((p) => `@${esc(p.handle)} · ${p.impact} · <a href="${p.url}">${p.kind}</a>`).join("\n") : "") : plainDigest(d);
  await say(env, c.core_chat, text);
  return { sent: true, ai: !!ai };
}

/* ---------------- the hourly run ---------------- */

export async function tick(env) {
  if (!env.DB) return;
  const c = await cfgAll(env);
  const out = {};
  if (env.TG_BOT_TOKEN && c.hook !== await hookSecret(env)) out.setup = await setup(env);
  await env.DB.prepare("DELETE FROM tg_msgs WHERE at < ?").bind(iso(Date.now() - (parseInt(c.keep_days, 10) || 7) * 864e5)).run();
  for (const k of Object.keys(c)) if (/^x_reads_/.test(k) && k < "x_reads_" + local(Date.now() - 3 * 864e5).day) await cfgSet(env, k, null);
  out.discover = await discover(env, c).catch((e) => ({ error: String(e) }));
  out.measure = await measure(env, c).catch((e) => ({ error: String(e) }));
  const l = local(now());
  if (c.digest === "on" && l.hour === +c.digest_hour && c.last_digest !== l.day) { await cfgSet(env, "last_digest", l.day); out.digest = await sendDigest(env, c).catch((e) => ({ error: String(e) })); }
  const wk = isoWeek(l.day);
  if (c.board === "on" && l.weekday === +c.board_day && l.hour === +c.board_hour && c.last_board !== wk) {
    await cfgSet(env, "last_board", wk);
    const b = await board(env);
    if (c.core_chat) await say(env, c.core_chat, boardText(b, false));
    if (c.community_chat) await say(env, c.community_chat, boardText(b, true));
    out.board = true;
  }
  return out;
}
