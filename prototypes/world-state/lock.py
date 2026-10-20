#!/usr/bin/env python3
"""Lock a single-file HTML page behind a passphrase.

The page is encrypted with AES-256-GCM; the key comes from the passphrase through
PBKDF2-SHA256 (300,000 rounds). What is published is a small gate page that holds only
the ciphertext: without the passphrase the content is not in the file at all.

usage: lock.py SOURCE.html OUT.html "passphrase" [--title ...] [--sub ...]
       lock.py --regate SEALED.html [--title ...] [--sub ...]
           rewrites the gate around an already sealed page (same ciphertext, new wording)

The passphrase is typed by the person who seals; it is never kept in the repository.
"""
import sys, os, re, json, base64, hashlib, argparse

ROUNDS = 300_000
TEAM = ("Run by the UBIK team under ubik.gold's terms. "
        "Forecasts are probabilities, not financial advice.")

ap = argparse.ArgumentParser()
ap.add_argument("src", nargs="?"); ap.add_argument("out", nargs="?"); ap.add_argument("passphrase", nargs="?")
ap.add_argument("--regate", metavar="SEALED", help="rewrite the gate of an already sealed page in place")
ap.add_argument("--title", default="Ubikistan · World State")
ap.add_argument("--sub", default="World State")
ap.add_argument("--blurb", default=TEAM + " Enter the passphrase to open it on this device.")
a = ap.parse_args()

MARK = '''<svg class="mark" viewBox="0 0 128 128" aria-hidden="true"><circle cx="64" cy="64" r="46" fill="none" stroke="var(--gold)" stroke-width="22"/></svg>'''


def gate_html(sealed_js, title, sub, blurb, rounds=ROUNDS):
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>{title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Newsreader:opsz,wght@6..72,400&family=Geist+Mono:wght@400;500&display=swap">
<style>
:root{{--bg:#efece6;--ink:#15140f;--muted:#625d54;--line:#d6d1c7;--rule:#15140f;--gold:#d9a21b;--hot:#d93a5f}}
@media (prefers-color-scheme: dark){{:root{{--bg:#121315;--ink:#ece6d8;--muted:#a8a396;--line:#2a2c30;--rule:#3f4247;--gold:#d1a74c;--hot:#f2476f}}}}
html,body{{margin:0;min-height:100%;background:var(--bg);color:var(--ink)}}
body{{display:grid;place-items:center;font-family:"Newsreader",Georgia,serif;padding:24px}}
.gate{{width:min(440px,100%);}}
.head{{display:flex;align-items:center;gap:12px;margin-bottom:28px}}
.head .mark{{width:34px;height:34px}}
.head .wm{{font-family:"Archivo",sans-serif;font-weight:700;font-size:14px;letter-spacing:.18em;text-transform:uppercase}}
.head .ws{{font-family:"Archivo",sans-serif;font-weight:500;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}}
.head .pw{{font-family:"Archivo",sans-serif;font-weight:700;font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);border:1px solid var(--gold);padding:3px 6px 2px;border-radius:2px;margin-left:auto}}
.k{{font-family:"Archivo",sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}}
h1{{font-weight:400;font-size:clamp(26px,5vw,34px);line-height:1.1;margin:8px 0 10px;letter-spacing:-.01em}}
p{{font-size:16px;line-height:1.5;color:var(--muted);margin:0 0 20px}}
form{{display:flex;border:1px solid var(--rule)}}
input{{flex:1;min-width:0;border:0;background:none;color:var(--ink);font-family:"Geist Mono",monospace;font-size:15px;padding:12px 12px;outline:none}}
button{{font-family:"Archivo",sans-serif;font-weight:700;font-size:11px;letter-spacing:.12em;text-transform:uppercase;border:0;border-left:1px solid var(--rule);background:var(--ink);color:var(--bg);padding:0 16px;cursor:pointer}}
button:disabled{{opacity:.6}}
.err{{color:var(--hot);font-family:"Geist Mono",monospace;font-size:11.5px;margin-top:10px;min-height:1.4em}}
.foot{{font-family:"Geist Mono",monospace;font-size:10.5px;color:var(--muted);margin-top:28px;line-height:1.6}}
.foot a{{color:inherit}}
label.rem{{display:flex;gap:8px;align-items:center;font-family:"Archivo",sans-serif;font-size:12px;color:var(--muted);margin-top:12px}}
</style>
</head>
<body>
<main class="gate">
  <div class="head">{MARK}<span class="wm">Ubikistan</span><span class="ws">{sub}</span><span class="pw">UBIK Forecast</span></div>
  <div class="k">Team page</div>
  <h1>This page is sealed.</h1>
  <p>{blurb}</p>
  <form id="f" autocomplete="off"><input id="p" type="password" placeholder="passphrase" aria-label="Passphrase" autofocus><button type="submit" id="b">Open</button></form>
  <label class="rem"><input type="checkbox" id="rem" checked> Keep it open on this device</label>
  <div class="err" id="e" role="alert"></div>
  <div class="foot">Encrypted in the file itself (AES-256-GCM, PBKDF2 {rounds:,} rounds). Nothing is sent anywhere; the passphrase never leaves your browser.<br>AI-generated · Terms: <a href="https://ubik.gold/terms">ubik.gold/terms</a></div>
</main>
<script>
{sealed_js}
const u8=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function unseal(pass){{
  const km=await crypto.subtle.importKey("raw",new TextEncoder().encode(pass),"PBKDF2",false,["deriveKey"]);
  const key=await crypto.subtle.deriveKey({{name:"PBKDF2",salt:u8(SEALED.salt),iterations:SEALED.rounds,hash:"SHA-256"}},km,{{name:"AES-GCM",length:256}},false,["decrypt"]);
  const plain=await crypto.subtle.decrypt({{name:"AES-GCM",iv:u8(SEALED.iv)}},key,u8(SEALED.ct));
  return new TextDecoder().decode(plain);
}}
async function open(pass,remember){{
  const b=document.getElementById("b"),e=document.getElementById("e"); b.disabled=true; e.textContent="";
  try{{ const html=await unseal(pass); try{{ if(remember) localStorage.setItem("ubik-seal",pass); else localStorage.removeItem("ubik-seal"); }}catch(_){{}}
    document.open(); document.write(html); document.close(); }}
  catch(err){{ e.textContent="That is not the passphrase."; b.disabled=false; document.getElementById("p").select(); }}
}}
document.getElementById("f").addEventListener("submit",ev=>{{ ev.preventDefault(); open(document.getElementById("p").value,document.getElementById("rem").checked); }});
try{{ const saved=localStorage.getItem("ubik-seal"); if(saved) open(saved,true); }}catch(_){{}}
</script>
</body>
</html>
'''


if a.regate:
    old = open(a.regate, encoding="utf-8").read()
    m = re.search(r'^const SEALED=\{.*?\};$', old, re.M)
    if not m:
        sys.exit("no sealed block found in " + a.regate)
    rounds = int(re.search(r'rounds:(\d+)', m.group(0)).group(1))
    open(a.regate, "w", encoding="utf-8").write(gate_html(m.group(0), a.title, a.sub, a.blurb, rounds))
    print(f"regated {a.regate}")
    sys.exit(0)

if not (a.src and a.out and a.passphrase):
    ap.error("SOURCE.html OUT.html passphrase are required unless --regate is given")

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

salt = os.urandom(16); iv = os.urandom(12)
key = hashlib.pbkdf2_hmac("sha256", a.passphrase.encode("utf-8"), salt, ROUNDS, dklen=32)
plain = open(a.src, "rb").read()
ct = AESGCM(key).encrypt(iv, plain, None)
b64 = lambda b: base64.b64encode(b).decode()
sealed_js = f'const SEALED={{salt:"{b64(salt)}",iv:"{b64(iv)}",rounds:{ROUNDS},ct:"{b64(ct)}"}};'
open(a.out, "w", encoding="utf-8").write(gate_html(sealed_js, a.title, a.sub, a.blurb))
print(f"sealed {len(plain)//1024} KB -> {a.out} ({len(gate_html('', a.title, a.sub, a.blurb))//1024 + len(ct)*4//3//1024} KB)")
