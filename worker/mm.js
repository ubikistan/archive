/*
 * The Market Map's forecasts: the community's own forecasts on UBIK's open questions,
 * the crowd's lean on each one, and a leaderboard scored by Brier once ubik.gold settles them.
 *
 *   GET  /mm/crowd              per open question: how many forecasts, how many lean YES, the mean, and how many in the last 24 hours
 *   GET  /mm/board?week=this    the leaderboard by points: week=this|last (Monday to Monday, Amsterdam), days=30, or all time, with UBIK's own points for the same window
 *   GET  /mm/mine               the signed-in person's forecasts
 *   GET  /mm/feed               the latest forecasts: who and on what, never which side (the crowd stays hidden until you forecast)
 *   POST /mm/forecast {qid, p}  make, change (p) or withdraw (p null) a forecast; signed in; only while the question is open
 *   POST /mm/sync {forecasts: {qid: {p, at}}}   bring forecasts made before signing in; open questions only
 *
 * Every forecast, change and withdrawal is also kept in mm_log with its time, for the crowd's history.
 *
 * Points, per settled forecast (the same rules as the page's points() in prototypes/market-map/app.js):
 *   10 for taking part
 *   + skill = (0.25 - your Brier) x 200        (+50 for a perfect forecast, 0 for a coin flip, -112 for 90% the wrong way)
 *   a positive skill is multiplied by hardness = 1 + 2 x UBIK's Brier on the question + up to 0.5 for forecasting early
 *     (days between your last change and the deadline, / 28)
 * Totals are summed, so answering more questions counts; guessing at random scores about nothing, and confident misses cost.
 *
 * No money, no prizes: a forecast is a probability, the points are the ranking.
 * The questions and results come from ubik.gold's public list (api.ubik.gold).
 */

const API = "https://api.ubik.gold/forecasts?per_page=100&status=";
const QID = /^q_\d{8}_\d{2}$/;
const MIN_ON_BOARD = 1;
export function points(p, outcome, ubikBrier, daysAhead) {
  const y = outcome === "yes" ? 1 : 0, b = (p - y) * (p - y), skill = (0.25 - b) * 200;
  const hard = 1 + 2 * (typeof ubikBrier === "number" ? ubikBrier : 0) + Math.min(0.5, Math.max(0, daysAhead) / 28);
  return { b, pts: 10 + (skill > 0 ? skill * hard : skill) };
}
const mem = { open: null, openAt: 0, settled: null, settledAt: 0, hits: new Map() };

async function list(status) {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(API + status + "&page=" + page, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("ubik.gold " + r.status);
    const j = await r.json();
    out.push(...(j.data || []));
    if (!j.meta || page >= (j.meta.pages || 1)) break;
  }
  return out;
}
function dueOf(x) {
  const at = (x.due || {}).at;
  return Date.parse(at && at.length > 10 ? at : (at || x.deadline) + "T23:59:59-05:00");
}
async function openQs() {
  if (!mem.open || Date.now() - mem.openAt > 300_000) {
    const m = new Map();
    for (const x of await list("open")) m.set(x.question_id, { due: dueOf(x) });
    mem.open = m; mem.openAt = Date.now();
  }
  return mem.open;
}
async function settledQs() {
  if (!mem.settled || Date.now() - mem.settledAt > 300_000) {
    const m = new Map();
    for (const x of await list("settled"))
      if (x.outcome === "yes" || x.outcome === "no") m.set(x.question_id, { o: x.outcome, b: x.brier, at: Date.parse(x.resolved_at || x.deadline), due: dueOf(x) });
    mem.settled = m; mem.settledAt = Date.now();
  }
  return mem.settled;
}
// a light limit per person, per worker instance (kept out of KV, whose daily writes are few)
function limited(key, max) {
  const now = Date.now(), l = (mem.hits.get(key) || []).filter((t) => now - t < 3600_000);
  if (l.length >= max) return true;
  l.push(now); mem.hits.set(key, l);
  return false;
}
function prob(p, h) {
  const n = Number(p);
  if (!(n >= 0.01 && n <= 0.99)) throw h.refuse("A forecast is a chance between 1% and 99%.");
  return Math.round(n * 100) / 100;
}
function name(user, h, env) { return h.isAdmin(user, env) ? "Administrator" : user.h; }
// who someone is on the board: handle and profile picture as of their last forecast (the State Archive shows no picture)
function person(user, h, env) {
  const admin = h.isAdmin(user, env);
  return env.DB.prepare("INSERT INTO mm_people (user, handle, provider, avatar, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user) DO UPDATE SET handle = excluded.handle, avatar = excluded.avatar, at = excluded.at")
    .bind(user.sub, name(user, h, env), user.p, admin ? null : (user.a || null), new Date().toISOString());
}

export async function crowd(env) {
  const { results } = await env.DB.prepare("SELECT qid, COUNT(*) AS n, SUM(CASE WHEN p > 0.5 THEN 1 ELSE 0 END) AS yes, AVG(p) AS mean FROM mm_forecasts GROUP BY qid").all();
  const out = {};
  for (const r of results) out[r.qid] = { n: r.n, yes: r.yes, mean: Math.round(r.mean * 1000) / 1000, day: 0 };
  const since = new Date(Date.now() - 864e5).toISOString();
  const day = await env.DB.prepare("SELECT qid, COUNT(*) AS d FROM mm_log WHERE at > ? AND p IS NOT NULL GROUP BY qid").bind(since).all();
  for (const r of day.results) (out[r.qid] = out[r.qid] || { n: 0, yes: 0, mean: null, day: 0 }).day = r.d;
  const people = await env.DB.prepare("SELECT COUNT(DISTINCT user) AS n FROM mm_forecasts").first();
  return { questions: out, people: (people && people.n) || 0 };
}

export async function feed(env) {
  const { results } = await env.DB.prepare(
    "SELECT l.qid, l.at, m.handle, m.provider, m.avatar FROM mm_log l JOIN mm_people m ON m.user = l.user " +
    "WHERE l.p IS NOT NULL ORDER BY l.id DESC LIMIT 40").all();
  const hour = await env.DB.prepare("SELECT COUNT(*) AS n FROM mm_log WHERE p IS NOT NULL AND at > ?").bind(new Date(Date.now() - 3600_000).toISOString()).first();
  return { items: results.map((r) => ({ qid: r.qid, at: r.at, handle: r.handle, provider: r.provider, avatar: r.avatar || null })), hour: (hour && hour.n) || 0 };
}

export async function mine(user, h) {
  if (!user) throw h.refuse("Sign in with X or GitHub first.", 401);
  return { forecasts: await own(user, h.env) };
}
async function own(user, env) {
  const { results } = await env.DB.prepare("SELECT qid, p, at FROM mm_forecasts WHERE user = ?").bind(user.sub).all();
  const out = {};
  for (const r of results) out[r.qid] = { p: r.p, at: r.at };
  return out;
}

export async function forecast(body, user, h) {
  const env = h.env;
  if (!user) throw h.refuse("Sign in with X or GitHub first.", 401);
  if (limited("f:" + user.sub, 240)) throw h.refuse("That is a lot of forecasts. Try again in an hour.", 429);
  const qid = String((body || {}).qid || "");
  if (!QID.test(qid)) throw h.refuse("Unknown question.");
  const q = (await openQs()).get(qid);
  if (!q) throw h.refuse("This question is not open any more.", 409);
  if (q.due <= Date.now()) throw h.refuse("This question has closed for forecasts.", 409);
  const now = new Date().toISOString();
  if (body.p === null) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM mm_forecasts WHERE qid = ? AND user = ?").bind(qid, user.sub),
      env.DB.prepare("INSERT INTO mm_log (qid, user, p, at) VALUES (?, ?, NULL, ?)").bind(qid, user.sub, now),
    ]);
    return { ok: true, qid, p: null };
  }
  const p = prob(body.p, h);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO mm_forecasts (qid, user, handle, provider, p, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (qid, user) DO UPDATE SET p = excluded.p, at = excluded.at, handle = excluded.handle")
      .bind(qid, user.sub, name(user, h, env), user.p, p, now),
    env.DB.prepare("INSERT INTO mm_log (qid, user, p, at) VALUES (?, ?, ?, ?)").bind(qid, user.sub, p, now),
    person(user, h, env),
  ]);
  return { ok: true, qid, p, at: now };
}

export async function sync(body, user, h) {
  const env = h.env;
  if (!user) throw h.refuse("Sign in with X or GitHub first.", 401);
  if (limited("s:" + user.sub, 30)) throw h.refuse("Too many syncs. Try again in an hour.", 429);
  const given = Object.entries((body || {}).forecasts || {}).slice(0, 300);
  const open = await openQs(), now = Date.now(), batch = [];
  let kept = 0, closed = 0;
  for (const [qid, f] of given) {
    if (!QID.test(qid) || !f) continue;
    const q = open.get(qid);
    if (!q || q.due <= now) { closed++; continue; }
    let p; try { p = prob(f.p, h); } catch { continue; }
    const at = new Date(Math.min(now, Date.parse(f.at) || now)).toISOString();
    batch.push(env.DB.prepare("INSERT INTO mm_forecasts (qid, user, handle, provider, p, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (qid, user) DO UPDATE SET p = excluded.p, at = excluded.at, handle = excluded.handle WHERE excluded.at > mm_forecasts.at")
      .bind(qid, user.sub, name(user, h, env), user.p, p, at));
    batch.push(env.DB.prepare("INSERT INTO mm_log (qid, user, p, at) SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM mm_log WHERE qid = ? AND user = ? AND at = ?)").bind(qid, user.sub, p, at, qid, user.sub, at));
    kept++;
  }
  batch.push(person(user, h, env));
  await env.DB.batch(batch);
  return { ok: true, kept, closed, forecasts: await own(user, env) };
}

// the week runs Monday 00:00 to Monday 00:00, Amsterdam time
function amsOffset(t) {
  const p = {};
  for (const x of new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t))) p[x.type] = x.value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}
export function weekStart(t) {
  const local = new Date(t + amsOffset(t));
  const monday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - ((local.getUTCDay() + 6) % 7) * 864e5;
  return monday - amsOffset(monday);
}

function tally(settled, results, since, until, user) {
  const people = new Map();
  for (const r of results) {
    const s = settled.get(r.qid);
    if (!s || s.at < since || s.at >= until) continue;
    const { b, pts } = points(r.p, s.o, s.b, (s.due - Date.parse(r.at)) / 864e5);
    const e = people.get(r.user) || { handle: r.handle, provider: r.provider, avatar: r.avatar || null, n: 0, sum: 0, pts: 0, ubik: 0, won: 0, lost: 0, me: !!user && user.sub === r.user };
    e.handle = r.handle; e.n++; e.sum += b; e.pts += pts; e.ubik += s.b;
    if (Math.abs(b - s.b) > 1e-9) { if (b < s.b) e.won++; else e.lost++; }
    people.set(r.user, e);
  }
  const rows = [...people.values()].map((e) => ({
    handle: e.handle, provider: e.provider, avatar: e.avatar, n: e.n, points: Math.round(e.pts), brier: Math.round(e.sum / e.n * 10000) / 10000,
    ubik: Math.round(e.ubik / e.n * 10000) / 10000, won: e.won, lost: e.lost, ranked: e.n >= MIN_ON_BOARD, me: e.me,
  }));
  rows.sort((a, b) => (b.ranked - a.ranked) || b.points - a.points || a.brier - b.brier);
  let rank = 0; for (const r of rows) r.rank = r.ranked ? ++rank : null;
  // UBIK by the same rules, without the hardness bonus (its own Brier is what sets the hardness)
  let us = 0, un = 0, up = 0;
  for (const s of settled.values()) if (s.at >= since && s.at < until && typeof s.b === "number") { us += s.b; un++; up += 10 + (0.25 - s.b) * 200; }
  return { rows, ubik: { brier: un ? Math.round(us / un * 10000) / 10000 : null, n: un, points: Math.round(up) } };
}

// The weekly pool, a proposal shown in the prototype (nothing is paid out): 200,000 UBIK a week from the week of 23 November 2026.
// The top person takes it only if they beat UBIK's points for the week; otherwise it rolls into the next week.
const POOL_WEEKLY = 200000, POOL_FROM = Date.parse("2026-11-23T00:00:00+01:00");
function pool(settled, results, current) {
  let carry = 0; const history = [];
  for (let w = weekStart(POOL_FROM); w < current; w += 7 * 864e5) {
    const ws = weekStart(w + 3600_000), t = tally(settled, results, ws, weekStart(ws + 8 * 864e5), null), top = t.rows.find((r) => r.ranked);
    const amount = POOL_WEEKLY + carry, beat = !!top && top.points > t.ubik.points;
    history.push({ start: new Date(ws).toISOString(), amount, winner: beat ? top.handle : null, top: top ? top.points : null, ubik: t.ubik.points });
    carry = beat ? 0 : amount;
  }
  return { proposal: true, weekly: POOL_WEEKLY, amount: POOL_WEEKLY + carry, rolled: carry / POOL_WEEKLY, history: history.reverse().slice(0, 8) };
}

export async function board(url, user, h) {
  const env = h.env, now = Date.now();
  const week = url.searchParams.get("week");
  const days = Math.max(0, Math.min(365, parseInt(url.searchParams.get("days") || "0", 10) || 0));
  let since = days ? now - days * 864e5 : 0, until = Infinity;
  if (week === "this" || week === "last") {
    since = weekStart(now); until = since + 7 * 864e5;
    if (week === "last") { until = since; since = weekStart(since - 3600_000); }
  }
  const settled = await settledQs();
  const { results } = await env.DB.prepare("SELECT f.qid, f.user, f.handle, f.provider, f.p, f.at, m.avatar FROM mm_forecasts f LEFT JOIN mm_people m ON m.user = f.user").all();
  const t = tally(settled, results, since, until, user);
  const out = {
    days: days || null, week: week === "this" || week === "last" ? { start: new Date(since).toISOString(), end: new Date(until).toISOString() } : null,
    min: MIN_ON_BOARD, rows: t.rows.slice(0, 100), me: t.rows.find((r) => r.me) || null,
    ubik: Object.assign(t.ubik, { since: since ? new Date(since).toISOString().slice(0, 10) : null }),
  };
  if (week === "this") { // last week's verdict: did the top person beat UBIK?
    const ls = weekStart(since - 3600_000), l = tally(settled, results, ls, since, null), top = l.rows.find((r) => r.ranked);
    out.last = { start: new Date(ls).toISOString(), top: top ? { handle: top.handle, provider: top.provider, avatar: top.avatar, points: top.points } : null,
      ubik: l.ubik.points, beat: !!top && top.points > l.ubik.points };
    out.pool = pool(settled, results, since);
  }
  const totals = await env.DB.prepare("SELECT COUNT(*) AS f, COUNT(DISTINCT user) AS p FROM mm_forecasts").first();
  out.people = (totals && totals.p) || 0; out.forecasts = (totals && totals.f) || 0; out.at = new Date().toISOString();
  return out;
}
