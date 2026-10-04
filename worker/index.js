/*
 * Ubikistan archive: the guest desk.
 *
 * A small Cloudflare Worker that lets people without a GitHub account propose
 * changes. It never publishes anything itself:
 *   POST /propose  a new version of a lore page or record  → a pull request
 *   POST /submit   a new record, with images               → a submission issue
 * The State Archive reviews both. Guests are credited as "Guest: <name>".
 *
 * Secrets (set by the deploy workflow): APP_ID, APP_PRIVATE_KEY (the GitHub App's key).
 */

const REPO = "ubikistan/archive";
const ALLOWED_ORIGINS = ["https://ubikistan.github.io", "http://localhost:8765", "http://localhost:8766"];
const MAX_TEXT = 100_000;
const MAX_IMAGE = 3 * 1024 * 1024;
const MAX_IMAGES = 6;
const PER_HOUR = 12;

const hits = new Map(); // light rate limit per address, per worker instance

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(req.url);
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
    try {
      if (req.method === "GET" && url.pathname === "/") return reply(200, { desk: "open", repo: REPO });
      if (req.method !== "POST") return reply(404, { error: "Not found." });
      if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { error: "Use the archive site to edit." });
      const ip = req.headers.get("CF-Connecting-IP") || "unknown";
      if (!allow(ip)) return reply(429, { error: "Too many proposals from here. Try again in an hour." });
      if (url.pathname === "/propose") return reply(200, await propose(await req.json(), env));
      if (url.pathname === "/submit") return reply(200, await submit(await req.formData(), env));
      return reply(404, { error: "Not found." });
    } catch (e) {
      return reply(e.status || 500, { error: e.public || "The guest desk could not file this. Try again later." , detail: e.public ? undefined : String(e.message || e) });
    }
  },
};

function allow(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (list.length >= PER_HOUR) return false;
  list.push(now); hits.set(ip, list);
  return true;
}

function refuse(msg, status = 400) { const e = new Error(msg); e.public = msg; e.status = status; return e; }

function guestName(raw) {
  const n = String(raw || "").replace(/[\r\n<>@]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  if (n.length < 2) throw refuse("Give a name or handle to be credited as.");
  return n;
}

/* ---------------- proposing a new version of a page ---------------- */

async function propose(body, env) {
  if (body.website) throw refuse("Not accepted."); // honeypot field, invisible to people
  const name = guestName(body.name);
  const file = String(body.file || "");
  if (!/^(lore\/[a-z0-9-]+\.md|records\/(archive\/\d{4}\/[A-Z0-9-]+|record\/REC-\d{4})\.md)$/.test(file)) throw refuse("That page cannot be edited here.");
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
    message: `${summary} (guest edit)`, content: b64encode(text), branch, sha: current.sha,
    author: { name: `Guest: ${name}`, email: "guest@ubikistan.invalid" },
  });
  const pr = await gh(`POST /repos/${REPO}/pulls`, {
    title: `Guest edit: ${file.replace(/^.*\//, "").replace(/\.md$/, "")} · ${summary}`,
    head: branch, base: "main",
    body: `Proposed by **Guest: ${name}** through the archive site.\n\n> ${summary}\n\nGuest edits are reviewed by the State Archive before they appear.`,
  });
  await gh(`POST /repos/${REPO}/issues/${pr.number}/labels`, { labels: ["guest-edit"] }).catch(() => {});
  return { ok: true, url: pr.html_url, number: pr.number };
}

/* ---------------- submitting a new record ---------------- */

async function submit(form, env) {
  if (form.get("website")) throw refuse("Not accepted.");
  const name = guestName(form.get("contributor"));
  const f = (k) => String(form.get(k) || "").trim();
  if (!f("record_title")) throw refuse("A title is needed.");
  if (!/(1[89]\d\d|20\d\d)/.test(f("date"))) throw refuse("A date with a year is needed.");
  if (!f("text")) throw refuse("A caption is needed.");
  const images = form.getAll("images").filter((x) => x && typeof x === "object" && x.size);
  if (images.length > MAX_IMAGES) throw refuse(`At most ${MAX_IMAGES} images.`);
  for (const im of images) {
    if (!/^image\/(jpeg|png|gif|webp)$/.test(im.type)) throw refuse("Images must be JPEG, PNG, GIF or WebP.");
    if (im.size > MAX_IMAGE) throw refuse("Each image must be under 3 MB.");
  }

  const gh = await github(env);
  const links = [];
  if (images.length) {
    const main = await gh(`GET /repos/${REPO}/git/ref/heads/main`);
    const branch = `incoming/${Date.now().toString(36)}`;
    await gh(`POST /repos/${REPO}/git/refs`, { ref: `refs/heads/${branch}`, sha: main.object.sha });
    let i = 0;
    for (const im of images) {
      i += 1;
      const ext = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" }[im.type];
      const path = `incoming/${branch.split("/")[1]}-${i}.${ext}`;
      await gh(`PUT /repos/${REPO}/contents/${path}`, {
        message: `Image for a guest submission by ${name}`, branch,
        content: b64encodeBytes(new Uint8Array(await im.arrayBuffer())),
        author: { name: `Guest: ${name}`, email: "guest@ubikistan.invalid" },
      });
      links.push(`https://raw.githubusercontent.com/${REPO}/${branch}/${path}`);
    }
  }
  const film = f("film");
  if (film && /^https:\/\//.test(film)) links.push(film);
  const sec = (h, v) => `### ${h}\n\n${v || "_No response_"}\n`;
  const body = [
    sec("Which archive?", f("archive")), sec("Title", f("record_title")), sec("Date", f("date")),
    sec("Medium", f("medium")), sec("Issued by", f("institution")), sec("What is it, physically?", f("format")),
    sec("Caption and text", f("text")), sec("Images and films", links.join("\n")), sec("Credit as", `Guest: ${name}`),
    sec("Free to copy", "- [X] I made this, or have the right to give it away, and I release it under CC0."),
  ].join("\n");
  const issue = await gh(`POST /repos/${REPO}/issues`, { title: `Record: ${f("record_title")}`.slice(0, 200), body, labels: ["submission", "guest-edit"] });
  return { ok: true, url: issue.html_url, number: issue.number };
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
function b64url(bytes) { return b64encodeBytes(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function b64encode(text) { return b64encodeBytes(new TextEncoder().encode(text)); }
function b64encodeBytes(bytes) { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }
function b64decode(b64) { return new TextDecoder().decode(Uint8Array.from(atob(String(b64).replace(/\s/g, "")), (c) => c.charCodeAt(0))); }
