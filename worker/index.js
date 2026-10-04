/*
 * Ubikistan archive: the desk.
 *
 * A small Cloudflare Worker that gives the static archive what it cannot do alone.
 * It never publishes anything itself; edits and records still go to the State Archive.
 *
 *   GET  /auth/github, /auth/x     sign in with GitHub or X; returns to the site with a session
 *   GET  /me                       who is signed in
 *   GET  /talk?page=CODE           votes and remarks for one page
 *   GET  /talk/all                 counts for every page (read by the build)
 *   POST /vote {page, value}       like (1), unlike (-1) or withdraw (0); signed in
 *   POST /remark {page, body}      leave a remark; signed in
 *   POST /hide {id}                hide a remark; State Archive only
 *   POST /propose                  a new version of a page        → a pull request
 *   POST /submit                   a new record, with images      → a submission issue
 *
 * Secrets: APP_ID, APP_PRIVATE_KEY (GitHub App), GH_CLIENT_ID, GH_CLIENT_SECRET (the same App's
 * user sign-in), X_CLIENT_ID, X_CLIENT_SECRET (X OAuth 2.0), ADMINS (optional: "github:name,x:name").
 * Database: D1, bound as DB (schema in schema.sql).
 */

const REPO = "ubikistan/archive";
const SITE = "https://ubikistan.github.io/archive/";
const ALLOWED_ORIGINS = ["https://ubikistan.github.io", "http://localhost:8765", "http://localhost:8766"];
const MAX_TEXT = 100_000;
const MAX_IMAGE = 3 * 1024 * 1024;
const MAX_IMAGES = 6;
const PER_HOUR = 12;
const PAGE_RX = /^(lore\/[a-z0-9-]{1,40}|[A-Z]{2,5}\/[A-Z]{2,4}\/\d{4}\/[A-Z]?\d{3,4}|REC \d{4}|ACC \d{4})$/;

const hits = new Map(); // light rate limit per key, per worker instance

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Vary": "Origin",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(req.url);
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
    try {
      const path = url.pathname;
      if (req.method === "GET") {
        if (path === "/") return reply(200, { desk: "open", repo: REPO, signin: { github: !!env.GH_CLIENT_ID, x: !!env.X_CLIENT_ID } });
        if (path === "/auth/github" || path === "/auth/x") return await startSignin(path.slice(6), url, env);
        if (path === "/auth/github/callback") return await finishGithub(req, url, env);
        if (path === "/auth/x/callback") return await finishX(req, url, env);
        if (path === "/me") { const u = await session(req, env); return reply(u ? 200 : 401, u ? { handle: u.h, provider: u.p, id: u.sub } : { error: "Not signed in." }); }
        if (path.startsWith("/incoming/")) return await incoming(path.slice(10), env);
        if (path === "/talk") return reply(200, await talk(url.searchParams.get("page"), await session(req, env), env));
        if (path === "/talk/all") return reply(200, await talkAll(env));
        return reply(404, { error: "Not found." });
      }
      if (req.method !== "POST") return reply(404, { error: "Not found." });
      if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { error: "Use the archive site." });
      const user = await session(req, env);
      const key = user ? user.sub : "ip:" + (req.headers.get("CF-Connecting-IP") || "unknown");
      if (path === "/vote") return reply(200, await vote(await req.json(), need(user), env));
      if (path === "/remark") { if (!await allow(key, 20, env)) throw refuse("That is a lot of remarks. Try again in an hour.", 429); return reply(200, await remark(await req.json(), need(user), env)); }
      if (path === "/hide") return reply(200, await hide(await req.json(), need(user), env));
      if (!await allow(key, PER_HOUR, env)) return reply(429, { error: "Too many proposals from here. Try again in an hour." });
      if (path === "/propose") return reply(200, await propose(await req.json(), env, user));
      if (path === "/submit") return reply(200, await submit(await req.formData(), env, user, url.origin));
      return reply(404, { error: "Not found." });
    } catch (e) {
      return reply(e.status || 500, { error: e.public || "The desk could not do this. Try again later.", detail: e.public ? undefined : String(e.message || e) });
    }
  },
};

async function allow(key, max, env) {
  if (env && env.KV) { // shared across every desk instance; approximate, which is enough here
    const k = `rl:${key}:${Math.floor(Date.now() / 3600_000)}`;
    const n = parseInt((await env.KV.get(k)) || "0", 10);
    if (n >= max) return false;
    await env.KV.put(k, String(n + 1), { expirationTtl: 3700 });
    return true;
  }
  const now = Date.now(), list = (hits.get(key) || []).filter((t) => now - t < 3600_000);
  if (list.length >= max) return false;
  list.push(now); hits.set(key, list);
  return true;
}

function need(user) { if (!user) throw refuse("Sign in with GitHub or X first.", 401); return user; }
function credit(user, guest) { return user ? `@${user.h} (${user.p === "x" ? "X" : "GitHub"})` : `Guest: ${guestName(guest)}`; }

/* ---------------- sessions: a signed token the site keeps and sends back ---------------- */

async function sessionKey(env) {
  if (!env.APP_PRIVATE_KEY || env.APP_PRIVATE_KEY.length < 200) throw refuse("The desk is not fully set up yet.", 503);
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("ubikistan-session:" + (env.APP_PRIVATE_KEY || "")));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function sign(payload, env) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await sessionKey(env), new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}
async function unsign(token, env) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify("HMAC", await sessionKey(env), unb64url(sig), new TextEncoder().encode(body));
  if (!ok) return null;
  const p = JSON.parse(new TextDecoder().decode(unb64url(body)));
  return p.exp && p.exp > Date.now() / 1000 ? p : null;
}
async function session(req, env) {
  const m = /^Bearer (.+)$/.exec(req.headers.get("Authorization") || "");
  return m ? unsign(m[1], env) : null;
}

/* ---------------- signing in ---------------- */

function returnTo(url) {
  const r = url.searchParams.get("return") || SITE;
  try { const u = new URL(r); return ALLOWED_ORIGINS.includes(u.origin) ? r : SITE; } catch { return SITE; }
}

const clean = (v) => String(v || "").replace(/[^\x21-\x7e]/g, "");

async function startSignin(provider, url, env) {
  const id = clean(provider === "x" ? env.X_CLIENT_ID : env.GH_CLIENT_ID);
  if (!id) throw refuse(`Signing in with ${provider === "x" ? "X" : "GitHub"} is not switched on yet.`, 503);
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const cb = `${url.origin}/auth/${provider}/callback`;
  let to;
  if (provider === "x") {
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    to = "https://x.com/i/oauth2/authorize?" + new URLSearchParams({ response_type: "code", client_id: id, redirect_uri: cb, scope: "users.read tweet.read", state, code_challenge: challenge, code_challenge_method: "S256" });
  } else {
    to = "https://github.com/login/oauth/authorize?" + new URLSearchParams({ client_id: id, redirect_uri: cb, state, allow_signup: "true" });
  }
  const nonce = String(url.searchParams.get("nonce") || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  const cookie = await sign({ state, verifier, ret: returnTo(url), nonce, exp: Date.now() / 1000 + 600 }, env);
  return new Response(null, { status: 302, headers: { Location: to, "Set-Cookie": `ubk_oauth=${cookie}; Path=/auth; Max-Age=600; HttpOnly; Secure; SameSite=Lax` } });
}

async function pending(req, url, env) {
  const c = /(?:^|;\s*)ubk_oauth=([^;]+)/.exec(req.headers.get("Cookie") || "");
  const p = c && await unsign(c[1], env);
  if (!p || p.state !== url.searchParams.get("state")) throw refuse("The sign-in took too long or was interrupted. Try again.", 400);
  return p;
}

async function finish(p, sub, handle, provider, env) {
  const token = await sign({ sub, h: handle, p: provider, exp: Math.floor(Date.now() / 1000) + 30 * 86400 }, env);
  const back = new URL(p.ret);
  const hash = back.hash.replace(/^#/, "") || "/";
  back.hash = "/signed-in?t=" + encodeURIComponent(token) + "&n=" + encodeURIComponent(p.nonce || "") + "&back=" + encodeURIComponent(hash);
  return new Response(null, { status: 302, headers: { Location: back.toString(), "Set-Cookie": "ubk_oauth=; Path=/auth; Max-Age=0; HttpOnly; Secure; SameSite=Lax" } });
}

async function finishGithub(req, url, env) {
  const p = await pending(req, url, env);
  const r = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env.GH_CLIENT_ID, client_secret: env.GH_CLIENT_SECRET, code: url.searchParams.get("code"), redirect_uri: `${url.origin}/auth/github/callback` }),
  });
  const t = await r.json();
  if (!t.access_token) throw refuse("GitHub did not confirm the sign-in.", 400);
  const u = await call("GET", "/user", null, `token ${t.access_token}`);
  return finish(p, `github:${u.id}`, u.login, "github", env);
}

async function finishX(req, url, env) {
  const p = await pending(req, url, env);
  const body = new URLSearchParams({ grant_type: "authorization_code", code: url.searchParams.get("code") || "", redirect_uri: `${url.origin}/auth/x/callback`, code_verifier: p.verifier, client_id: clean(env.X_CLIENT_ID) });
  const form = { "Content-Type": "application/x-www-form-urlencoded" };
  let r = await fetch("https://api.x.com/2/oauth2/token", { method: "POST", headers: { ...form, Authorization: "Basic " + btoa(`${clean(env.X_CLIENT_ID)}:${clean(env.X_CLIENT_SECRET)}`) }, body });
  let t = await r.json().catch(() => ({}));
  if (!t.access_token) { // the app may be registered as a public client, which takes no secret
    const r2 = await fetch("https://api.x.com/2/oauth2/token", { method: "POST", headers: form, body });
    const t2 = await r2.json().catch(() => ({}));
    if (t2.access_token) { r = r2; t = t2; }
    else t.second = r2.status + " " + String(t2.error_description || t2.error || "").slice(0, 120);
  }
  if (!t.access_token) throw refuse("X did not confirm the sign-in (" + r.status + " " + String(t.error_description || t.error || "").slice(0, 160) + (t.second ? "; without secret: " + t.second : "") + ")".", 400);
  const mr = await fetch("https://api.x.com/2/users/me", { headers: { Authorization: `Bearer ${t.access_token}` } });
  const me = await mr.json().catch(() => ({}));
  if (!me.data) throw refuse("X did not say who you are (" + mr.status + " " + String(me.title || me.detail || "").slice(0, 160) + ").", 400);
  return finish(p, `x:${me.data.id}`, me.data.username, "x", env);
}

/* ---------------- talk: votes and remarks ---------------- */

function page(raw) { const p = String(raw || "").trim(); if (!PAGE_RX.test(p)) throw refuse("Unknown page."); return p; }
// ADMINS lists stable account ids ("github:123,x:456"), never handles, which can change hands
function isAdmin(user, env) { return !!user && String(env.ADMINS || "").split(",").map((x) => x.trim()).includes(user.sub); }

async function talk(raw, user, env) {
  const pg = page(raw);
  const v = await env.DB.prepare("SELECT COALESCE(SUM(value = 1),0) AS up, COALESCE(SUM(value = -1),0) AS down FROM votes WHERE page = ?").bind(pg).first();
  const mine = user ? await env.DB.prepare("SELECT value FROM votes WHERE page = ? AND user = ?").bind(pg, user.sub).first() : null;
  const { results } = await env.DB.prepare("SELECT id, handle, provider, body, at FROM remarks WHERE page = ? AND hidden = 0 ORDER BY id").bind(pg).all();
  return { page: pg, up: v.up, down: v.down, mine: mine ? mine.value : 0, remarks: results, me: user ? { handle: user.h, provider: user.p, admin: isAdmin(user, env) } : null };
}

async function talkAll(env) {
  const out = {};
  const v = await env.DB.prepare("SELECT page, SUM(value = 1) AS up, SUM(value = -1) AS down FROM votes GROUP BY page").all();
  for (const r of v.results) out[r.page] = { up: r.up, down: r.down, comments: 0 };
  const c = await env.DB.prepare("SELECT page, COUNT(*) AS n FROM remarks WHERE hidden = 0 GROUP BY page").all();
  for (const r of c.results) (out[r.page] = out[r.page] || { up: 0, down: 0, comments: 0 }).comments = r.n;
  return out;
}

async function vote(body, user, env) {
  const pg = page(body.page), value = [1, -1, 0].includes(body.value) ? body.value : 0;
  if (value === 0) await env.DB.prepare("DELETE FROM votes WHERE page = ? AND user = ?").bind(pg, user.sub).run();
  else await env.DB.prepare("INSERT INTO votes (page, user, value, at) VALUES (?, ?, ?, ?) ON CONFLICT(page, user) DO UPDATE SET value = excluded.value, at = excluded.at")
    .bind(pg, user.sub, value, new Date().toISOString()).run();
  return talk(pg, user, env);
}

async function remark(body, user, env) {
  const pg = page(body.page);
  const text = String(body.body || "").replace(/\r\n/g, "\n").trim();
  if (text.length < 2) throw refuse("Write something first.");
  if (text.length > 2000) throw refuse("Keep remarks under 2,000 characters.");
  await env.DB.prepare("INSERT INTO remarks (page, user, handle, provider, body, at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(pg, user.sub, user.h, user.p, text, new Date().toISOString()).run();
  return talk(pg, user, env);
}

async function hide(body, user, env) {
  if (!isAdmin(user, env)) throw refuse("Only the State Archive can hide remarks.", 403);
  const r = await env.DB.prepare("SELECT page FROM remarks WHERE id = ?").bind(Number(body.id) || 0).first();
  if (!r) throw refuse("No such remark.");
  await env.DB.prepare("UPDATE remarks SET hidden = 1 WHERE id = ?").bind(Number(body.id)).run();
  return talk(r.page, user, env);
}

function refuse(msg, status = 400) { const e = new Error(msg); e.public = msg; e.status = status; return e; }

function guestName(raw) {
  const n = String(raw || "").replace(/[\r\n<>@]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  if (n.length < 2) throw refuse("Give a name or handle to be credited as.");
  if (["headroom", "state archive", "the state archive"].includes(n.toLowerCase())) throw refuse("That name is reserved for the State Archive.");
  return n;
}

/* ---------------- proposing a new version of a page ---------------- */

async function propose(body, env, user) {
  if (body.website) throw refuse("Not accepted."); // honeypot field, invisible to people
  const who = credit(user, body.name);
  const file = String(body.file || "");
  if (!/^(lore\/[a-z0-9-]+\.md|records\/(archive\/\d{4}\/[A-Z0-9-]+|record\/REC-\d{4}|culture\/ACC-\d{4})\.md)$/.test(file)) throw refuse("That page cannot be edited here.");
  const text = String(body.content || "").replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n") || text.indexOf("\n---", 4) < 0) throw refuse("Keep the block between the two --- lines at the top.");
  if (text.length > MAX_TEXT) throw refuse("That is too long for one page.");
  const summary = String(body.summary || "").replace(/[\r\n]/g, " ").trim().slice(0, 120) || "Edit";

  const gh = await github(env);
  const main = await gh(`GET /repos/${REPO}/git/ref/heads/main`);
  const current = await gh(`GET /repos/${REPO}/contents/${file}?ref=main`);
  if (b64decode(current.content) === text) throw refuse("Nothing has changed.");
  const branch = `guest/${Date.now().toString(36)}-${slug(file)}`;
  await gh(`POST /repos/${REPO}/git/refs`, { ref: `refs/heads/${branch}`, sha: main.object.sha });
  await gh(`PUT /repos/${REPO}/contents/${file}`, {
    message: `${summary}${user ? "" : " (guest edit)"}`, content: b64encode(text), branch, sha: current.sha,
    author: { name: who, email: user ? `${user.p}@ubikistan.invalid` : "guest@ubikistan.invalid" },
  });
  const pr = await gh(`POST /repos/${REPO}/pulls`, {
    title: `${user ? "Edit" : "Guest edit"}: ${file.replace(/^.*\//, "").replace(/\.md$/, "")} · ${summary}`,
    head: branch, base: "main",
    body: `Proposed by **${who}** through the archive site.\n\n> ${summary}\n\nEdits from the site are reviewed by the State Archive before they appear.`,
  });
  await gh(`POST /repos/${REPO}/issues/${pr.number}/labels`, { labels: [user ? "site-edit" : "guest-edit"] }).catch(() => {});
  return { ok: true, url: pr.html_url, number: pr.number };
}

/* ---------------- submitting a new record ---------------- */

async function submit(form, env, user, origin) {
  if (form.get("website")) throw refuse("Not accepted.");
  const who = credit(user, form.get("contributor"));
  const f = (k) => String(form.get(k) || "").trim();
  const hasX = /^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\/\w+\/status\/\d+/.test(f("xpost"));
  if (!f("record_title") && !hasX) throw refuse("A title is needed.");
  if (!/(1[89]\d\d|20\d\d)/.test(f("date")) && !hasX) throw refuse("A date with a year is needed.");
  if (!f("text") && !hasX) throw refuse("A caption is needed.");
  const images = form.getAll("images").filter((x) => x && typeof x === "object" && x.size);
  if (images.length > MAX_IMAGES) throw refuse(`At most ${MAX_IMAGES} images.`);
  for (const im of images) {
    if (!/^image\/(jpeg|png|gif|webp)$/.test(im.type)) throw refuse("Images must be JPEG, PNG, GIF or WebP.");
    if (im.size > MAX_IMAGE) throw refuse("Each image must be under 3 MB.");
  }

  const gh = await github(env);
  const links = [];
  if (images.length && !env.KV) throw refuse("Image uploads are not switched on yet.", 503);
  for (const im of images) {
    // held privately for 30 days; only the intake (after review) or someone with the exact link fetches them
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" }[im.type];
    const id = b64url(crypto.getRandomValues(new Uint8Array(18))) + "." + ext;
    await env.KV.put("img:" + id, await im.arrayBuffer(), { expirationTtl: 30 * 86400, metadata: { type: im.type } });
    links.push(`${origin}/incoming/${id}`);
  }
  const film = f("film");
  if (film && /^https:\/\//.test(film)) links.push(film);
  const sec = (h, v) => `### ${h}\n\n${v || "_No response_"}\n`;
  const body = [
    sec("Which archive?", f("archive")), sec("Title", f("record_title")), sec("Date", f("date")),
    sec("Medium", f("medium")), sec("Issued by", f("institution")), sec("What is it, physically?", f("format")),
    sec("Form", f("form")), sec("Link", f("link")), sec("Post on X", f("xpost")), sec("Whose post?", f("whose")),
    sec("Caption and text", f("text")), sec("Images and films", links.join("\n")), sec("Credit as", who),
    sec("Free to copy", "- [X] I made this, or have the right to give it away, and I release it under CC0."),
  ].join("\n");
  const issue = await gh(`POST /repos/${REPO}/issues`, { title: `Record: ${f("record_title") || f("xpost")}`.slice(0, 200), body, labels: ["submission", user ? "site-edit" : "guest-edit"] });
  return { ok: true, url: issue.html_url, number: issue.number };
}

async function incoming(id, env) {
  if (!env.KV || !/^[A-Za-z0-9_-]{20,30}\.(jpg|png|gif|webp)$/.test(id)) return new Response("Not found", { status: 404 });
  const { value, metadata } = await env.KV.getWithMetadata("img:" + id, { type: "arrayBuffer" });
  if (!value) return new Response("Not found", { status: 404 });
  return new Response(value, { headers: { "Content-Type": metadata && metadata.type || "application/octet-stream", "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600" } });
}

/* ---------------- GitHub App authentication ---------------- */

let cached = null;

async function github(env) {
  if (!cached || cached.expires < Date.now() + 60_000) {
    const jwt = await appJWT(env.APP_ID, env.APP_PRIVATE_KEY);
    const inst = await call("GET", `/repos/${REPO}/installation`, null, `Bearer ${jwt}`);
    const tok = await call("POST", `/app/installations/${inst.id}/access_tokens`, {}, `Bearer ${jwt}`);
    cached = { token: tok.token, expires: Date.parse(tok.expires_at) };
  }
  return (route, body) => { const [m, p] = route.split(" "); return call(m, p, body, `token ${cached.token}`); };
}

async function call(method, path, body, auth) {
  const r = await fetch("https://api.github.com" + path, {
    method, body: body == null ? undefined : JSON.stringify(body),
    headers: { Authorization: auth, Accept: "application/vnd.github+json", "User-Agent": "ubikistan-guest-desk", "X-GitHub-Api-Version": "2022-11-28" },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : {};
}

async function appJWT(appId, pem) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const data = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iat: now - 60, exp: now + 540, iss: String(appId) })}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data));
  return `${data}.${b64url(new Uint8Array(sig))}`;
}

// GitHub hands out PKCS#1 keys ("BEGIN RSA PRIVATE KEY"); WebCrypto wants PKCS#8. Wrap if needed.
function pemToPkcs8(pem) {
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  if (!/BEGIN RSA PRIVATE KEY/.test(pem)) return der.buffer;
  const len = (n) => n < 128 ? [n] : n < 256 ? [0x81, n] : n < 65536 ? [0x82, n >> 8, n & 255] : [0x83, n >> 16, (n >> 8) & 255, n & 255];
  const algo = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const octet = [0x04, ...len(der.length)];
  const inner = [0x02, 0x01, 0x00, ...algo, ...octet];
  const out = new Uint8Array([0x30, ...len(inner.length + der.length), ...inner, ...der]);
  return out.buffer;
}

/* ---------------- small helpers ---------------- */

function slug(s) { return s.replace(/^.*\//, "").replace(/\.md$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40); }
function unb64url(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }
function b64url(bytes) { return b64encodeBytes(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function b64encode(text) { return b64encodeBytes(new TextEncoder().encode(text)); }
function b64encodeBytes(bytes) { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }
function b64decode(b64) { return new TextDecoder().decode(Uint8Array.from(atob(String(b64).replace(/\s/g, "")), (c) => c.charCodeAt(0))); }
