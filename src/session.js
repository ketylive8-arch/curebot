// ============================================================
//  חיבור וואטסאפ אחד (QR, כמו וואטסאפ-ווב) — מופע נפרד לכל משתמש/ת במערכת.
//  כל חיבור מחזיק: סוקט משלו, פרטי התחברות בתיקייה משלו בדיסק הקבוע,
//  ו"מוח" משלו (זיכרון שיחות, השהיות, לידים). שני חיבורים לא מתערבבים לעולם.
// ============================================================
import baileys, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, generateMessageIDV2 } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import QRCode from "qrcode";
import fs from "fs";
import { createBrain } from "./brain.js";
import { transcribe } from "./transcribe.js";
import { handleCommand, ownerContext, OWNER_SYSTEM, localManageReply } from "./owner.js";
import { getTenant, authDirOf } from "./tenants.js";

// Baileys 6.7.x הוא CommonJS; תחת ESM ה-default עלול להגיע עטוף.
const makeWASocket = baileys.default || baileys;
// חייב להיות ייבוא בשם: תחת ESM הפונקציה לא קיימת על ה-default (זה מה ששבר את כל השליחות).
const genId = generateMessageIDV2;
if (typeof genId !== "function") throw new Error("generateMessageIDV2 missing from Baileys");
const log = pino({ level: "warn" });

// רשימות כלליות מהגדרות השרת (מופרדות בפסיקים): חסימה = בוטים/אוטומציות שלא עונים להם,
// היתר = מספרים שעונים להם תמיד (גם אם שמורים באנשי הקשר) — שימושי לבדיקות.
const digitsSet = (v) => new Set(String(v || "").split(",").map(s => s.replace(/\D/g, "")).filter(Boolean));
const BLOCKLIST = digitsSet(process.env.BLOCKLIST);
const ALLOWLIST = digitsSet(process.env.ALLOWLIST);

const shortDelay = (text) => Math.min(4000, 900 + text.length * 25);

// מאיפה הגיעה הפנייה: מודעה בפייסבוק/אינסטגרם (וואטסאפ מצרף להודעה את פרטי המודעה),
// קישור וואטסאפ (wa.me — מהאתר/לינקטרי), הטקסט המוכן של כפתורי האתר, או פנייה ישירה.
const SITE_PREFILL = /היי קטי! אשמח|ketysegev/;
export function leadSource(inner, text) {
  const ci = inner?.extendedTextMessage?.contextInfo || inner?.imageMessage?.contextInfo ||
    inner?.videoMessage?.contextInfo || inner?.messageContextInfo || {};
  const ad = ci.externalAdReply;
  const conv = String(ci.conversionSource || ci.entryPointConversionSource || "").toLowerCase();
  if (ad || /\bad\b|ctwa|fb_ads|ads/.test(conv)) {
    const blob = `${ad?.sourceUrl || ""} ${ad?.sourceType || ""} ${conv}`.toLowerCase();
    const where = /instagram|\big\b/.test(blob) ? "אינסטגרם" : /facebook|\bfb\b/.test(blob) ? "פייסבוק" : "פייסבוק/אינסטגרם";
    return { kind: "ad", label: `מודעה ב${where}${ad?.title ? ` · "${String(ad.title).slice(0, 40)}"` : ""}` };
  }
  if (SITE_PREFILL.test(text || "")) return { kind: "site", label: "כפתור באתר" };
  if (/click_to_chat|wa\.me|whatsapp_link|link/.test(conv)) return { kind: "link", label: "קישור וואטסאפ (אתר / לינקטרי / ביו)" };
  return { kind: "direct", label: "פנייה ישירה" };
}

export class WaSession {
  constructor(tenantId) {
    this.id = tenantId;
    this.brain = createBrain(() => getTenant(this.id)?.profile || null);
    this.sock = null;
    this.reconnectAttempts = 0;
    this.stopped = false;
    this.state = { status: "starting", qrDataUrl: null, me: null, lastEvent: "מתחיל…", handled: 0 };
    this.savedContacts = new Set();
    this.msgStore = new Map();   // לבקשות retry של וואטסאפ
    this.sentIds = new Set();    // הודעות שהבוט עצמו שלח — כדי לזהות כשקטי עונה ידנית
    this.lastReadable = new Map(); // jid → מתי הגיעה הודעה שפוענחה (להודעות שלא פוענחו)
    this.nudged = new Map();       // jid → מתי ענינו לתמונה בלי מילים (פעם בשעה לכל היותר)
    this.leads = new Map();        // פניות אחרונות: מי, מאיפה, מה קרה — בזיכרון בלבד, 48 שעות
  }

  get tenant() { return getTenant(this.id); }

  remember(m) {
    if (m?.key?.id && m.message) {
      this.msgStore.set(m.key.id, m.message);
      if (this.msgStore.size > 1000) this.msgStore.delete(this.msgStore.keys().next().value);
    }
  }
  markSent(id) {
    if (!id) return;
    this.sentIds.add(id);
    if (this.sentIds.size > 2000) this.sentIds.delete(this.sentIds.values().next().value);
  }
  /** שליחה עם מזהה שאנחנו יוצרים מראש — כך ההד של ההודעה לא ייחשב כ"תשובה ידנית" */
  async send(to, payload) {
    const messageId = genId(this.sock.user?.id);
    this.markSent(messageId);
    await this.sock.sendMessage(to, payload, { messageId });
  }
  registerContacts(contacts) {
    if (!Array.isArray(contacts)) return;
    for (const c of contacts) if (c?.id && c.name) this.savedContacts.add(c.id);
  }

  closeSocket() {
    if (!this.sock) return;
    try { this.sock.ev.removeAllListeners(); } catch { /* ignore */ }
    try { this.sock.ws?.close?.(); } catch { /* ignore */ }
    try { this.sock.end?.(undefined); } catch { /* ignore */ }
    this.sock = null;
  }

  async start() {
    this.stopped = false;
    this.closeSocket();
    const dir = authDirOf(this.id);
    fs.mkdirSync(dir, { recursive: true });
    const { state: auth, saveCreds } = await useMultiFileAuthState(dir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version, auth, logger: log, printQRInTerminal: false,
      markOnlineOnConnect: false, syncFullHistory: false,
      getMessage: async (key) => (key?.id && this.msgStore.get(key.id)) || undefined
    });
    this.sock = sock;

    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("contacts.set", ({ contacts }) => this.registerContacts(contacts));
    sock.ev.on("contacts.upsert", (c) => this.registerContacts(c));
    sock.ev.on("contacts.update", (c) => this.registerContacts(c));
    sock.ev.on("messaging-history.set", ({ contacts }) => this.registerContacts(contacts));

    sock.ev.on("connection.update", async (u) => {
      if (sock !== this.sock) return; // אירוע מסוקט ישן
      const { connection, lastDisconnect, qr } = u;
      if (qr) {
        this.state.status = "qr";
        this.state.qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, width: 360, color: { dark: "#1D1D1F", light: "#FFFFFF" } });
        this.state.lastEvent = "ממתין לסריקה";
      }
      if (connection === "open") {
        this.state.status = "connected";
        this.state.qrDataUrl = null;
        this.state.pairingCode = null;
        this.state.me = sock.user?.id?.split(":")[0] || null;
        this.state.lastEvent = "מחובר ועונה";
        this.reconnectAttempts = 0;
        console.log(`[${this.id}] מחובר כ-${this.state.me}`);
        // בדיקת שליחה אמיתית (רק כשמוגדר SELFTEST_TO): הודעה אחת לצ'אט "אני" של החיבור הראשי,
        // פעם אחת להפעלה — מוכיחה בשטח שהשליחה עובדת, בלי לפנות לאף אדם אחר.
        const selfTo = String(process.env.SELFTEST_TO || "").replace(/\D/g, "");
        if (selfTo && !this.selfTested && this.tenant?.adminOwned && selfTo === this.state.me) {
          this.selfTested = true;
          setTimeout(async () => {
            try {
              await this.send(`${selfTo}@s.whatsapp.net`, { text: "✅ בדיקה: הבוט מחובר ויודע לשלוח. (הודעה אוטומטית חד-פעמית — אפשר למחוק)" });
              console.log(`[${this.id}] ✅ בדיקת שליחה הצליחה`);
            } catch (e) { console.error(`[${this.id}] ❌ בדיקת שליחה נכשלה:`, e.message); }
          }, 5000);
        }
      }
      if (connection === "close") {
        const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        this.state.status = "disconnected";
        this.state.me = loggedOut ? null : this.state.me;
        this.state.lastEvent = loggedOut ? "המכשיר נותק מוואטסאפ — יוצר קוד QR חדש" : "החיבור נפל לרגע — מתחבר מחדש";
        console.log(`[${this.id}] ${this.state.lastEvent} (קוד ${code})`);
        if (this.stopped) return;
        if (loggedOut) {
          // פרטי ההתחברות כבר לא תקפים — מוחקים ומתחילים חיבור חדש (QR חדש), אוטומטית.
          try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
          setTimeout(() => this.start().catch(e => console.error(`[${this.id}]`, e.message)), 1500);
          return;
        }
        this.reconnectAttempts++;
        const wait = Math.min(30000, 2000 * this.reconnectAttempts);
        setTimeout(() => this.start().catch(e => console.error(`[${this.id}]`, e.message)), wait);
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      for (const m of messages) {
        this.remember(m);
        try {
          if (m.key?.fromMe) { if (type === "notify" && this.isFresh(m)) this.noteManualReply(m); continue; }
          if (type === "notify") await this.handleMessage(m);
        } catch (e) {
          console.error(`[${this.id}] שגיאה בטיפול בהודעה:`, e.message);
        }
      }
    });
    return sock;
  }

  /** מעדכן את "פניות אחרונות" (בזיכרון בלבד). status: answered | unreadable | skipped | waiting */
  trackLead(key, phone, patch) {
    const now = Date.now();
    for (const [k, v] of this.leads) if (now - v.lastAt > 48 * 3600 * 1000) this.leads.delete(k);
    const l = this.leads.get(key) || { from: phone, firstAt: now, count: 0, source: null };
    Object.assign(l, patch, { lastAt: now });
    if (patch.count) l.count = (this.leads.get(key)?.count || 0) + 1;
    if (patch.source && (!l.source || patch.source.kind === "ad")) l.source = patch.source;
    this.leads.set(key, l);
    if (this.leads.size > 100) this.leads.delete(this.leads.keys().next().value);
  }

  /** הודעה "טרייה" (מהדקות האחרונות) — לא היסטוריה שמסונכרנת אחרי חיבור. */
  isFresh(m, maxSec = 180) {
    const ts = Number(m.messageTimestamp?.low ?? m.messageTimestamp ?? 0);
    return ts > 0 && Date.now() / 1000 - ts < maxSec;
  }

  /** קטי/המשתמש ענו בעצמם בשיחה? הבוט יוצא מהשיחה הזו ל-12 שעות. */
  noteManualReply(m) {
    const jid = m.key?.remoteJid || "";
    if (!jid || jid.endsWith("@g.us") || jid.includes("broadcast") || jid.endsWith("@newsletter")) return;
    if (this.sentIds.has(m.key.id)) return;          // זו הודעה שהבוט שלח
    if (this.state.me && jid.startsWith(this.state.me)) return; // צ'אט עם עצמי
    this.brain.pause(jid, 12);
  }

  async stop() {
    this.stopped = true;
    this.closeSocket();
    this.state.status = "stopped";
    this.state.lastEvent = "החיבור נעצר";
  }

  /**
   * חיבור בלי סריקה — מהטלפון לבד: וואטסאפ נותן "קישור באמצעות מספר טלפון",
   * ושם מקלידים את הקוד בן 8 התווים שאנחנו מבקשים כאן עבור המספר.
   */
  async pairingCode(phone) {
    let d = String(phone || "").replace(/\D/g, "");
    if (!d) throw new Error("צריך להזין את מספר הוואטסאפ שרוצים לחבר");
    d = d.startsWith("972") ? d : "972" + d.replace(/^0/, "");
    if (!/^972\d{8,9}$/.test(d)) throw new Error("מספר הטלפון לא נראה תקין");
    if (this.state.status === "connected") throw new Error("החיבור הזה כבר מחובר");
    if (this.state.status !== "qr" || !this.sock) throw new Error("החיבור עוד מתכונן — נסי שוב בעוד כמה שניות");
    const raw = await this.sock.requestPairingCode(d);
    const code = String(raw).replace(/[^A-Z0-9]/gi, "").toUpperCase();
    this.state.pairingCode = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
    this.state.lastEvent = "ממתין להקלדת הקוד בטלפון";
    return this.state.pairingCode;
  }

  /** ניתוק מוואטסאפ + מחיקת פרטי ההתחברות → QR חדש לסריקה */
  async disconnect() {
    try { await this.sock?.logout(); } catch { /* ignore */ }
    this.closeSocket();
    try { fs.rmSync(authDirOf(this.id), { recursive: true, force: true }); } catch { /* ignore */ }
    this.state = { ...this.state, status: "starting", qrDataUrl: null, pairingCode: null, me: null, lastEvent: "יוצר קוד QR חדש…" };
    await this.start();
  }

  async safeSend(primaryJid, altJid, payload) {
    let lastErr = null;
    for (const t of [...new Set([primaryJid, altJid].filter(Boolean))]) {
      try { await this.send(t, payload); return t; }
      catch (e) { lastErr = e; console.error(`[${this.id}] שליחה ל-${t} נכשלה: ${e.message}`); }
    }
    throw lastErr || new Error("send failed");
  }

  async handleMessage(m) {
    const sock = this.sock;
    const tenant = this.tenant;
    if (!sock || !tenant) return;
    const jid = m.key?.remoteJid;
    if (!jid || jid === "status@broadcast" || jid.endsWith("@g.us") || jid.endsWith("@broadcast") || jid.endsWith("@newsletter")) return;

    // וואטסאפ עברה לכתובות @lid; כתובת הטלפון האמיתית מגיעה ב-senderPn.
    const senderPn = m.key?.senderPn || null;
    const replyJid = jid.endsWith("@lid") && senderPn ? senderPn : jid;
    const pnSource = senderPn || (jid.endsWith("@s.whatsapp.net") ? jid : "");
    const phoneDigits = pnSource ? pnSource.split("@")[0].replace(/\D/g, "") : "";
    const owner = tenant.ownerNumber || "";
    const isOwner = owner && phoneDigits === owner;

    const last3 = (phoneDigits || "").slice(-3) || "?";

    // הודעה שהבוט לא הצליח לפענח (ההודעה עצמה הגיעה לטלפון כרגיל — רק העותק של הבוט נעול).
    // וואטסאפ מבקשת שליחה חוזרת לבד. לא כותבים לפונה כלום (זה מבלבל אנשים) —
    // אם תוך 20 שניות לא הגיעה גרסה קריאה, מסמנים לבעל/ת החיבור להציץ בוואטסאפ.
    if (!m.message && m.messageStubType) {
      const why = String(m.messageStubParameters?.[0] || "").replace(/[0-9]{6,}/g, "…").slice(0, 60);
      console.log(`[${this.id}] ⚠️ הודעה שלא פוענחה מ…${last3} (סוג ${m.messageStubType}${why ? ` · ${why}` : ""})`);
      if (!isOwner && this.isFresh(m, 600)) {
        const at = Date.now();
        setTimeout(() => {
          if ((this.lastReadable.get(replyJid) || 0) >= at || (this.lastReadable.get(jid) || 0) >= at) return;
          this.trackLead(replyJid, phoneDigits || jid.split("@")[0], { status: "unreadable" });
          this.brain.flag(phoneDigits || jid.split("@")[0], "הבוט לא הצליח לקרוא הודעה — כדאי להציץ בשיחה בוואטסאפ", false, "unreadable");
        }, Number(process.env.NUDGE_MS || 20000));
      }
      return;
    }

    const content =
      m.message?.ephemeralMessage?.message || m.message?.viewOnceMessage?.message ||
      m.message?.viewOnceMessageV2?.message || m.message?.viewOnceMessageV2Extension?.message ||
      m.message?.documentWithCaptionMessage?.message || m.message || {};
    const inner = content.deviceSentMessage?.message || content;
    let text =
      inner.conversation || inner.extendedTextMessage?.text || inner.imageMessage?.caption ||
      inner.videoMessage?.caption || inner.buttonsResponseMessage?.selectedDisplayText ||
      inner.templateButtonReplyMessage?.selectedId || inner.listResponseMessage?.title ||
      inner.ephemeralMessage?.message?.extendedTextMessage?.text || inner.ephemeralMessage?.message?.conversation ||
      inner.editedMessage?.message?.conversation || inner.editedMessage?.message?.extendedTextMessage?.text ||
      inner.protocolMessage?.editedMessage?.conversation || inner.protocolMessage?.editedMessage?.extendedTextMessage?.text || "";

    const audio = inner.audioMessage || content.audioMessage;
    // פרטיות: בלוג לא נרשם תוכן ההודעה ולא המספר המלא — רק 3 ספרות אחרונות ואורך.
    const kinds = Object.keys(inner || {}).filter(k => k !== "messageContextInfo").join(",") || "ריק";
    console.log(`[${this.id}] 📩 פנייה …${last3} | owner:${!!isOwner} | audio:${!!audio} | ${(text || "").length} תווים | סוג:${kinds}`);
    if (text.trim() || audio) { this.lastReadable.set(jid, Date.now()); this.lastReadable.set(replyJid, Date.now()); }
    if (!isOwner && (text.trim() || audio || inner.imageMessage || inner.videoMessage || inner.documentMessage)) {
      const source = leadSource(inner, text);
      const isNew = !this.leads.has(replyJid);
      this.trackLead(replyJid, phoneDigits || jid.split("@")[0], { source, preview: isNew ? (text || "").slice(0, 90) : undefined, status: "waiting", count: 1 });
      if (isNew) console.log(`[${this.id}] מקור הפנייה מ…${last3}: ${source.label}`);
    }

    if (!text.trim() && audio) {
      await sock.readMessages([m.key]);
      await sock.sendPresenceUpdate("composing", replyJid);
      const spoken = await transcribe(m, log);
      if (!spoken) {
        await this.safeSend(replyJid, jid, { text: isOwner ? "לא הצלחתי לתמלל את ההקלטה. אפשר לכתוב לי?" : "לא הצלחתי לשמוע את ההקלטה 🙏 אפשר לכתוב לי במקום?" });
        return;
      }
      text = spoken;
    }
    if (!text.trim()) {
      // תמונה/סרטון/מסמך בלי מילים — עונים בעדינות פעם אחת (לא לסטיקרים, תגובות והודעות מערכת).
      const media = inner.imageMessage || inner.videoMessage || inner.documentMessage;
      if (media && !isOwner && this.gate({ jid, replyJid, phoneDigits }) && Date.now() - (this.nudged.get(replyJid) || 0) > 3600 * 1000) {
        this.nudged.set(replyJid, Date.now());
        await this.safeSend(replyJid, jid, { text: "קיבלתי, תודה 🙏 כדי שאוכל לעזור — אפשר לכתוב לי במילים מה תרצי?" });
      }
      return;
    }

    // ===== בעל/ת החיבור מדבר/ת עם הסוכן =====
    if (isOwner) {
      await sock.readMessages([m.key]);
      const cmd = await handleCommand(this.brain, text.trim(), sock);
      const reply = cmd !== null ? cmd
        : (await this.brain.thinkAsOwner(jid, text.trim(), OWNER_SYSTEM, ownerContext(this.brain))) || localManageReply(this.brain, text.trim());
      await this.safeSend(replyJid, jid, { text: reply });
      return;
    }

    const gateReason = this.gateReason({ jid, replyJid, phoneDigits });
    if (gateReason) {
      console.log(`[${this.id}] לא עונה: ${gateReason}`);
      this.trackLead(replyJid, phoneDigits || jid.split("@")[0], { status: "skipped", reason: gateReason });
      return;
    }
    const convKey = replyJid;

    const out = await this.brain.think(convKey, text.trim());
    if (out.ignore) {
      // ספאם / פרסום חוזר — לא עונים ולא מסמנים כנקרא (שיישאר לקטי למחוק)
      console.log(`[${this.id}] לא עונה: ${out.reason}`);
      this.trackLead(replyJid, phoneDigits || jid.split("@")[0], { status: "skipped", reason: out.reason });
      return;
    }
    await sock.readMessages([m.key]);
    await sock.sendPresenceUpdate("composing", replyJid);
    await new Promise(r => setTimeout(r, shortDelay(out.reply)));
    await sock.sendPresenceUpdate("paused", replyJid);
    await this.safeSend(replyJid, jid, { text: out.reply });
    this.state.handled++;
    this.brain.countHandled();
    this.trackLead(replyJid, phoneDigits || jid.split("@")[0], { status: "answered", reason: undefined });

    if (out.human) this.brain.pause(convKey, 12);
    // לא הייתה תשובה בטקסטים של העסק — מסמנים לבעלים כדי שיוסיפו שאלה ותשובה.
    if (out.unanswered && !out.alert && !out.human) this.brain.flag(phoneDigits || jid.split("@")[0], text.trim(), false, "unanswered");
    if (out.alert || out.human) {
      const from = phoneDigits || jid.split("@")[0];
      this.brain.flag(from, text.trim(), out.alert);
      if (owner) {
        const tag = out.alert ? "🔴 מצוקה — דורש התייחסות אישית" : "🟡 ביקשו לדבר איתך";
        try {
          await this.send(`${owner}@s.whatsapp.net`, { text: `${tag}\nמ: ${from}\n\nכתבו: ${text.trim()}\n\nהסוכן ענה: ${out.reply}` });
        } catch (e) { console.error(`[${this.id}] כשל בשליחת התראה:`, e.message); }
      }
    }
  }

  /** האם מותר לענות לפונה הזה עכשיו? (חסימה, מושהה, איש קשר שמור, שיחה שנלקחה ידנית) */
  gate(args) { return !this.gateReason(args); }
  /** מחזיר את הסיבה שלא עונים (מחרוזת), או "" אם מותר לענות. */
  gateReason({ jid, replyJid, phoneDigits }) {
    const tenant = this.tenant;
    if (!tenant) return "אין חיבור";
    if (phoneDigits && BLOCKLIST.has(phoneDigits)) return "המספר ברשימת החסימה (BLOCKLIST)";
    if (!tenant.settings?.active) return "המענה האוטומטי כבוי";
    if (this.brain.isGloballyPaused()) return "הסוכן מושהה";
    const allowed = phoneDigits && ALLOWLIST.has(phoneDigits);
    const onlyNew = tenant.settings?.onlyNonContacts !== false;
    if (!allowed && onlyNew && (this.savedContacts.has(jid) || this.savedContacts.has(replyJid))) return "איש קשר שמור (המתג 'רק פניות חדשות')";
    if (this.brain.isPaused(replyJid) || this.brain.isPaused(jid)) return "השיחה נלקחה ידנית — הסוכן בחוץ ל-12 שעות";
    return "";
  }

  view() {
    const leads = [...this.leads.values()].sort((a, b) => b.lastAt - a.lastAt).slice(0, 25);
    return { ...this.state, ...this.brain.recentActivity(), leads };
  }
}

// ── מנהל כל החיבורים ──
const sessions = new Map();
export function getSession(id) { return sessions.get(id) || null; }
export async function startSession(id) {
  let s = sessions.get(id);
  if (!s) { s = new WaSession(id); sessions.set(id, s); }
  await s.start();
  return s;
}
export async function dropSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  try { await s.sock?.logout(); } catch { /* ignore */ }
  await s.stop();
  sessions.delete(id);
}
