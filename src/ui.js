// ============================================================
//  הממשק — מינימליסטי בסגנון אפל: לבן, זהב, הרבה אוויר, פעולה אחת בכל מסך.
//  נגישות: עברית RTL, תוויות לכל שדה, מתגים עם role="switch", פוקוס בולט,
//  הודעות מצב ב-aria-live, ניגודיות AA, כבוד ל-"הפחתת תנועה".
// ============================================================
export function page({ nonce, tenantHint = "" }) {
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#FFFFFF">
<title>CURE MINDSET · חיבורי וואטסאפ</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#FFFFFF; --surface:#F5F5F7; --ink:#1D1D1F; --muted:#6E6E73; --line:#E5E5EA;
  --gold:#C2974A; --gold-ink:#86652B; --gold-soft:#F7F1E6;
  --green:#1F7A37; --green-soft:#EAF6EE; --red:#C4161C; --red-soft:#FDECEC;
  --r:20px; --shadow:0 1px 2px rgba(0,0,0,.04),0 10px 30px rgba(0,0,0,.06);
}
*{box-sizing:border-box}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:400 17px/1.55 "Heebo",-apple-system,"SF Pro Text",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.skip{position:absolute;inset-inline-start:-999px;top:8px;background:var(--ink);color:#fff;padding:10px 16px;border-radius:12px;z-index:9}
.skip:focus{inset-inline-start:12px}
header{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.86);backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);border-bottom:1px solid var(--line)}
.bar{max-width:880px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.mark{font-weight:600;letter-spacing:.24em;font-size:13px;color:var(--gold-ink)}
.mark small{display:block;letter-spacing:0;font-weight:400;font-size:13px;color:var(--muted)}
main{max-width:880px;margin:0 auto;padding:40px 20px 96px}
h1{font-size:clamp(28px,5vw,40px);font-weight:600;letter-spacing:-.02em;line-height:1.15;margin:0 0 8px}
h2{font-size:20px;font-weight:600;letter-spacing:-.01em;margin:0 0 14px}
p.lead{color:var(--muted);font-size:18px;margin:0 0 32px;max-width:52ch}
.card{background:var(--bg);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:28px}
.section{margin-top:28px}
.btn{appearance:none;border:0;border-radius:999px;min-height:48px;padding:0 24px;font:inherit;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;transition:background .2s,transform .1s}
.btn:active{transform:scale(.98)}
.btn-primary{background:var(--ink);color:#fff}
.btn-primary:hover{background:#000}
.btn-gold{background:var(--gold);color:#fff}
.btn-gold:hover{background:var(--gold-ink)}
.btn-ghost{background:var(--surface);color:var(--ink)}
.btn-ghost:hover{background:#ECECF0}
.btn-danger{background:var(--red-soft);color:var(--red)}
.btn-link{background:none;color:var(--gold-ink);padding:0;min-height:44px}
.btn[disabled]{opacity:.5;cursor:default}
:focus-visible{outline:3px solid var(--gold);outline-offset:3px;border-radius:12px}
label{display:block;font-size:15px;font-weight:500;margin:0 0 8px}
.hint{display:block;color:var(--muted);font-size:14px;font-weight:400;margin-top:4px}
input[type=text],input[type=tel],input[type=password]{width:100%;min-height:52px;border:1px solid var(--line);background:var(--surface);border-radius:14px;padding:0 16px;font:inherit;color:var(--ink)}
input:focus{border-color:var(--gold);background:#fff;outline:none;box-shadow:0 0 0 4px var(--gold-soft)}
.code-input{text-align:center;letter-spacing:.4em;font-size:24px!important;font-weight:500}
.field{margin-bottom:20px}
.row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.center{text-align:center}
.login{max-width:420px;margin:8vh auto 0}
.err{color:var(--red);min-height:24px;font-size:15px;margin-top:10px}
.pill{white-space:nowrap;display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:500;padding:6px 14px;border-radius:999px;background:var(--surface);color:var(--muted)}
.pill i{width:8px;height:8px;border-radius:50%;background:currentColor;display:inline-block}
.pill.ok{background:var(--green-soft);color:var(--green)}
.pill.wait{background:var(--gold-soft);color:var(--gold-ink)}
.pill.bad{background:var(--red-soft);color:var(--red)}
.list{display:grid;gap:12px}
.conn{width:100%;text-align:start;background:var(--bg);border:1px solid var(--line);border-radius:var(--r);padding:22px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;cursor:pointer;font:inherit;color:inherit;transition:box-shadow .2s,border-color .2s}
.conn:hover{box-shadow:var(--shadow);border-color:#D9D9DE}
.conn b{display:block;font-weight:600;font-size:18px}
.conn span.sub{color:var(--muted);font-size:15px}
.hero{display:grid;grid-template-columns:auto 1fr;gap:32px;align-items:center}
@media(max-width:640px){.hero{grid-template-columns:1fr;text-align:center}.hero .steps{text-align:start}}
.qr{width:260px;height:260px;border-radius:18px;border:1px solid var(--line);background:#fff;display:block;margin:0 auto}
.steps{margin:0;padding:0;list-style:none;counter-reset:s}
.steps li{counter-increment:s;display:flex;gap:14px;align-items:flex-start;padding:10px 0}
.steps li::before{content:counter(s);flex:none;width:30px;height:30px;border-radius:50%;background:var(--gold-soft);color:var(--gold-ink);font-weight:600;display:flex;align-items:center;justify-content:center;font-size:15px}
.big-ok{width:72px;height:72px;border-radius:50%;background:var(--green-soft);color:var(--green);display:flex;align-items:center;justify-content:center;font-size:34px;margin:0 auto}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
@media(max-width:640px){.stats{grid-template-columns:repeat(2,1fr)}}
.stat{background:var(--surface);border-radius:16px;padding:18px;text-align:center}
.stat b{display:block;font-size:28px;font-weight:600;letter-spacing:-.02em}
.stat span{color:var(--muted);font-size:14px}
.setting{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 0;border-top:1px solid var(--line)}
.setting:first-of-type{border-top:0}
.setting .t{font-weight:500}
.switch{flex:none;width:52px;height:32px;border-radius:999px;border:0;background:#D1D1D6;position:relative;cursor:pointer;transition:background .2s}
.switch::after{content:"";position:absolute;top:3px;inset-inline-start:3px;width:26px;height:26px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.2);transition:inset-inline-start .2s}
.switch[aria-checked=true]{background:var(--gold)}
.switch[aria-checked=true]::after{inset-inline-start:23px}
.secret{background:var(--gold-soft);border-radius:16px;padding:20px;margin-top:16px}
.secret code{display:block;font:500 15px/1.5 ui-monospace,SFMono-Regular,monospace;word-break:break-all;direction:ltr;text-align:left;background:#fff;border-radius:10px;padding:10px 12px;margin:6px 0 10px}
.secret .codebig{font-size:30px;letter-spacing:.3em;text-align:center}
.flag{padding:14px 0;border-top:1px solid var(--line);font-size:15px}
.flag:first-child{border-top:0}
.muted{color:var(--muted)}
.back{display:inline-flex;margin-bottom:18px}
.tabs{display:flex;gap:4px;background:var(--surface);border-radius:14px;padding:4px;margin:0 0 20px}
.tabs button{flex:1;border:0;background:transparent;border-radius:11px;min-height:44px;font:inherit;font-size:15px;font-weight:500;color:var(--muted);cursor:pointer;padding:0 10px}
.tabs button[aria-selected=true]{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.08)}
.spin{width:28px;height:28px;border-radius:50%;border:3px solid var(--gold-soft);border-top-color:var(--gold);animation:sp 1s linear infinite;margin:0 auto}
@keyframes sp{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
</style>
</head>
<body>
<a class="skip" href="#main">דילוג לתוכן</a>
<header><div class="bar">
  <div class="mark" aria-label="CURE MINDSET — חיבורי וואטסאפ">CURE MINDSET<small>חיבורי וואטסאפ</small></div>
  <button class="btn btn-ghost" id="logout" hidden>יציאה</button>
</div></header>
<main id="main" tabindex="-1"><div class="spin" role="status" aria-label="טוען"></div></main>
<div class="sr" aria-live="polite" id="live"></div>

<script nonce="${nonce}">
(() => {
const TENANT_HINT = ${JSON.stringify(tenantHint)};
const main = document.getElementById("main");
const live = document.getElementById("live");
const logoutBtn = document.getElementById("logout");
let me = null, timer = null;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const say = (t) => { live.textContent = ""; setTimeout(() => live.textContent = t, 30); };
const phone = (d) => d ? "0" + String(d).replace(/^972/, "") : "";

async function api(path, opts = {}) {
  const method = opts.method || "GET";
  const write = method !== "GET";
  // כל פעולה שמשנה משהו נשלחת כ-JSON (הגנת CSRF בצד השרת).
  const r = await fetch(path, { method, headers: write ? { "Content-Type": "application/json" } : {}, body: write ? JSON.stringify(opts.body || {}) : undefined, credentials: "same-origin" });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || "משהו השתבש"), { status: r.status });
  return data;
}

const STATUS = {
  connected:    ["ok",   "מחובר ועונה"],
  qr:           ["wait", "ממתין לסריקה"],
  starting:     ["wait", "מתחבר…"],
  disconnected: ["bad",  "מנותק — מתחבר מחדש"],
  stopped:      ["bad",  "כבוי"]
};
const pill = (s) => { const [c, t] = STATUS[s] || ["", s || "—"]; return '<span class="pill ' + c + '"><i aria-hidden="true"></i>' + t + "</span>"; };

function stop() { if (timer) { clearInterval(timer); timer = null; } }
function focusMain() { main.focus({ preventScroll: true }); window.scrollTo(0, 0); }

// ── כניסה ──
function renderLogin(msg = "") {
  stop(); logoutBtn.hidden = true;
  main.innerHTML =
    '<div class="login center">' +
      "<h1>כניסה</h1>" +
      '<p class="lead" style="margin-inline:auto">' + (TENANT_HINT ? "הזיני את קוד הגישה בן 6 הספרות שקיבלת." : "הזיני את קוד הגישה שלך.") + "</p>" +
      '<form id="lf" class="card" novalidate>' +
        '<div class="field"><label for="code">קוד גישה</label>' +
        '<input id="code" class="code-input" type="password" autocomplete="one-time-code" ' + (TENANT_HINT ? 'inputmode="numeric" maxlength="6"' : "") + ' required></div>' +
        '<button class="btn btn-primary" style="width:100%" type="submit">כניסה</button>' +
        '<div class="err" id="err" role="alert">' + esc(msg) + "</div>" +
      "</form>" +
    "</div>";
  const f = document.getElementById("lf"), code = document.getElementById("code");
  code.focus();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector("button"); btn.disabled = true;
    try { await api("/api/login", { method: "POST", body: { code: code.value, tenantId: TENANT_HINT } }); await boot(); }
    catch (er) { document.getElementById("err").textContent = er.message; code.select(); }
    finally { btn.disabled = false; }
  };
}

// ── מנהלת: כל החיבורים ──
async function renderHome() {
  stop(); logoutBtn.hidden = false;
  const { tenants } = await api("/api/tenants");
  main.innerHTML =
    "<h1>החיבורים שלך</h1>" +
    '<p class="lead">כל חיבור הוא מספר וואטסאפ אחד שהסוכן עונה בו. אפשר לחבר כמה שצריך — לכל אחד קישור וקוד משלו.</p>' +
    '<div class="list" id="list">' +
      (tenants.length ? tenants.map(t =>
        '<button class="conn" data-id="' + esc(t.id) + '"><div><b>' + esc(t.name) + '</b><span class="sub">' +
        esc(t.status?.me ? phone(t.status.me) : "עוד לא מחובר") + "</span></div>" + pill(t.status?.status) + "</button>").join("")
      : '<div class="card muted center">עוד אין חיבורים.</div>') +
    "</div>" +
    '<div class="section"><button class="btn btn-gold" id="add">＋ חיבור חדש</button></div>' +
    '<div id="addBox"></div>';
  main.querySelectorAll(".conn").forEach(b => b.onclick = () => { location.hash = "#/c/" + b.dataset.id; });
  document.getElementById("add").onclick = renderAdd;
  focusMain();
}

function renderAdd() {
  const box = document.getElementById("addBox");
  box.innerHTML =
    '<form id="af" class="card section" novalidate>' +
      "<h2>חיבור חדש</h2>" +
      '<div class="field"><label for="nm">שם החיבור</label><input id="nm" type="text" placeholder="למשל: הקליניקה בחיפה" required></div>' +
      '<div class="field"><label for="ph">מספר לקבלת התראות<span class="hint">לכאן יישלחו התראות מצוקה ובקשות לדבר עם אדם. אפשר להשאיר ריק.</span></label><input id="ph" type="tel" inputmode="tel" placeholder="050-0000000"></div>' +
      '<div class="row"><button class="btn btn-primary" type="submit">יצירה</button><button class="btn btn-ghost" type="button" id="cx">ביטול</button></div>' +
      '<div class="err" id="aerr" role="alert"></div>' +
    "</form>";
  document.getElementById("nm").focus();
  document.getElementById("cx").onclick = () => box.innerHTML = "";
  document.getElementById("af").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api("/api/tenants", { method: "POST", body: { name: document.getElementById("nm").value, ownerNumber: document.getElementById("ph").value } });
      box.innerHTML = '<div class="card section">' + secretBlock(r) +
        '<div class="row" style="margin-top:16px"><button class="btn btn-primary" id="open">פתיחת החיבור</button></div></div>';
      document.getElementById("open").onclick = () => { location.hash = "#/c/" + r.tenant.id; };
      wireCopy(box); say("החיבור נוצר");
    } catch (er) { document.getElementById("aerr").textContent = er.message; }
  };
}

function secretBlock(r) {
  return "<h2>" + esc(r.tenant?.name || "החיבור") + " מוכן</h2>" +
    '<p class="muted" style="margin:0">שלחי את הקישור למי שיחבר את הוואטסאפ שלו. <b>הקוד מוצג פעם אחת בלבד</b> — כדאי לשמור אותו.</p>' +
    '<div class="secret">' +
      "<div>קישור כניסה ישיר</div><code>" + esc(r.directLink) + "</code>" +
      '<button class="btn btn-ghost" data-copy="' + esc(r.directLink) + '">העתקת הקישור</button>' +
      '<div style="margin-top:16px">קוד גישה</div><code class="codebig">' + esc(r.code) + "</code>" +
      '<div class="muted" style="font-size:14px">או כניסה ידנית: ' + esc(r.link) + " + הקוד</div>" +
    "</div>";
}
function wireCopy(root) {
  root.querySelectorAll("[data-copy]").forEach(b => b.onclick = async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "הועתק ✓"; say("הועתק"); } catch { b.textContent = "סמני והעתיקי ידנית"; }
  });
}

// ── מסך חיבור ──
async function renderConn(id) {
  stop(); logoutBtn.hidden = false;
  const isAdmin = me.role === "admin";
  main.innerHTML =
    (isAdmin ? '<a class="btn btn-link back" href="#/">→ כל החיבורים</a>' : "") +
    '<h1 id="nm"></h1><div id="st" style="margin-bottom:28px"></div>' +
    '<section class="card" id="hero" aria-live="polite"></section>' +
    '<section class="section"><div class="stats" id="stats"></div></section>' +
    '<section class="card section"><h2>הגדרות</h2><div id="sets"></div></section>' +
    '<section class="card section"><h2>דורש את תשומת לבך</h2><div id="flags"></div></section>' +
    '<section class="card section"><h2>ניהול</h2><div class="row" id="mgmt"></div><div id="mgmtOut"></div></section>';
  let lastStatus = null, first = true;
  // בטלפון אי אפשר לסרוק את המסך של עצמו — לכן בטלפון נפתחים על "חיבור עם קוד".
  let heroTab = matchMedia("(max-width: 640px)").matches ? "code" : "scan";

  async function refresh() {
    let d;
    try { d = await api("/api/tenants/" + encodeURIComponent(id)); }
    catch (er) { if (er.status === 401) return boot(); return; }
    const t = d.tenant, s = d.status || {};
    document.getElementById("nm").textContent = t.name;
    document.getElementById("st").innerHTML = pill(s.status) + (s.me ? ' <span class="muted" style="margin-inline-start:10px">' + esc(phone(s.me)) + "</span>" : "");
    // במצב סריקה לא מציירים מחדש (כדי לא למחוק מה שמקלידים) — רק מחליפים את תמונת ה-QR.
    const img = document.querySelector("#hero img.qr");
    if (s.status === "qr" && lastStatus === "qr" && img && s.qrDataUrl) img.src = s.qrDataUrl;
    else if (s.status !== lastStatus) renderHero(s);
    if (s.status !== lastStatus && !first) say((STATUS[s.status] || [, s.status])[1]);
    lastStatus = s.status;
    document.getElementById("stats").innerHTML = [
      [s.handled || 0, "הודעות שנענו"], [s.activeChats || 0, "שיחות פעילות"], [s.hot || 0, "ביקשו לדבר איתך"], [s.alerts || 0, "התראות מצוקה"]
    ].map(([n, l]) => '<div class="stat"><b>' + n + "</b><span>" + l + "</span></div>").join("");
    document.getElementById("flags").innerHTML = (s.flagged || []).length
      ? s.flagged.slice(0, 10).map(f => '<div class="flag">' + (f.alert ? "🔴 " : "🟡 ") + "<b>" + esc(phone(f.from) || f.from) + '</b><div class="muted">' + esc(f.text) + "</div></div>").join("")
      : '<p class="muted" style="margin:0">אין כרגע פניות שדורשות אותך.</p>';
    if (first) { renderSettings(t, d.ai); renderMgmt(t); first = false; focusMain(); }
  }

  function renderHero(s) {
    const hero = document.getElementById("hero");
    if (s.status === "qr" && s.qrDataUrl) {
      hero.innerHTML =
        "<h2>חיבור הוואטסאפ</h2>" +
        '<div class="tabs" role="tablist" aria-label="דרך החיבור">' +
          '<button role="tab" id="t-code" aria-controls="p-code">בטלפון בלבד — עם קוד</button>' +
          '<button role="tab" id="t-scan" aria-controls="p-scan">ממחשב — סריקת QR</button>' +
        "</div>" +
        '<div id="p-code" role="tabpanel" aria-labelledby="t-code">' +
          '<ol class="steps">' +
          "<li><span>כתבי כאן את מספר הוואטסאפ שרוצים לחבר, ולחצי <b>קבלת קוד</b>.</span></li>" +
          "<li><span>בוואטסאפ: <b>הגדרות</b> ← <b>מכשירים מקושרים</b> ← <b>קישור מכשיר</b>.</span></li>" +
          "<li><span>למטה במסך הסריקה: <b>״קישור באמצעות מספר טלפון במקום זאת״</b> — והקלידי את הקוד.</span></li></ol>" +
          '<form id="pf" class="row" style="margin-top:12px" novalidate><label class="sr" for="pph">מספר הוואטסאפ לחיבור</label>' +
          '<input id="pph" type="tel" inputmode="tel" autocomplete="tel" placeholder="054-0000000" style="flex:1;min-width:190px">' +
          '<button class="btn btn-primary" type="submit">קבלת קוד</button></form>' +
          '<div class="err" id="perr" role="alert"></div><div id="pcode" aria-live="polite"></div>' +
        "</div>" +
        '<div id="p-scan" role="tabpanel" aria-labelledby="t-scan"><div class="hero">' +
          '<img class="qr" src="' + s.qrDataUrl + '" alt="קוד QR לחיבור וואטסאפ — סרקי אותו מהטלפון">' +
          '<div><ol class="steps">' +
          "<li><span>פתחי את הדף הזה במחשב או בטאבלט.</span></li>" +
          "<li><span>בטלפון, בוואטסאפ: <b>הגדרות</b> ← <b>מכשירים מקושרים</b> ← <b>קישור מכשיר</b>.</span></li>" +
          "<li><span>כווני את הטלפון לקוד שעל המסך. זהו — הסוכן מתחיל לענות.</span></li></ol>" +
          '<p class="muted" style="font-size:14px;margin:8px 0 0">הקוד מתחדש לבד כל כמה שניות.</p></div></div></div>';
      const tabs = { code: ["t-code", "p-code"], scan: ["t-scan", "p-scan"] };
      const show = (k) => {
        heroTab = k;
        for (const [name, [tb, pn]] of Object.entries(tabs)) {
          const on = name === k;
          document.getElementById(tb).setAttribute("aria-selected", String(on));
          document.getElementById(tb).tabIndex = on ? 0 : -1;
          document.getElementById(pn).hidden = !on;
        }
      };
      document.getElementById("t-code").onclick = () => show("code");
      document.getElementById("t-scan").onclick = () => show("scan");
      hero.querySelector(".tabs").onkeydown = (e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") { const k = heroTab === "code" ? "scan" : "code"; show(k); document.getElementById(tabs[k][0]).focus(); }
      };
      show(heroTab);
      if (s.pairingCode) document.getElementById("pcode").innerHTML = codeBox(s.pairingCode);
      document.getElementById("pf").onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector("button"), err = document.getElementById("perr");
        btn.disabled = true; err.textContent = "";
        try {
          const r = await api("/api/tenants/" + encodeURIComponent(id) + "/pair", { method: "POST", body: { phone: document.getElementById("pph").value } });
          document.getElementById("pcode").innerHTML = codeBox(r.code); say("הקוד מוכן: " + r.code.split("").join(" "));
        } catch (er) { err.textContent = er.message; }
        finally { btn.disabled = false; }
      };
    } else if (s.status === "connected") {
      hero.innerHTML = '<div class="center"><div class="big-ok" aria-hidden="true">✓</div><h2 style="margin:16px 0 4px">מחובר ועונה</h2>' +
        '<p class="muted" style="margin:0">הסוכן עונה עכשיו לפניות שמגיעות ל-' + esc(phone(s.me)) + ".</p></div>";
    } else {
      hero.innerHTML = '<div class="center"><div class="spin" aria-hidden="true"></div><p class="muted" style="margin:16px 0 0">' + esc(s.lastEvent || "מתחבר…") + "</p></div>";
    }
  }

  function codeBox(code) {
    return '<div class="secret center" style="margin-top:14px"><div>הקוד להקלדה בוואטסאפ</div>' +
      '<code class="codebig" style="direction:ltr">' + esc(code) + "</code>" +
      '<div class="muted" style="font-size:14px">הקוד תקף לכמה דקות. אם פג — לחצי שוב "קבלת קוד".</div></div>';
  }

  function renderSettings(t, ai) {
    const sets = document.getElementById("sets");
    const sw = (key, title, sub, on) => '<div class="setting"><div><div class="t" id="l-' + key + '">' + title + '</div><div class="muted" style="font-size:14px">' + sub + "</div></div>" +
      '<button class="switch" role="switch" aria-checked="' + (on ? "true" : "false") + '" aria-labelledby="l-' + key + '" data-key="' + key + '"></button></div>';
    sets.innerHTML =
      sw("active", "המענה האוטומטי פעיל", "כשכבוי — הסוכן לא עונה לאף אחד.", t.settings?.active !== false) +
      sw("onlyNonContacts", "לענות רק לפניות חדשות", "לא עונה לאנשי קשר ששמורים בטלפון (משפחה, חברים, לקוחות קיימים).", t.settings?.onlyNonContacts !== false) +
      '<div class="setting" style="display:block"><label for="own">מספר לקבלת התראות<span class="hint">התראות מצוקה ובקשות לדבר עם אדם נשלחות לכאן.</span></label>' +
      '<div class="row"><input id="own" type="tel" inputmode="tel" style="flex:1;min-width:200px" value="' + esc(phone(t.ownerNumber)) + '"><button class="btn btn-ghost" id="saveOwn">שמירה</button></div></div>' +
      '<div class="setting"><div><div class="t">מצב התשובות</div><div class="muted" style="font-size:14px">' +
      (ai?.mode === "openai" ? "OpenAI פעיל — תשובות זורמות." : "טקסטים בשיטת CureMindset — חינמי, בלי מפתח. יעבור לבד ל-OpenAI כשיהיה קרדיט.") + "</div></div></div>";
    sets.querySelectorAll(".switch").forEach(b => b.onclick = async () => {
      const on = b.getAttribute("aria-checked") !== "true";
      b.setAttribute("aria-checked", String(on));
      try { await api("/api/tenants/" + encodeURIComponent(id), { method: "PATCH", body: { settings: { [b.dataset.key]: on } } }); say("נשמר"); }
      catch (er) { b.setAttribute("aria-checked", String(!on)); say(er.message); }
    });
    document.getElementById("saveOwn").onclick = async (e) => {
      try { await api("/api/tenants/" + encodeURIComponent(id), { method: "PATCH", body: { ownerNumber: document.getElementById("own").value } }); e.target.textContent = "נשמר ✓"; say("נשמר"); }
      catch (er) { say(er.message); }
    };
  }

  function renderMgmt(t) {
    const m = document.getElementById("mgmt"), out = document.getElementById("mgmtOut");
    m.innerHTML = '<button class="btn btn-ghost" id="dc">ניתוק וחיבור מחדש</button>' +
      (isAdmin ? '<button class="btn btn-ghost" id="rc">קוד גישה חדש</button><button class="btn btn-danger" id="rm">מחיקת החיבור</button>' : "");
    document.getElementById("dc").onclick = async () => {
      if (!confirm("לנתק את הוואטסאפ מהסוכן וליצור קוד QR חדש?")) return;
      try { await api("/api/tenants/" + encodeURIComponent(id) + "/disconnect", { method: "POST", body: {} }); lastStatus = null; say("נותק. קוד QR חדש בדרך"); refresh(); }
      catch (er) { say(er.message); }
    };
    if (!isAdmin) return;
    document.getElementById("rc").onclick = async () => {
      if (!confirm("ליצור קוד גישה חדש? הקוד הקודם יפסיק לעבוד.")) return;
      try { const r = await api("/api/tenants/" + encodeURIComponent(id) + "/reset-code", { method: "POST", body: {} }); out.innerHTML = secretBlock({ ...r, tenant: t }); wireCopy(out); say("נוצר קוד חדש"); }
      catch (er) { say(er.message); }
    };
    document.getElementById("rm").onclick = async () => {
      if (!confirm("למחוק את החיבור לגמרי? הסוכן יפסיק לענות במספר הזה.")) return;
      try { await api("/api/tenants/" + encodeURIComponent(id), { method: "DELETE" }); location.hash = "#/"; }
      catch (er) { say(er.message); }
    };
  }

  await refresh();
  timer = setInterval(refresh, 4000);
}

async function route() {
  const m = location.hash.match(/^#\\/c\\/([\\w-]+)/);
  try {
    if (me.role === "tenant") return renderConn(me.t);
    if (m) return renderConn(m[1]);
    return renderHome();
  } catch (er) { if (er.status === 401) return boot(); main.innerHTML = '<div class="card err">' + esc(er.message) + "</div>"; }
}

async function boot() {
  try { me = await api("/api/me"); } catch { me = null; }
  if (!me || !me.role) return renderLogin();
  route();
}

logoutBtn.onclick = async () => { try { await api("/api/logout", { method: "POST", body: {} }); } catch {} me = null; location.hash = ""; renderLogin(); };
window.addEventListener("hashchange", () => me && route());
boot();
})();
</script>
</body></html>`;
}
