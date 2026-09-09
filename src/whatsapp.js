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

async function handleMessage(m) {
  const jid = m.key?.remoteJid;
  if (!jid) return;

  if (m.key.fromMe) return;                    // הודעות שאת שלחת
  if (jid === "status@broadcast") return;      // סטטוסים
  if (jid.endsWith("@g.us")) return;           // קבוצות — הסוכן לא עונה בקבוצות
  if (jid.endsWith("@broadcast")) return;

  const isOwner = OWNER && jid.startsWith(OWNER);

  let text =
    m.message?.conversation ||
    m.message?.extendedTextMessage?.text ||
    "";

  // ===== הודעה קולית =====
  const audio = m.message?.audioMessage;
  if (!text.trim() && audio) {
    await sock.readMessages([m.key]);
    await sock.sendPresenceUpdate("composing", jid);

    const spoken = await transcribe(m, log);
    if (!spoken) {
      await sock.sendMessage(jid, {
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
    await sock.sendPresenceUpdate("composing", jid);

    const cmd = await handleCommand(text.trim(), sock);
    const reply = cmd !== null
      ? cmd
      : await thinkAsOwner(jid, text.trim(), OWNER_SYSTEM, ownerContext());

    await sock.sendPresenceUpdate("paused", jid);
    await sock.sendMessage(jid, { text: reply });
    return;
  }

  // ===== מכאן: פונה רגילה =====
  if (isGloballyPaused()) {
    console.log("[wa] הסוכן מושהה גלובלית, מדלג");
    return;
  }

  // אם קטי לקחה את השיחה ידנית, הסוכן שותק
  if (isPaused(jid)) {
    console.log("[wa] שיחה מושהית, מדלג:", jid);
    return;
  }

  await sock.readMessages([m.key]);
  await sock.sendPresenceUpdate("composing", jid);

  const out = await think(jid, text.trim());

  await new Promise(r => setTimeout(r, shortDelay(out.reply)));
  await sock.sendPresenceUpdate("paused", jid);

  await sock.sendMessage(jid, { text: out.reply });
  state.handled++;
  countHandled();

  if (out.infoCard) {
    await new Promise(r => setTimeout(r, 1200));
    await sock.sendMessage(jid, { text: INFO_CARD });
  }

  if (out.human) pause(jid, 12);

  // התראה לקטי על מצוקה או בקשה לאדם
  if (out.alert || out.human) {
    flag(jid.split("@")[0], text.trim(), out.alert);
  }

  if ((out.alert || out.human) && OWNER) {
    const tag = out.alert ? "🔴 מצוקה — דורש התייחסות אישית" : "🟡 ביקשו לדבר איתך";
    const from = jid.split("@")[0];
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
