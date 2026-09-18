import baileys, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";

// Baileys 6.7.x ships as CommonJS; under ESM its default export can arrive
// wrapped as { default: fn } instead of the function itself. Normalize so
// makeWASocket is always callable.
const makeWASocket = baileys.default || baileys;
import { Boom } from "@hapi/boom";
import pino from "pino";
import QRCode from "qrcode";
import path from "path";
import { think, thinkAsOwner, isPaused, pause, isGloballyPaused, countHandled, flag } from "./brain.js";
import { INFO_CARD } from "./prompt.js";
import { transcribe } from "./transcribe.js";
import { handleCommand, ownerContext, OWNER_SYSTEM } from "./owner.js";

const AUTH_DIR = process.env.AUTH_DIR || path.join(process.cwd(), "data", "auth");
const OWNER = (process.env.OWNER_NUMBER || "").replace(/\D/g, ""); // לדוגמה 972543032349

export const state = {
  status: "starting",   // starting | qr | connected | disconnected
  qrDataUrl: null,
  me: null,
  lastEvent: null,
  handled: 0
};

let sock = null;
let reconnectAttempts = 0;
let selfTestSent = false;   // שולחים הודעת בדיקה פעם אחת בלבד לכל הרצה

// מספר לבדיקת מסירה: הבוט שולח אליו הודעת "אני חי" ברגע שמתחבר.
// מוגדר ע"י SELFTEST_TO=9725XXXXXXXX (בלי +). ריק = כבוי.
const SELFTEST_TO = (process.env.SELFTEST_TO || "").replace(/\D/g, "");

// אנשי קשר שמורים בטלפון (יש להם שם שמור באנשי הקשר). לפי בקשת קטי,
// הבוט עונה רק למי שלא שמור (לידים/אנשים חדשים) ולא לאנשי הקשר המוכרים.
const savedContacts = new Set();
// ברירת מחדל: עונים רק למי שלא שמור באנשי הקשר (לידים חדשים).
// אפשר לכבות ע"י ONLY_NON_CONTACTS=false.
const ONLY_NON_CONTACTS = (process.env.ONLY_NON_CONTACTS || "true") !== "false";

// רשימת חסימה: מספרים שהבוט לעולם לא עונה להם — סוכני אוטומציה/בוטים אחרים
// (למשל Base44) ששולחים דוחות סטטוס, ולא לידים. מוגדר ב-BLOCKLIST, מופרד בפסיקים.
const BLOCKLIST = new Set(
  (process.env.BLOCKLIST || "").split(",").map(s => s.replace(/\D/g, "")).filter(Boolean)
);

// רשימת היתר: מספרים שהבוט תמיד עונה להם — גם אם הם שמורים באנשי הקשר.
// שימושי לבדיקות (למשל המספר האישי השני של קטי). מוגדר ב-ALLOWLIST.
const ALLOWLIST = new Set(
  (process.env.ALLOWLIST || "").split(",").map(s => s.replace(/\D/g, "")).filter(Boolean)
);

function registerContacts(contacts) {
  if (!Array.isArray(contacts)) return;
  for (const c of contacts) {
    // רק איש קשר עם שם שמור בפנקס הכתובות ("name"). לליד לא מוכר יש רק "notify".
    if (c?.id && c.name) savedContacts.add(c.id);
  }
}

const log = pino({ level: "warn" });

function shortDelay(text) {
  // השהיה קצרה שתלויה באורך התשובה — כדי שזה לא יקפוץ ברגע
  return Math.min(4000, 900 + text.length * 25);
}

export async function start() {
  const { state: auth, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth,
    logger: log,
    printQRInTerminal: false,
    markOnlineOnConnect: false,   // כדי שלא ייראה שאת מחוברת כל הזמן
    syncFullHistory: false
  });

  sock.ev.on("creds.update", saveCreds);

  // בניית רשימת אנשי הקשר השמורים מהסנכרון של וואטסאפ.
  sock.ev.on("contacts.set", ({ contacts }) => registerContacts(contacts));
  sock.ev.on("contacts.upsert", (contacts) => registerContacts(contacts));
  sock.ev.on("contacts.update", (contacts) => registerContacts(contacts));
  sock.ev.on("messaging-history.set", ({ contacts }) => registerContacts(contacts));

  sock.ev.on("connection.update", async (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      state.status = "qr";
      state.qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, width: 320 });
      state.lastEvent = "קוד QR חדש נוצר — יש לסרוק";
      console.log("[wa] QR מוכן. פתחי את הדף הראשי כדי לסרוק.");
    }

    if (connection === "open") {
      state.status = "connected";
      state.qrDataUrl = null;
      state.me = sock.user?.id?.split(":")[0] || null;
      state.lastEvent = "מחובר";
      reconnectAttempts = 0;
      console.log("[wa] מחובר כ-", state.me);

      // בדיקת מסירה חד-פעמית: שולח הודעה אמיתית למספר SELFTEST_TO כדי
      // להוכיח שהבוט מסוגל לשלוח ושהודעות מגיעות בפועל.
      if (SELFTEST_TO && !selfTestSent) {
        selfTestSent = true;
        const to = `${SELFTEST_TO}@s.whatsapp.net`;
        const msg =
          "🌿 CureBot מחובר ופעיל!\n" +
          "זו הודעת בדיקה אוטומטית מהסוכן של קטי שגב — אם קיבלת אותה, המסירה עובדת. 💛\n" +
          `(${new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })})`;
        setTimeout(async () => {
          try {
            await sock.sendMessage(to, { text: msg });
            console.log("[wa] ✅ הודעת בדיקה נשלחה ל-", SELFTEST_TO);
          } catch (e) {
            console.error("[wa] ❌ הודעת בדיקה נכשלה:", e.message);
          }
        }, 4000);
      }
    }

    if (connection === "close") {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      state.status = "disconnected";
      state.lastEvent = loggedOut
        ? "המכשיר נותק מוואטסאפ — צריך לסרוק QR מחדש"
        : `החיבור נפל (קוד ${code}) — מתחבר מחדש`;
      console.log("[wa]", state.lastEvent);

      if (loggedOut) {
        // אין טעם לנסות שוב עם אותם פרטי התחברות
        return;
      }
      reconnectAttempts++;
      const wait = Math.min(30000, 2000 * reconnectAttempts);
      setTimeout(() => start().catch(e => console.error("[wa] כשל בחיבור מחדש:", e.message)), wait);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const m of messages) {
      try {
        await handleMessage(m);
      } catch (e) {
        console.error("[wa] שגיאה בטיפול בהודעה:", e.message);
      }
    }
  });

  return sock;
}

// שולח הודעה בצורה עמידה: קודם לכתובת הטלפון האמיתית (senderPn), ואם נכשל —
// מנסה שוב לכתובת המקורית. כך תשובה מגיעה גם כשהפונה מזוהה כ-@lid.
async function safeSend(primaryJid, altJid, payload) {
  const targets = [...new Set([primaryJid, altJid].filter(Boolean))];
  let lastErr = null;
  for (const t of targets) {
    try {
      await sock.sendMessage(t, payload);
      return t;
    } catch (e) {
      lastErr = e;
      console.error(`[wa] שליחה ל-${t} נכשלה: ${e.message}`);
    }
  }
  throw lastErr || new Error("send failed");
}

async function handleMessage(m) {
  const jid = m.key?.remoteJid;
  if (!jid) return;

  if (m.key.fromMe) return;                    // הודעות שאת שלחת
  if (jid === "status@broadcast") return;      // סטטוסים
  if (jid.endsWith("@g.us")) return;           // קבוצות — הסוכן לא עונה בקבוצות
  if (jid.endsWith("@broadcast")) return;
  if (jid.endsWith("@newsletter")) return;     // ערוצי וואטסאפ (Channels) — לא לטפל בהם כלל

  // וואטסאפ עברה לכתובות מסוג @lid (מזהה פרטיות) במקום מספר טלפון.
  // כתובת הטלפון האמיתית מגיעה ב-senderPn. שולחים ומזהים לפיה — אחרת
  // התשובה נשלחת ל-@lid ולא תמיד מגיעה, וזיהוי הבעלים/אנשי הקשר נכשל.
  const senderPn = m.key?.senderPn || null;          // 972...@s.whatsapp.net
  const replyJid = jid.endsWith("@lid") && senderPn ? senderPn : jid;
  // מזהה טלפון לזיהוי הבעלים ולסינון אנשי קשר — רק מכתובת טלפון אמיתית.
  const pnSource = senderPn || (jid.endsWith("@s.whatsapp.net") ? jid : "");
  const phoneDigits = pnSource ? pnSource.split("@")[0].replace(/\D/g, "") : "";
  const isOwner = OWNER && phoneDigits === OWNER;

  // חלק מההודעות עטופות (הודעות נעלמות/ephemeral, view-once, מסמך עם כיתוב).
  // מחלצים את התוכן הפנימי, אחרת הטקסט מגיע ריק והבוט מדלג על ההודעה.
  const content =
    m.message?.ephemeralMessage?.message ||
    m.message?.viewOnceMessage?.message ||
    m.message?.viewOnceMessageV2?.message ||
    m.message?.viewOnceMessageV2Extension?.message ||
    m.message?.documentWithCaptionMessage?.message ||
    m.message || {};

  let text =
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    "";

  // ===== הודעה קולית =====
  const audio = content.audioMessage;

  // רישום אבחון: כל הודעה פרטית שנכנסת (לא קבוצה/ערוץ)
  console.log(`[wa] 📩 DM מ-${jid} | pn:${phoneDigits || "-"} | owner:${!!isOwner} | audio:${!!audio} | טקסט:"${(text || "").slice(0, 60)}"`);
  if (!text.trim() && audio) {
    await sock.readMessages([m.key]);
    await sock.sendPresenceUpdate("composing", replyJid);

    const spoken = await transcribe(m, log);
    if (!spoken) {
      await safeSend(replyJid, jid, {
        text: isOwner
          ? "לא הצלחתי לתמלל את ההקלטה. תנסי שוב, או תכתבי לי."
          : "לא הצלחתי לשמוע את ההקלטה 🙏 אפשר לכתוב לי במקום?"
      });
      return;
    }
    text = spoken;
    console.log(`[wa] קולי מ-${jid}: ${text.slice(0, 60)}`);
  }

  if (!text.trim()) return;                    // תמונה, סטיקר, מסמך — לא מטופל

  // ===== מצב בעלים: קטי מדברת עם הסוכן =====
  if (isOwner) {
    await sock.readMessages([m.key]);
    await sock.sendPresenceUpdate("composing", replyJid);

    const cmd = await handleCommand(text.trim(), sock);
    const reply = cmd !== null
      ? cmd
      : await thinkAsOwner(jid, text.trim(), OWNER_SYSTEM, ownerContext());

    await sock.sendPresenceUpdate("paused", replyJid);
    await safeSend(replyJid, jid, { text: reply });
    return;
  }

  // ===== מכאן: פונה רגילה =====
  // רשימת חסימה: לא עונים לסוכני אוטומציה/בוטים אחרים (Base44 וכו').
  if (phoneDigits && BLOCKLIST.has(phoneDigits)) {
    console.log("[wa] מספר חסום (אוטומציה) — מדלג:", phoneDigits);
    return;
  }

  // עונים רק למי שלא שמור באנשי הקשר (ליד/אדם חדש). איש קשר מוכר — מדלגים,
  // אלא אם המספר ברשימת ההיתר (ALLOWLIST) — אז עונים תמיד (למשל לבדיקות).
  const allowed = phoneDigits && ALLOWLIST.has(phoneDigits);
  if (!allowed && ONLY_NON_CONTACTS && (savedContacts.has(jid) || (replyJid !== jid && savedContacts.has(replyJid)))) {
    console.log("[wa] איש קשר שמור — מדלג:", jid);
    return;
  }

  if (isGloballyPaused()) {
    console.log("[wa] הסוכן מושהה גלובלית, מדלג");
    return;
  }

  // מפתח שיחה יציב לזיכרון וההשהיות: כתובת הטלפון אם קיימת, אחרת ה-jid.
  const convKey = replyJid;

  // אם קטי לקחה את השיחה ידנית, הסוכן שותק
  if (isPaused(convKey)) {
    console.log("[wa] שיחה מושהית, מדלג:", convKey);
    return;
  }

  await sock.readMessages([m.key]);
  await sock.sendPresenceUpdate("composing", replyJid);

  const out = await think(convKey, text.trim());

  await new Promise(r => setTimeout(r, shortDelay(out.reply)));
  await sock.sendPresenceUpdate("paused", replyJid);

  const sentTo = await safeSend(replyJid, jid, { text: out.reply });
  console.log("[wa] ✅ נשלחה תשובה ל:", sentTo);
  state.handled++;
  countHandled();

  // כרטיס המידע כבר לא נשלח כהודעה נפרדת — התשובה עצמה כוללת את הקישור,
  // כדי שלא תישלח "אותה הודעה פעמיים".

  if (out.human) pause(convKey, 12);

  // התראה לקטי על מצוקה או בקשה לאדם
  if (out.alert || out.human) {
    flag(phoneDigits || jid.split("@")[0], text.trim(), out.alert);
  }

  if ((out.alert || out.human) && OWNER) {
    const tag = out.alert ? "🔴 מצוקה — דורש התייחסות אישית" : "🟡 ביקשו לדבר איתך";
    const from = phoneDigits || jid.split("@")[0];
    const note =
      `${tag}\n` +
      `מ: ${from}\n\n` +
      `כתבו: ${text.trim()}\n\n` +
      `הסוכן ענה: ${out.reply}`;
    try {
      await sock.sendMessage(`${OWNER}@s.whatsapp.net`, { text: note });
    } catch (e) {
      console.error("[wa] כשל בשליחת התראה:", e.message);
    }
  }
}

export async function logout() {
  if (sock) await sock.logout();
}
