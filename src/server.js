import express from "express";
import { start, state, logout } from "./whatsapp.js";
import { stats } from "./brain.js";

const app = express();
const PORT = process.env.PORT || 3000;
const PANEL_KEY = process.env.PANEL_KEY || "";

// הגנה בסיסית: אם הוגדר PANEL_KEY, צריך להוסיף ?key=... לכתובת
app.use((req, res, next) => {
  if (!PANEL_KEY || req.path === "/health") return next();
  if (req.query.key === PANEL_KEY) return next();
  res.status(403).send("Forbidden");
});

app.get("/health", (_req, res) => res.json({ ok: true, status: state.status }));

app.get("/api/status", (_req, res) => {
  res.json({ ...state, ...stats() });
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

app.listen(PORT, () => console.log(`[server] פועל על פורט ${PORT}`));

start().catch(e => {
  console.error("[server] כשל בהפעלת וואטסאפ:", e.message);
  state.lastEvent = "כשל בהפעלה: " + e.message;
});
