#!/usr/bin/env python3
"""Build the live Forecasts page from the static one.
usage: fc_build.py calls.static.html pub_syn.json pub_open.json pub_settled.json out.html"""
import json, re, sys
src, syn_p, open_p, settled_p, out = sys.argv[1:6]
page = open(src, encoding="utf-8").read()
instr = open("fc_instr.js", encoding="utf-8").read()
live = open("fc_live.js", encoding="utf-8").read()
snap = {"synthesis": json.load(open(syn_p)), "open": json.load(open(open_p)), "settled": json.load(open(settled_p))}
snap["synthesis"] = {"meta": snap["synthesis"].get("meta", {}), "methodology": {"watch": (snap["synthesis"].get("methodology") or {}).get("watch", [])}}
for k in ("open", "settled"):
    if isinstance(snap[k], dict) and "data" in snap[k]: snap[k] = {"data": snap[k]["data"]}
SNAP = "const SNAPSHOT=null; // the page renders only for holders, from the desk\n"

def cut(pat, repl=""):
    global page
    m = re.search(pat, page, re.S)
    if not m: sys.exit("not found: " + pat[:50])
    page = page[:m.start()] + repl + page[m.end():]
cut(r"var DEGEN=.*?\n")
cut(r"const F = \[\n.*?\n\];\n")
cut(r"const TS=\{.*?\};\n")
cut(r"const READ=\{.*?\};\n")
cut(r"const CALLS=\[\n.*?\n\];\n")
cut(r"const NON_MARKET=\[.*?\];\n")
cut(r"const EXTRA_CAL=\[.*?\];\n")
cut(r"const F_BY=Object\.fromEntries\(F\.map\(f=>\[f\.id,f\]\)\);\n")
cut(r"const ALL=CALLS\.map\(build\).*?;\n")
cut(r"const DONE=F\.filter\(f=>f\.status!==\"open\"\).*?;\n")
cut(r"render\(\);moves\(\);calendar\(\);record\(\);stamp\(\);\n", 'holderGate("none"); loadCurrent().catch(err=>{ if(String(err.message)==="451") holderGate("unavailable"); else if(String(err.message)==="429") holderGate("limited"); else holderGate(keyOf()?"unknown":"none"); });\n')
# the live module after the helpers it needs (GF, TV, build, rank, render...) are all hoisted functions or consts above; put data lets at the very top of the script
j = page.index("const CAT={m:")
page = page[:j] + SNAP + instr + open("markets.js", encoding="utf-8").read() + open("nextclock.js", encoding="utf-8").read() + live + "\n" + page[j:]
# markup
if not page.lstrip().lower().startswith("<!doctype"):
    page = '<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="desk" content="%VITE_DESK%">\n' + page
page = page.replace('<span class="stamp" id="stamp"></span>', '<span class="stamp" id="stamp"></span><span class="stamp next" id="nextclock" data-short></span>', 1)
if 'id="gate"' not in page:
    page = page.replace('<a class="pw wslink" data-ext="world-state" href="#">World State ↗</a>', '<a class="pw wslink" data-ext="world-state" href="#">World State ↗</a><span class="gate" id="gate"></span>', 1)
page = page.replace('<main class="wrap">', '''<section id="holdergate" class="holdergate hidden" aria-labelledby="hg-h"><div class="wrap">
  <div class="k">FORECASTS · <span class="gstate"></span></div>
  <h1 id="hg-h">For holders.</h1>
  <p class="gmsg"></p>
  <form class="keyform"><input type="password" autocomplete="off" placeholder="paste your ubik.gold key" aria-label="ubik.gold key"><p class="kerr" role="alert"></p><div class="row"><button type="submit">Open</button><button type="button" class="forget">Forget key</button><a class="btn" href="https://ubik.gold" target="_blank" rel="noopener">Sign in at ubik.gold ↗</a><a class="btn" href="../world-state/">World State</a></div></form>
  <p class="small">The key stays in this browser. The desk passes it to ubik.gold, which answers whether it opens the page, and keeps nothing.</p>
</div></section>
<main class="wrap">''', 1)
page = page.replace('<footer>', open('account.html', encoding='utf-8').read() + '<footer>', 1)
page = re.sub(r'<p class="mono">Run by the UBIK team under .*?</p>', '<p class="legal"><a href="../disclaimer/" class="disc">Disclaimer</a> · <a href="https://ubik.gold/terms" target="_blank" rel="noopener">ubik.gold terms</a>. Not financial advice. For entertainment and education only. Built on content published by ubik.gold; a non-commercial, community-run initiative. AI-generated. Not for persons under 18 or in the United States.</p>', page, count=1, flags=re.S)
page = page.replace("</style>", open('account.css', encoding='utf-8').read() + '''
.gate{margin-left:8px}
.mast .stamp.next{color:var(--gold-ink);flex:none;overflow:visible}
.mast #stamp{display:none}
.mast .stamp.next .due{display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;margin-right:6px;vertical-align:1px;animation:duepulse 1.6s ease-in-out infinite}
@keyframes duepulse{0%,100%{opacity:1}50%{opacity:.25}}
.holdergate{padding:40px 0 60px}
.holdergate.hidden{display:none}
body.gated main.wrap,body.gated nav.tabs,body.gated #moves{display:none}
.holdergate .k{font-family:var(--mono);font-size:11px;letter-spacing:.1em;color:var(--muted)}
.holdergate h1{font-weight:400;font-size:clamp(30px,5vw,44px);margin:8px 0 10px}
.holdergate .gmsg{font-size:17px;line-height:1.5;max-width:620px}
.holdergate input{width:100%;max-width:520px;box-sizing:border-box;font-family:var(--mono);font-size:14px;padding:11px 12px;border:1px solid var(--rule);background:none;color:var(--ink);margin:12px 0 4px;display:block}
.holdergate .kerr{color:var(--hot);font-family:var(--mono);font-size:11.5px;min-height:1.4em;margin:0 0 8px}
.holdergate .row{display:flex;gap:8px;flex-wrap:wrap}
.holdergate .row button,.holdergate .row .btn{font:inherit;font-family:var(--ui);font-size:12px;letter-spacing:.06em;text-transform:uppercase;padding:9px 14px;border:1px solid var(--rule);background:var(--ink);color:var(--bg);cursor:pointer;text-decoration:none}
.holdergate .row .forget,.holdergate .row .btn{background:none;color:var(--ink)}
.holdergate .small{font-family:var(--mono);font-size:11px;color:var(--muted);margin-top:14px}
</style>''', 1)
page = page.replace("<footer>", open("attest.html", encoding="utf-8").read() + "<footer>", 1)
page = page.replace("</style>", open("attest.css", encoding="utf-8").read() + "</style>", 1)
i = page.rfind("</script>")
page = page[:i] + "\n" + open("gate_common.js", encoding="utf-8").read() + page[i:]
open(out, "w", encoding="utf-8").write(page)
print("built", out, len(page))
