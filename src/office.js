// ============================================================
//  המשרד — ניהול לקוחות ופגישות מעל נתוני השיחות.
//  כל פנייה נכנסת הופכת לרשומת לקוח (מי, מתי, מאיפה, מה ביקש, באיזה שלב),
//  וקטי מסמנת שלבים וקובעת פגישות מהנייד — בלי לפתוח כלום.
// ============================================================
import crypto from "crypto";
import { getData, save } from "./store.js";

// תאריכי הפגישות לפי שעון ישראל, גם אם השרת רץ ב-UTC.
if (!process.env.TZ) process.env.TZ = "Asia/Jerusalem";

export const STAGES = {
  new: "חדש",
  talking: "בשיחה",
  meeting: "פגישה",
  client: "לקוח"
};

const STAGE_ALIASES = {
  "חדש": "new",
  "חדשה": "new",
  "פנייה": "new",
  "פניה": "new",
  "בשיחה": "talking",
  "שיחה": "talking",
  "מתעניין": "talking",
  "מתעניינת": "talking",
  "פגישה": "meeting",
  "היכרות": "meeting",
  "נרשם": "meeting",
  "נרשמה": "meeting",
  "לקוח": "client",
  "לקוחה": "client",
  "סגור": "client",
  "סגורה": "client"
};

// ── עזרים ──
export function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("972")) return digits;
  return "972" + digits.replace(/^0/, "");
}

function timeOf(iso) {
  return new Date(iso).toLocaleString("he-IL", {
    weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

// מקור הפנייה — מנוסח מההודעה הראשונה. עוזר לדעת איזה קמפיין/ערוץ הביא אותה.
export function sourceOf(text) {
  const t = (text || "").toLowerCase();
  if (/פייסבוק|facebook|מודעה|קמפיין|פרסום/.test(t)) return "פייסבוק / קמפיין";
  if (/אינסטגרם|instagram|אינסטה/.test(t)) return "אינסטגרם";
  if (/לינקטרי|linkedin/.test(t)) return "לינקטרי";
  if (/אתר|website|site|קישור/.test(t)) return "האתר";
  if (/וואטסאפ|whatsapp|ווצאפ/.test(t)) return "וואטסאפ";
  return "פנייה ישירה";
}

// ── רשומות לקוח ──
export function recordInbound(phone, name, text, out = {}) {
  const p = normalizePhone(phone);
  if (!p) return null;
  const db = getData();
  const now = new Date().toISOString();

  let c = db.clients[p];
  if (!c) {
    c = {
      phone: p,
      name: name || "",
      stage: "new",
      source: sourceOf(text),
      firstSeen: now,
      msgCount: 0,
      lastText: "",
      needsYou: null,
      alert: false
    };
    db.clients[p] = c;
  }

  if (!c.name && name) c.name = name;
  c.msgCount += 1;
  c.lastSeen = now;
  c.lastText = (text || "").slice(0, 300);

  // מסומן כמי שמחכה לקטי אישית (ביקש אדם / מצוקה)
  if (out.human || out.alert) {
    c.needsYou = out.human ? now : c.needsYou;
    if (out.alert) c.alert = true;
  }

  save();
  return c;
}

export function listClients(limit = 20) {
  const list = Object.values(getData().clients);
  list.sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));
  return list.slice(0, limit).map(c => ({
    phone: c.phone,
    name: c.name,
    stage: c.stage,
    stageLabel: STAGES[c.stage] || c.stage,
    source: c.source,
    msgCount: c.msgCount,
    lastText: c.lastText,
    lastSeen: c.lastSeen,
    needsYou: Boolean(c.needsYou),
    alert: Boolean(c.alert)
  }));
}

export function getClient(phone) {
  return getData().clients[normalizePhone(phone)] || null;
}

export function setStage(phone, stageWord) {
  const c = getClient(phone);
  if (!c) return null;
  const key = STAGE_ALIASES[String(stageWord || "").trim()] || null;
  if (!key) return null;
  c.stage = key;
  // טיפול ידני של קטי — מאותו רגע אין צורך להתריע עליו
  c.needsYou = null;
  c.alert = false;
  save();
  return c;
}

// ── פגישות ──
const WEEKDAYS = { ראשון: 0, שני: 1, שלישי: 2, רביעי: 3, חמישי: 4, שישי: 5, שבת: 6 };

/** מפרש "מחר 10:00", "יום שלישי 18:30", "05/11 09:00", "היום 16:00" */
export function parseWhen(text, base = new Date()) {
  const t = String(text || "");
  const time = t.match(/(\d{1,2})[:.](\d{2})/);
  const hour = time ? Number(time[1]) : 10;
  const minute = time ? Number(time[2]) : 0;

  const d = new Date(base);
  let found = false;

  if (/מחרתיים/.test(t)) {
    d.setDate(d.getDate() + 2);
    found = true;
  } else if (/מחר/.test(t)) {
    d.setDate(d.getDate() + 1);
    found = true;
  } else if (/היום/.test(t)) {
    found = true;
  } else {
    const dm = t.match(/(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?/);
    const wd = t.match(/(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/);
    if (dm) {
      const day = Number(dm[1]);
      const month = Number(dm[2]) - 1;
      const year = dm[3]
        ? (Number(dm[3]) < 100 ? 2000 + Number(dm[3]) : Number(dm[3]))
        : d.getFullYear();
      d.setFullYear(year, month, day);
      found = true;
    } else if (wd) {
      let diff = (WEEKDAYS[wd[1]] - d.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      d.setDate(d.getDate() + diff);
      found = true;
    }
  }

  if (!found && !time) return null;
  d.setHours(hour, minute, 0, 0);
  return d;
}

export function addAppointment(phone, when, note = "") {
  const p = normalizePhone(phone);
  if (!p || !when) return null;
  const db = getData();
  // אם קטי קובעת פגישה למי שעוד לא כתב — נפתח לו כרטיס במשרד בכל מקרה.
  const c = db.clients[p] || (db.clients[p] = {
    phone: p,
    name: "",
    stage: "meeting",
    source: "פגישה שנקבעה",
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    msgCount: 0,
    lastText: "",
    needsYou: null,
    alert: false
  });
  const appt = {
    id: crypto.randomUUID(),
    phone: p,
    name: c.name || "",
    at: when.toISOString(),
    note: String(note || "").slice(0, 200),
    createdAt: new Date().toISOString()
  };
  db.appointments.push(appt);
  db.appointments = db.appointments.filter(a => new Date(a.at) > new Date(Date.now() - 90 * 24 * 3600 * 1000));
  if (c && c.stage !== "client") c.stage = "meeting";
  save();
  return appt;
}

export function upcomingAppointments(limit = 15) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return getData().appointments
    .filter(a => new Date(a.at) >= start)
    .sort((a, b) => new Date(a.at) - new Date(b.at))
    .slice(0, limit)
    .map(a => ({
      id: a.id,
      phone: a.phone,
      name: a.name || getData().clients[a.phone]?.name || "",
      at: a.at,
      whenLabel: timeOf(a.at),
      note: a.note
    }));
}

// ── תצוגות טקסט לוואטסאפ של קטי ──
export function clientCard(phone) {
  const c = getClient(phone);
  if (!c) return null;
  const appts = getData().appointments
    .filter(a => a.phone === c.phone && new Date(a.at) >= new Date(Date.now() - 3600 * 1000))
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  const lines = [
    `${c.name || c.phone}${c.name ? " · " + c.phone : ""}`,
    `שלב: ${STAGES[c.stage] || c.stage} · מקור: ${c.source || "—"}`,
    `${c.msgCount} הודעות · פנייה אחרונה: ${timeOf(c.lastSeen)}`,
    c.lastText ? `כתב/ה: "${c.lastText.slice(0, 120)}"` : ""
  ];
  if (appts.length) lines.push("פגישות: " + appts.map(a => timeOf(a.at)).join(" · "));
  if (c.alert) lines.push("🔴 סומן כמצוקה");
  else if (c.needsYou) lines.push("🟡 ביקש/ה לדבר איתך");
  return lines.filter(Boolean).join("\n");
}

export function summary() {
  const db = getData();
  const clients = Object.values(db.clients);
  return {
    clients: clients.length,
    newClients: clients.filter(c => c.stage === "new").length,
    meetings: clients.filter(c => c.stage === "meeting").length,
    closed: clients.filter(c => c.stage === "client").length,
    waiting: clients.filter(c => c.needsYou || c.alert).length,
    appointments: upcomingAppointments(50).length
  };
}
