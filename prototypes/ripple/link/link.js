(function(){
  const DESK="https://ubikistan-guest-desk.ubikistan-archive.workers.dev";
  const $=id=>document.getElementById(id), msg=(t,err)=>{$("msg").textContent=t;$("msg").className="msg"+(err?" err":"")};
  const linkToken=new URLSearchParams(location.search).get("t")||"";
  function signIn(){const n=Array.from(crypto.getRandomValues(new Uint8Array(12)),b=>b.toString(16).padStart(2,"0")).join("");try{sessionStorage.setItem("ubk.nonce",n)}catch(e){}
    location.href=DESK+"/auth/x?return="+encodeURIComponent(location.origin+location.pathname+location.search)+"&nonce="+n}
  $("go").addEventListener("click",signIn);
  if(!linkToken){msg("This page opens from the Red Ripple bot. In Telegram, send /link to the bot in a private chat.",true);return}
  const h=location.hash||"";
  if(!h.startsWith("#/signed-in")){ $("go").hidden=false; msg("Tap the button and sign in with the X account you post from."); return }
  const q={};(h.split("?")[1]||"").split("&").forEach(p=>{const [k,v]=p.split("=");if(k)q[decodeURIComponent(k)]=decodeURIComponent((v||"").replace(/\+/g," "))});
  let mine="";try{mine=sessionStorage.getItem("ubk.nonce")||"";sessionStorage.removeItem("ubk.nonce")}catch(e){}
  history.replaceState(null,"",location.pathname+location.search);
  if(!q.t||!q.n||q.n!==mine){$("go").hidden=false;msg("The sign-in did not come back as expected. Try again.",true);return}
  try{localStorage.setItem("ubk.session",q.t)}catch(e){}
  msg("Linking…");
  fetch(DESK+"/tg/link",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+q.t},body:JSON.stringify({t:linkToken})})
    .then(r=>r.json().then(j=>({ok:r.ok,j})))
    .then(({ok,j})=>{ if(ok){msg("Linked to @"+j.handle+". You can close this page and go back to Telegram.")} else {msg(j.error||"That did not work. Ask the bot for a new link with /link.",true);$("go").hidden=false} })
    .catch(()=>{msg("The desk did not answer. Check your connection and try again.",true);$("go").hidden=false});
})();
