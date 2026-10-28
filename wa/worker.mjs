// חיבור וואטסאפ דרך מכשיר מקושר (QR או קוד חיבור) — רץ כתהליך נפרד לצד השרת.
// כל הודעה נכנסת עוברת לליבה של CureBot (אותו מוח, זיכרון, לידים והתראות),
// והתשובה נשלחת חזרה. מצב החיבור, פרטי ההתחברות ואנשי הקשר נשמרים ב-Redis,
// כדי שעדכון גרסה או הפעלה מחדש לא ידרשו לסרוק שוב.
//
// הגנות: לא עונים לאנשי קשר שמורים, לקבוצות, לסטטוסים ולערוצים; לא עונים בכלל
// עד שרשימת אנשי הקשר סונכרנה; כשקטי עונה בעצמה — הבוט שותק בשיחה 12 שעות.

import baileys, { DisconnectReason, fetchLatestBaileysVersion, initAuthCreds, BufferJSON, proto } from "@whiskeysockets/baileys";
import { createClient } from "redis";
import pino from "pino";

const makeWASocket = baileys.default || baileys;
const PORT = process.env.PORT || "3000";
const SECRET = process.env.ADMIN_KEY || "";
const PREFIX = "wa:auth:";
const log = pino({ level: "warn" });

const r = createClient({ url: process.env.REDIS_URL });
r.on("error", (e) => console.error("[wa] redis:", e.message));
await r.connect();

// ---------- מצב (נקרא ע"י לוח הבקרה) ----------
const state = { status: "starting", qr: "", pairingCode: "", me: "", lastEvent: "", contacts: 0, updated: 0 };
async function setState(patch) {
  Object.assign(state, patch, { updated: Date.now() });
  await r.set("wa:state", JSON.stringify(state)).catch(() => {});
}

// ---------- פרטי התחברות ב-Redis ----------
async function useRedisAuthState() {
  const read = async (k) => { const v = await r.get(PREFIX + k); return v ? JSON.parse(v, BufferJSON.reviver) : null; };
  const write = (k, v) => r.set(PREFIX + k, JSON.stringify(v, BufferJSON.replacer));
  const creds = (await read("creds")) || initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const out = {};
          await Promise.all(ids.map(async (id) => {
            let v = await read(`${type}-${id}`);
            if (type === "app-state-sync-key" && v) v = proto.Message.AppStateSyncKeyData.fromObject(v);
            out[id] = v;
          }));
          return out;
        },
        set: async (data) => {
          for (const cat of Object.keys(data)) {
            for (const id of Object.keys(data[cat])) {
              const v = data[cat][id];
              if (v) await write(`${cat}-${id}`, v);
              else await r.del(PREFIX + `${cat}-${id}`);
            }
          }
        },
      },
    },
    saveCreds: () => write("creds", creds),
  };
}
async function clearAuth() {
  for await (const k of r.scanIterator({ MATCH: PREFIX + "*", COUNT: 200 })) await r.del(k);
}

// ---------- אנשי קשר שמורים (לא עונים להם) ----------
async function registerContacts(list) {
  if (!Array.isArray(list)) return;
  const ids = list.filter((c) => c?.id && c.name).map((c) => c.id);
  if (ids.length) {
    await r.sAdd("wa:contacts", ids);
    const n = await r.sCard("wa:contacts");
    await r.set("wa:contacts:synced", "1");
    if (n !== state.contacts) await setState({ contacts: n });
  }
}

// ---------- העברה לליבה ----------
async function toCore(body) {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/wa/incoming`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-wa-secret": SECRET },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`core HTTP ${res.status}`);
  return res.json();
}

const sentByBot = new Set(); // מזהי הודעות שהבוט שלח — כדי להבחין בין הבוט לבין קטי
const msgStore = new Map();
let sock = null;
let attempts = 0;

function extractText(m) {
  const c = m.message?.ephemeralMessage?.message || m.message?.viewOnceMessage?.message ||
    m.message?.viewOnceMessageV2?.message || m.message?.documentWithCaptionMessage?.message || m.message || {};
  const i = c.deviceSentMessage?.message || c;
  return (i.conversation || i.extendedTextMessage?.text || i.imageMessage?.caption || i.videoMessage?.caption ||
    i.buttonsResponseMessage?.selectedDisplayText || i.listResponseMessage?.title || "").trim();
}

async function handle(m) {
  const jid = m.key?.remoteJid || "";
  if (!jid || jid === "status@broadcast" || jid.endsWith("@g.us") || jid.endsWith("@broadcast") || jid.endsWith("@newsletter")) return;
  const senderPn = m.key?.senderPn || "";
  const replyJid = jid.endsWith("@lid") && senderPn ? senderPn : jid;
  const phone = (senderPn || (jid.endsWith("@s.whatsapp.net") ? jid : "")).split("@")[0].replace(/\D/g, "");
  const userId = phone || replyJid.split("@")[0];

  // קטי ענתה בעצמה מהטלפון — הבוט שותק בשיחה הזו 12 שעות
  if (m.key.fromMe) {
    if (!sentByBot.has(m.key.id) && extractText(m)) await toCore({ type: "owner-reply", userId }).catch(() => {});
    return;
  }

  if (await r.sIsMember("wa:contacts", jid) || (replyJid !== jid && await r.sIsMember("wa:contacts", replyJid))) return;
  if (!(await r.get("wa:contacts:synced"))) { console.log("[wa] אנשי הקשר עוד לא סונכרנו — לא עונים בינתיים"); return; }

  const text = extractText(m);
  const isAudio = !!(m.message?.audioMessage);
  if (!text && !isAudio) return;

  await sock.readMessages([m.key]).catch(() => {});
  await sock.sendPresenceUpdate("composing", replyJid).catch(() => {});
  const out = await toCore({
    type: "message", userId, name: m.pushName || "", messageId: m.key.id,
    text: text || "", audio: isAudio,
  });
  for (const reply of out.replies || []) {
    await new Promise((res) => setTimeout(res, Math.min(4000, 900 + reply.length * 25)));
    const sent = await sock.sendMessage(replyJid, { text: reply });
    if (sent?.key?.id) sentByBot.add(sent.key.id);
  }
  await sock.sendPresenceUpdate("paused", replyJid).catch(() => {});
  if (sentByBot.size > 500) sentByBot.clear();
  console.log(`[wa] ענה לפונה ${userId.slice(0, 5)}… (${(out.replies || []).length} הודעות)`);
}

async function start() {
  if (sock) { try { sock.ev.removeAllListeners(); sock.end?.(undefined); } catch {} sock = null; }
  const { state: auth, saveCreds } = await useRedisAuthState();
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  sock = makeWASocket({
    version, auth, logger: log, printQRInTerminal: false, markOnlineOnConnect: false, syncFullHistory: false,
    getMessage: async (key) => (key?.id && msgStore.get(key.id)) || undefined,
  });
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("contacts.upsert", registerContacts);
  sock.ev.on("contacts.update", registerContacts);
  sock.ev.on("messaging-history.set", ({ contacts }) => registerContacts(contacts));

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      if (state.status !== "qr") console.log("[wa] פועל — ממתין לחיבור (QR או קוד חיבור)");
      await setState({ status: "qr", qr, lastEvent: "ממתין לחיבור — סריקת QR או קוד חיבור" });
    }
    if (connection === "open") {
      attempts = 0;
      await setState({ status: "connected", qr: "", pairingCode: "", me: (sock.user?.id || "").split(":")[0], lastEvent: "מחובר ועונה" });
      console.log("[wa] מחובר");
      // אם וואטסאפ לא שולחת רשימת אנשי קשר תוך 3 דקות — מסמנים כמסונכרן כדי לא לחסום לעד
      setTimeout(async () => { if (!(await r.get("wa:contacts:synced"))) await r.set("wa:contacts:synced", "1"); }, 180000);
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        await clearAuth(); await r.del("wa:contacts:synced");
        await setState({ status: "disconnected", me: "", lastEvent: "המכשיר נותק מוואטסאפ — מחברים מחדש" });
        setTimeout(() => start().catch((e) => console.error("[wa]", e.message)), 3000);
        return;
      }
      if (code === DisconnectReason.connectionReplaced) {
        console.log("[wa] חיבור אחר תפס את המקום (עדכון גרסה) — התהליך הזה נעצר");
        process.exit(0);
      }
      attempts++;
      await setState({ status: "reconnecting", lastEvent: `החיבור נפל (${code || "?"}) — מתחבר מחדש` });
      setTimeout(() => start().catch((e) => console.error("[wa]", e.message)), Math.min(30000, 2000 * attempts));
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const m of messages) {
      if (m?.key?.id && m.message) { msgStore.set(m.key.id, m.message); if (msgStore.size > 1000) msgStore.delete(msgStore.keys().next().value); }
      try { await handle(m); } catch (e) { console.error("[wa] שגיאה בטיפול בהודעה:", e.message); }
    }
  });
}

// ---------- פקודות מלוח הבקרה ----------
setInterval(async () => {
  const raw = await r.getDel("wa:cmd").catch(() => null);
  if (!raw) return;
  const cmd = JSON.parse(raw);
  try {
    if (cmd.action === "pair" && sock && !sock.authState.creds.registered) {
      const code = await sock.requestPairingCode(String(cmd.phone).replace(/\D/g, ""));
      await setState({ pairingCode: code, lastEvent: "קוד חיבור נוצר — מקלידים אותו בוואטסאפ" });
    } else if (cmd.action === "logout") {
      await sock?.logout().catch(() => {});
      await clearAuth(); await r.del("wa:contacts:synced");
      await setState({ status: "disconnected", me: "", qr: "", pairingCode: "", lastEvent: "נותק לבקשתך" });
      setTimeout(() => start().catch(() => {}), 2000);
    }
  } catch (e) {
    await setState({ lastEvent: "פעולה נכשלה: " + e.message });
  }
}, 2000);

console.log("[wa] תהליך הוואטסאפ עלה");
await setState({ status: "starting", lastEvent: "מתחבר…" });
await start();
