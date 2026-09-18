// ============================================================
//  WhatsApp Cloud API (Meta הרשמי) — ערוץ יציב, בלי QR ובלי ניתוקים.
//  זו הדרך שבה עובד "Base44": מספר עסקי, webhook, ומענה דרך Graph API.
//  המודול מוסיף שני נתיבים לשרת Express הקיים:
//    GET  /webhook  — אימות מול Meta (hub.challenge)
//    POST /webhook  — קבלת הודעות נכנסות ומענה אוטומטי
//  אינו נוגע ב-Baileys; נדלק רק כאשר מוגדרים WHATSAPP_TOKEN + PHONE_NUMBER_ID.
// ============================================================
import { think, isPaused, pause, isGloballyPaused, countHandled, flag } from "./brain.js";
import { INFO_CARD } from "./prompt.js";

const TOKEN = process.env.WHATSAPP_TOKEN || "";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "";
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "curemindset-verify";
const GRAPH_VERSION = process.env.GRAPH_VERSION || "v21.0";
const OWNER = (process.env.OWNER_NUMBER || "").replace(/\D/g, "");

export const cloudState = {
  channel: "cloud",
  configured: Boolean(TOKEN && PHONE_NUMBER_ID),
  lastInbound: null,
  lastOutbound: null,
  handled: 0
};

// מונע טיפול כפול באותה הודעה (Meta שולחת מחדש אם לא ענינו 200 מהר).
const seen = new Set();
function alreadySeen(id) {
  if (!id) return false;
  if (seen.has(id)) return true;
  seen.add(id);
  if (seen.size > 500) seen.delete(seen.values().next().value);
  return false;
}

async function graphSend(to, text) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: true, body: text }
    })
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`[cloud] שליחה נכשלה (${res.status}): ${body.slice(0, 300)}`);
    throw new Error(`graph ${res.status}`);
  }
  cloudState.lastOutbound = new Date().toISOString();
  return body;
}

// מסמן הודעה כנקראה (וי כחול) — נחמד, לא חובה.
async function markRead(messageId) {
  if (!messageId) return;
  try {
    await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId })
    });
  } catch { /* לא קריטי */ }
}

// מחלץ טקסט מהודעת Cloud API (סוגים שונים).
function extractText(msg) {
  if (!msg) return "";
  if (msg.type === "text") return msg.text?.body || "";
  if (msg.type === "interactive") {
    return msg.interactive?.button_reply?.title
      || msg.interactive?.list_reply?.title || "";
  }
  if (msg.type === "button") return msg.button?.text || "";
  if (msg.image?.caption) return msg.image.caption;
  if (msg.video?.caption) return msg.video.caption;
  return "";
}

async function handleInbound(msg, contactName) {
  const from = msg.from;                 // מספר טלפון בפורמט בינ"ל, בלי +
  if (!from) return;
  if (alreadySeen(msg.id)) return;
  cloudState.lastInbound = new Date().toISOString();

  const isOwner = OWNER && from === OWNER;
  let text = extractText(msg);

  console.log(`[cloud] 📩 הודעה מ-${from} | owner:${!!isOwner} | סוג:${msg.type} | טקסט:"${(text || "").slice(0, 60)}"`);
  await markRead(msg.id);

  // הודעה לא-טקסטואלית (קול/תמונה/מסמך) — מבקשים בעדינות לכתוב.
  if (!text.trim()) {
    if (msg.type === "audio" || msg.type === "voice") {
      await graphSend(from, "שמעתי שהשארת הודעה קולית 🙏 אשמח אם תכתבי לי כאן בכמה מילים מה מביא אותך, ואוכל לעזור מיד.");
    }
    return;
  }

  if (isGloballyPaused()) { console.log("[cloud] מושהה גלובלית, מדלג"); return; }
  if (isPaused(from))     { console.log("[cloud] שיחה מושהית, מדלג:", from); return; }

  const out = await think(from, text.trim());

  await graphSend(from, out.reply);
  console.log("[cloud] ✅ נשלחה תשובה ל:", from);
  cloudState.handled++;
  countHandled();

  // כרטיס המידע לא נשלח כהודעה נפרדת — הקישור כבר בתוך התשובה.

  if (out.human) pause(from, 12);
  if (out.alert || out.human) flag(from, text.trim(), out.alert);

  // התראה אישית לקטי על מצוקה או בקשה לאדם.
  if ((out.alert || out.human) && OWNER) {
    const tag = out.alert ? "🔴 מצוקה — דורש התייחסות אישית" : "🟡 ביקשו לדבר איתך";
    const note = `${tag}\nמ: ${from}${contactName ? " (" + contactName + ")" : ""}\n\nכתבו: ${text.trim()}\n\nהסוכן ענה: ${out.reply}`;
    try { await graphSend(OWNER, note); }
    catch (e) { console.error("[cloud] כשל בשליחת התראה:", e.message); }
  }
}

// מחבר את נתיבי ה-webhook לאפליקציית Express.
export function mountCloud(app) {
  // אימות ה-webhook מול Meta (מתבצע פעם אחת בעת ההגדרה).
  app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("[cloud] webhook אומת בהצלחה");
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  });

  // קבלת אירועים (הודעות נכנסות, סטטוסים).
  app.post("/webhook", (req, res) => {
    // עונים 200 מיד כדי ש-Meta לא תשלח שוב; מעבדים אחר כך.
    res.sendStatus(200);
    try {
      const entry = req.body?.entry || [];
      for (const e of entry) {
        for (const change of (e.changes || [])) {
          const value = change.value || {};
          const contacts = value.contacts || [];
          const nameByWaid = {};
          for (const c of contacts) nameByWaid[c.wa_id] = c.profile?.name;
          for (const msg of (value.messages || [])) {
            handleInbound(msg, nameByWaid[msg.from]).catch(err =>
              console.error("[cloud] שגיאה בטיפול בהודעה:", err.message));
          }
        }
      }
    } catch (err) {
      console.error("[cloud] שגיאה בפענוח webhook:", err.message);
    }
  });

  console.log(`[cloud] Cloud API פעיל | מספר מוגדר:${!!PHONE_NUMBER_ID} | טוקן מוגדר:${!!TOKEN}`);
}
