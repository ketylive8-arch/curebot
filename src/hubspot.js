// ============================================================
//  חיבור ל-HubSpot — כל חיבור במערכת (כל עסק) מחבר את חשבון ה-HubSpot שלו.
//  כל פונה אמיתי (לא ספאם/פרסומת/שליח) נכנס כאיש קשר (Lead) עם הטלפון, השם בוואטסאפ
//  ושלב הליד, וכל שינוי שלב נרשם כהערה (Note) על איש הקשר:
//    NEW          — פנייה חדשה (+ מקור: מודעה / אתר / פנייה ישירה, וההודעה הראשונה)
//    IN_PROGRESS  — הוזמן/ה לשיחת היכרות
//    BAD_TIMING   — "אחשוב על זה" / "יקר" (תזכורת אחרי שבוע)
//    OPEN_DEAL    — כתב/ה יום ושעה או קבע/ה 🟢
//    UNQUALIFIED  — "לא, תודה"
//  החיבור: Private App ב-HubSpot עם ההרשאות crm.objects.contacts.read + crm.objects.contacts.write.
//  הטוקן נשמר רק בשרת ולא נשלח לדפדפן. תקלה ב-HubSpot לעולם לא עוצרת את הבוט.
// ============================================================
import fs from "fs";
import path from "path";
import { authDirOf } from "./tenants.js";

const API = process.env.HUBSPOT_API || "https://api.hubapi.com";
export const STAGES = { new: "NEW", invited: "IN_PROGRESS", hesitant: "BAD_TIMING", hot: "OPEN_DEAL", declined: "UNQUALIFIED" };
const STAGE_NOTE = {
  invited: "הוזמן/ה לשיחת היכרות",
  hesitant: "מתלבט/ת (\"אחשוב על זה\" / מחיר / זמן) — תזכורת אוטומטית בעוד שבוע",
  hot: "🟢 רוצה לקבוע שיחת היכרות — לחזור לאשר",
  declined: "לא מעוניין/ת כרגע"
};
const RANK = { new: 0, invited: 1, hesitant: 2, hot: 3, declined: 3 };

async function call(token, method, p, body) {
  const res = await fetch(API + p, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) {
    const e = new Error(`HubSpot ${res.status}: ${String(data?.message || text).slice(0, 160)}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

/** בדיקת טוקן: מצליח לקרוא אנשי קשר? מחזיר הודעה ברורה בעברית אם לא. */
export async function verifyToken(token) {
  if (!/^[\w-]{20,}$/.test(String(token || ""))) return { ok: false, error: "הטוקן לא נראה תקין — צריך להעתיק את ה-Access token של ה-Private App" };
  try {
    await call(token, "GET", "/crm/v3/objects/contacts?limit=1");
    return { ok: true };
  } catch (e) {
    if (e.status === 401) return { ok: false, error: "HubSpot לא מכיר את הטוקן (401). בדקי שהעתקת את כולו." };
    if (e.status === 403) return { ok: false, error: "לטוקן חסרות הרשאות. צריך crm.objects.contacts.read ו-crm.objects.contacts.write." };
    return { ok: false, error: e.message };
  }
}

const e164 = (digits) => (digits ? `+${digits}` : "");

/** מנהל הסנכרון של חיבור אחד. getToken() מחזיר את הטוקן הנוכחי (או ריק = לא מחובר). */
export function createHubspot(tenantId, getToken, onError = () => {}) {
  const file = path.join(path.dirname(authDirOf(tenantId)), "hubspot.json");
  let map = {};
  try { map = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* new */ }
  const save = () => {
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + ".tmp", JSON.stringify(map)); fs.renameSync(file + ".tmp", file); }
    catch (e) { console.error(`[${tenantId}] hubspot save:`, e.message); }
  };
  let chain = Promise.resolve(); // אחד-אחד, לפי הסדר — בלי כפילויות ובלי עומס על HubSpot

  async function findOrCreate(token, phone, name, stage) {
    const found = await call(token, "POST", "/crm/v3/objects/contacts/search", {
      filterGroups: [
        { filters: [{ propertyName: "phone", operator: "EQ", value: e164(phone) }] },
        { filters: [{ propertyName: "phone", operator: "EQ", value: "0" + phone.replace(/^972/, "") }] }
      ],
      properties: ["phone"], limit: 1
    });
    if (found?.results?.[0]?.id) return { id: found.results[0].id, created: false };
    const props = { phone: e164(phone), lifecyclestage: "lead", hs_lead_status: STAGES[stage] || "NEW" };
    if (name) props.firstname = String(name).slice(0, 60);
    const c = await call(token, "POST", "/crm/v3/objects/contacts", { properties: props });
    return { id: c.id, created: true };
  }

  async function note(token, id, body) {
    try {
      await call(token, "POST", "/crm/v3/objects/notes", {
        properties: { hs_timestamp: new Date().toISOString(), hs_note_body: body.slice(0, 5000) },
        associations: [{ to: { id }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }]
      });
    } catch (e) { console.error(`[${tenantId}] HubSpot הערה נכשלה: ${e.message}`); }
  }

  /** {key, phone (ספרות, 972…), name, stage, source, first, text} — שולח רק כשמשהו השתנה. */
  function sync(ev) {
    const token = getToken();
    if (!token || !ev?.phone || !/^\d{8,15}$/.test(ev.phone)) return Promise.resolve();
    chain = chain.then(async () => {
      const rec = map[ev.key] || {};
      const stage = ev.stage || "new";
      // לא חוזרים אחורה בשלב (מי שכבר קבע לא חוזר ל"הוזמן"); "מתלבט" אחרי הזמנה כן מתעדכן.
      if (rec.id && rec.stage && RANK[stage] <= RANK[rec.stage] && !(stage === "hesitant" && rec.stage !== "hesitant")) return;
      try {
        let id = rec.id;
        if (!id) {
          const r = await findOrCreate(token, ev.phone, ev.name, stage);
          id = r.id;
          await note(token, id, `פנייה ${r.created ? "חדשה" : "חוזרת"} בוואטסאפ${ev.source ? ` · ${ev.source}` : ""}` +
            (ev.first ? `\nהודעה ראשונה: ${ev.first}` : "") + (stage !== "new" ? `\nשלב: ${STAGE_NOTE[stage]}` : ""));
        } else {
          await note(token, id, `שלב: ${STAGE_NOTE[stage] || stage}${ev.text ? `\nכתב/ה: ${ev.text.slice(0, 300)}` : ""}`);
        }
        if (rec.id) await call(token, "PATCH", `/crm/v3/objects/contacts/${id}`, { properties: { hs_lead_status: STAGES[stage] || "NEW" } });
        map[ev.key] = { id, stage, at: Date.now() };
        save();
        console.log(`[${tenantId}] HubSpot: ליד …${ev.phone.slice(-3)} → ${STAGES[stage]}`);
        onError(null);
      } catch (e) {
        console.error(`[${tenantId}] HubSpot נכשל (…${ev.phone.slice(-3)}): ${e.message}`);
        onError(e.status === 401 ? "הטוקן של HubSpot כבר לא תקף — צריך לחבר מחדש" : e.status === 403 ? "לטוקן של HubSpot חסרות הרשאות" : "HubSpot לא זמין כרגע — ננסה בפנייה הבאה");
      }
    });
    return chain;
  }
  return { sync, flush: () => chain };
}
