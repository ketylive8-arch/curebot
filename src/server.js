import express from "express";
import { start, state, logout } from "./whatsapp.js";
import { stats, diagnoseOpenAI } from "./brain.js";
import { mountCloud, cloudState } from "./cloud.js";

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

app.get("/", (_req, res) => {
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(PAGE);
});

const PAGE = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CureBot — חיבור וואטסאפ</title>
<style>
 @import url('https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&display=swap');
 *{box-sizing:border-box}
 body{font-family:Assistant,system-ui,sans-serif;background:#f7f4ef;color:#2b2723;
      margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}
 .card{background:#fff;border:1px solid #e4ddd2;border-radius:16px;padding:28px;
       max-width:420px;width:100%;text-align:center;box-shadow:0 2px 16px rgba(0,0,0,.05)}
 h1{font-size:21px;margin:0 0 6px}
 .sub{color:#8a8178;font-size:14px;margin:0 0 20px;line-height:1.5}
 .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-left:7px}
 .pill{display:inline-flex;align-items:center;border:1px solid #e4ddd2;border-radius:20px;
       padding:7px 15px;font-size:14px;font-weight:600;margin-bottom:18px}
 img{width:300px;height:300px;border:1px solid #e4ddd2;border-radius:12px}
 .steps{text-align:right;font-size:14px;line-height:1.9;color:#5c554d;
        background:#faf8f4;border-radius:10px;padding:14px 18px;margin-top:18px}
 .ok{font-size:15px;line-height:1.7}
 .meta{font-size:13px;color:#8a8178;margin-top:14px}
 code{background:#f0ece5;padding:2px 6px;border-radius:4px;font-size:13px}
</style></head><body>
<div class="card" id="root">טוען…</div>
<script>
const COLORS={connected:"#2e9e5b",qr:"#c2974a",disconnected:"#c65b4e",starting:"#8a8178"};
const LABELS={connected:"מחובר",qr:"ממתין לסריקה",disconnected:"מנותק",starting:"מתחיל"};
async function tick(){
 try{
  const key=new URLSearchParams(location.search).get("key");
  const r=await fetch("/api/status"+(key?"?key="+encodeURIComponent(key):""));
  const s=await r.json();
  let body="";
  if(s.status==="qr"&&s.qrDataUrl){
   body='<img src="'+s.qrDataUrl+'" alt="QR">'+
    '<div class="steps">1. וואטסאפ בנייד ← הגדרות<br>'+
    '2. מכשירים מקושרים<br>3. קישור מכשיר<br>4. סריקה של הקוד שלמעלה</div>';
  } else if(s.status==="connected"){
   body='<div class="ok">✅ הסוכן מחובר ועונה.<br>מספר: <code>'+(s.me||"—")+'</code></div>'+
    '<div class="meta">שיחות פעילות: '+(s.activeChats||0)+' · הודעות שנענו: '+(s.handled||0)+'</div>';
  } else {
   body='<div class="ok">'+(s.lastEvent||"מתחבר…")+'</div>';
  }
  document.getElementById("root").innerHTML=
   '<h1>CureBot</h1><p class="sub">המענה של CURE MINDSET בוואטסאפ</p>'+
   '<div class="pill"><span class="dot" style="background:'+(COLORS[s.status]||"#999")+'"></span>'+
   (LABELS[s.status]||s.status)+'</div><div>'+body+'</div>';
 }catch(e){}
}
tick();setInterval(tick,3000);
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
