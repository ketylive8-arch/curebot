import express from "express";
import { start, state, logout, getSock } from "./whatsapp.js";
import { stats, diagnoseOpenAI, recentActivity, thinkAsOwner } from "./brain.js";
import { mountCloud, cloudState } from "./cloud.js";
import { handleCommand, ownerContext, OWNER_SYSTEM, localManageReply } from "./owner.js";

// ── יציבות: לעולם לא לתת לתהליך למות משגיאה בודדת. ──
// Baileys/הצפנת וואטסאפ זורקים לפעמים שגיאות stream/פענוח שהפילו את כל
// השרת ("Exited with status 1"). תופסים אותן כאן, רושמים וממשיכים —
// לוגיקת ההתחברות-מחדש כבר מטפלת בשאר. זה מונע את הקריסות ואיבוד ההודעות.
process.on("uncaughtException", (e) => console.error("[server] ⚠️ uncaughtException:", e?.message || e));
process.on("unhandledRejection", (e) => console.error("[server] ⚠️ unhandledRejection:", e?.message || e));

// השתקת הצפת לוגים ענקית מ-libsignal (הדפסות של אובייקטי SessionEntry/מפתחות)
// שמעמיסה על מכונה של 512MB. מסננים רק את הרעש הזה, שאר הלוגים נשמרים.
const _origLog = console.log.bind(console);
console.log = (...args) => {
  const first = typeof args[0] === "string" ? args[0] : "";
  if (/^(Closing session|Opening session|SessionEntry|\s*(baseKey|remoteIdentityKey|ephemeralKeyPair|rootKey|chainKey|_chains|currentRatchet|indexInfo|pendingPreKey|registrationId|previousCounter)\b)/.test(first)
      || /<Buffer /.test(first)) return;
  _origLog(...args);
};

const app = express();
const PORT = process.env.PORT || 3000;
const PANEL_KEY = process.env.PANEL_KEY || "";

// בוחרים ערוץ: אם מוגדרים טוקן+מספר של WhatsApp Cloud API — עוברים אליו
// (יציב, בלי QR ובלי ניתוקים, כמו Base44). אחרת נשארים על Baileys כברירת מחדל.
const USE_CLOUD = cloudState.configured;

// קורא גוף JSON — נחוץ ל-webhook של Meta.
app.use(express.json({ limit: "2mb" }));

// הגנה בסיסית: אם הוגדר PANEL_KEY, צריך להוסיף ?key=... לכתובת.
// נתיבי /health ו-/webhook (של Meta) פתוחים תמיד.
app.use((req, res, next) => {
  if (!PANEL_KEY || req.path === "/health" || req.path === "/webhook") return next();
  if (req.query.key === PANEL_KEY) return next();
  res.status(403).send("Forbidden");
});

// מחברים את נתיבי ה-Cloud API (webhook) תמיד — כך אפשר לאמת מול Meta עוד
// לפני שהערוץ פעיל במלואו. המענה בפועל יעבוד ברגע שהטוקן קיים.
mountCloud(app);

app.get("/health", (_req, res) => res.json({ ok: true, channel: USE_CLOUD ? "cloud" : "baileys", status: USE_CLOUD ? "cloud" : state.status }));

app.get("/api/status", (_req, res) => {
  if (USE_CLOUD) {
    return res.json({
      status: "connected",
      channel: "cloud",
      me: process.env.PHONE_NUMBER_ID || null,
      lastEvent: "WhatsApp Cloud API פעיל",
      ...cloudState,
      ...stats()
    });
  }
  res.json({ ...state, channel: "baileys", ...stats() });
});

app.post("/api/logout", async (_req, res) => {
  try { await logout(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// פעילות הסוכן — לידים חמים, התראות, מונים — לקונסולת הניהול.
app.get("/api/activity", (_req, res) => {
  try { res.json(recentActivity()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// צ'אט הניהול — קטי מדברת עם הסוכן כדי לנהל אותו (כמו Base44).
// קודם פקודות מהירות; אחרת ניסיון OpenAI; ואם אין — מוח ניהולי מקומי.
app.post("/api/manage", async (req, res) => {
  const message = (req.body?.message || "").toString().trim();
  if (!message) return res.json({ reply: "כתבי לי מה תרצי — למשל \"מה המצב היום\", \"לידים\", או \"עזרה\"." });
  try {
    const cmd = await handleCommand(message, getSock());
    if (cmd !== null) return res.json({ reply: cmd, kind: "command" });
    // מנסים את מוח ה-OpenAI; אם אין קרדיט/נכשל הוא מחזיר משפט כשל ידוע —
    // אז עוברים למוח הניהולי המקומי כדי שלא יופיע "לא הצלחתי".
    let ai = "";
    try { ai = await thinkAsOwner("console", message, OWNER_SYSTEM, ownerContext()); } catch { ai = ""; }
    if (!ai || ai.includes("לא הצלחתי להשלים")) {
      return res.json({ reply: localManageReply(message), kind: "local" });
    }
    return res.json({ reply: ai, kind: "ai" });
  } catch (e) {
    return res.json({ reply: localManageReply(message), kind: "local", note: e.message });
  }
});

app.get("/", (_req, res) => {
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(PAGE);
});

const PAGE = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CURE MINDSET · ניהול הסוכן</title>
<style>
 @import url('https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700;800&display=swap');
 *{box-sizing:border-box}
 :root{--bg:#f5f1ea;--card:#fff;--line:#e6ddcf;--ink:#2b2723;--mut:#8a8178;--gold:#b9974a;--green:#2e9e5b;--red:#c65b4e}
 body{font-family:Assistant,system-ui,sans-serif;background:var(--bg);color:var(--ink);margin:0;min-height:100vh}
 .wrap{max-width:760px;margin:0 auto;padding:18px 16px 40px}
 header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px;flex-wrap:wrap}
 .brand{font-size:20px;font-weight:800}
 .brand span{color:var(--gold)}
 .tag{color:var(--mut);font-size:13px;margin-top:2px}
 .pill{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);background:#fff;border-radius:20px;padding:6px 13px;font-size:13px;font-weight:700}
 .dot{width:9px;height:9px;border-radius:50%}
 .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
 @media(max-width:560px){.grid{grid-template-columns:repeat(2,1fr)}}
 .tile{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;text-align:center}
 .tile b{display:block;font-size:26px;font-weight:800}
 .tile small{color:var(--mut);font-size:12px}
 .panel{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:16px}
 .panel h2{font-size:15px;margin:0 0 10px}
 .lead{border-top:1px solid var(--line);padding:9px 0;font-size:14px}
 .lead:first-of-type{border-top:0}
 .lead .who{font-weight:700}
 .lead .txt{color:var(--mut)}
 .empty{color:var(--mut);font-size:14px}
 .chat{height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:4px}
 .msg{max-width:82%;padding:9px 13px;border-radius:14px;font-size:14px;line-height:1.5;white-space:pre-wrap}
 .me{align-self:flex-start;background:#efe7d6}
 .bot{align-self:flex-end;background:#f3f6f2;border:1px solid #e2ece2}
 .row{display:flex;gap:8px;margin-top:10px}
 input{flex:1;border:1px solid var(--line);border-radius:12px;padding:11px 13px;font:inherit;background:#fff}
 button{border:0;background:var(--gold);color:#fff;font-weight:700;border-radius:12px;padding:11px 18px;font:inherit;cursor:pointer}
 button:disabled{opacity:.5}
 .chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
 .chip{border:1px solid var(--line);background:#fff;border-radius:20px;padding:5px 11px;font-size:12.5px;cursor:pointer;color:var(--ink)}
 code{background:#f0ece5;padding:2px 6px;border-radius:4px;font-size:13px}
 img.qr{width:250px;height:250px;border:1px solid var(--line);border-radius:12px;display:block;margin:6px auto}
</style></head><body>
<div class="wrap">
 <header>
  <div><div class="brand">CURE <span>MINDSET</span> · ניהול הסוכן</div><div class="tag">"החופש להוביל. העוצמה להגשים."</div></div>
  <div class="pill"><span class="dot" id="dot" style="background:#8a8178"></span><span id="statusLabel">טוען…</span></div>
 </header>

 <div class="grid">
  <div class="tile"><b id="t-active">–</b><small>שיחות פעילות</small></div>
  <div class="tile"><b id="t-handled">–</b><small>הודעות שנענו</small></div>
  <div class="tile"><b id="t-hot">–</b><small>לידים חמים היום</small></div>
  <div class="tile"><b id="t-alerts">–</b><small>התראות מצוקה</small></div>
 </div>

 <div class="panel" id="qrPanel" style="display:none;text-align:center">
  <h2>חיבור וואטסאפ</h2><div id="qrBox"></div>
 </div>

 <div class="panel">
  <h2>לידים שדורשים אותך</h2>
  <div id="leads"><div class="empty">טוען…</div></div>
 </div>

 <div class="panel">
  <h2>צ'אט ניהול · דברי עם הסוכן</h2>
  <div class="chat" id="chat"></div>
  <div class="row">
   <input id="inp" placeholder="כתבי כאן… (למשל: מה המצב היום?)" autocomplete="off">
   <button id="send">שליחה</button>
  </div>
  <div class="chips">
   <span class="chip" data-q="מה המצב היום?">מה המצב היום?</span>
   <span class="chip" data-q="לידים">לידים</span>
   <span class="chip" data-q="השהה">השהה מענה</span>
   <span class="chip" data-q="המשך">הפעל מענה</span>
   <span class="chip" data-q="עזרה">עזרה</span>
  </div>
 </div>
</div>
<script>
const KEY=new URLSearchParams(location.search).get("key");
const q=s=>"/api"+s+(KEY?"?key="+encodeURIComponent(KEY):"");
const COLORS={connected:"#2e9e5b",cloud:"#2e9e5b",qr:"#b9974a",disconnected:"#c65b4e",starting:"#8a8178"};
const LABELS={connected:"מחובר ועונה",cloud:"מחובר (Cloud API)",qr:"ממתין לסריקה",disconnected:"מנותק — מתחבר",starting:"מתחיל"};
function esc(s){return (s||"").replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}

async function tick(){
 try{
  const s=await (await fetch(q("/status"))).json();
  document.getElementById("dot").style.background=COLORS[s.status]||"#999";
  document.getElementById("statusLabel").textContent=LABELS[s.status]||s.status||"—";
  document.getElementById("t-active").textContent=s.activeChats??"–";
  document.getElementById("t-handled").textContent=s.handled??"–";
  const qp=document.getElementById("qrPanel"),qb=document.getElementById("qrBox");
  if(s.status==="qr"&&s.qrDataUrl){qp.style.display="";qb.innerHTML='<img class="qr" src="'+s.qrDataUrl+'"><div class="empty">וואטסאפ ← מכשירים מקושרים ← קישור מכשיר ← סריקה</div>';}
  else qp.style.display="none";
 }catch(e){}
 try{
  const a=await (await fetch(q("/activity"))).json();
  document.getElementById("t-hot").textContent=a.hot??"–";
  document.getElementById("t-alerts").textContent=a.alerts??"–";
  const el=document.getElementById("leads");
  if(!a.flagged||!a.flagged.length){el.innerHTML='<div class="empty">אין כרגע לידים שדורשים התייחסות אישית.</div>';}
  else{el.innerHTML=a.flagged.slice(0,12).map(f=>'<div class="lead"><span class="who">'+(f.alert?"🔴 ":"🟡 ")+esc(f.from)+'</span> <span class="txt">"'+esc((f.text||"").slice(0,80))+'"</span></div>').join("");}
 }catch(e){}
}

const chat=document.getElementById("chat");
function add(cls,txt){const d=document.createElement("div");d.className="msg "+cls;d.textContent=txt;chat.appendChild(d);chat.scrollTop=chat.scrollHeight;}
async function send(text){
 text=(text||document.getElementById("inp").value).trim();if(!text)return;
 document.getElementById("inp").value="";add("me",text);
 const btn=document.getElementById("send");btn.disabled=true;
 try{
  const r=await fetch(q("/manage"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text})});
  const j=await r.json();add("bot",j.reply||"…");
 }catch(e){add("bot","לא הצלחתי להתחבר לשרת כרגע. נסי שוב בעוד רגע.");}
 btn.disabled=false;tick();
}
document.getElementById("send").onclick=()=>send();
document.getElementById("inp").addEventListener("keydown",e=>{if(e.key==="Enter")send();});
document.querySelectorAll(".chip").forEach(c=>c.onclick=()=>send(c.dataset.q));
add("bot","שלום קטי 💛 אני העוזר הניהולי שלך. אפשר לשאול \\"מה המצב היום\\", לבקש \\"לידים\\", או לכתוב \\"עזרה\\" לכל הפקודות.");
tick();setInterval(tick,4000);
</script></body></html>`;

app.listen(PORT, () => console.log(`[server] פועל על פורט ${PORT} | ערוץ: ${USE_CLOUD ? "WhatsApp Cloud API" : "Baileys"}`));

// אבחון OpenAI פעם אחת בעלייה — מדפיס ללוג אם יש קרדיט ולאיזה ארגון שייך המפתח.
diagnoseOpenAI().catch(() => {});

if (USE_CLOUD) {
  console.log("[server] ערוץ Cloud API פעיל — Baileys כבוי. אין צורך בסריקת QR.");
} else {
  start().catch(e => {
    console.error("[server] כשל בהפעלת וואטסאפ:", e.message);
    state.lastEvent = "כשל בהפעלה: " + e.message;
  });
}
