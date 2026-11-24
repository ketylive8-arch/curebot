// ============================================================
//  חיבור למערכות CRM נוספות (מעבר ל-HubSpot, שיש לו קובץ משלו).
//  כל חיבור במערכת (כל עסק) בוחר CRM אחד ומדביק את המפתח שלו:
//    • pipedrive  — API token (Settings → Personal preferences → API)
//    • monday     — API token + מספר הלוח (Board ID). עמודת טלפון בלוח מזוהה לבד.
//    • fireberry  — Fireberry / Powerlink: API token (tokenid)
//    • webhook    — כתובת https שמקבלת כל ליד כ-JSON: Make / Zapier / n8n / כל CRM אחר.
//  מה זה עושה:
//    קריאה  — לפני שמכניסים ליד, מחפשים ב-CRM לפי הטלפון: אם כבר קיים, לא יוצרים כפילות,
//             רק מוסיפים הערה, ומסמנים בפניות האחרונות "קיים ב-CRM".
//    כתיבה  — פונה אמיתי חדש נכנס כאיש קשר/ליד עם הטלפון, השם, המקור וההודעה הראשונה,
//             וכל שינוי שלב (הוזמן לשיחה / מתלבט / רוצה לקבוע / לא מעוניין) נרשם כהערה.
//  המפתחות נשמרים רק בשרת ולא נשלחים לדפדפן. תקלה ב-CRM לעולם לא עוצרת את הבוט.
// ============================================================
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { authDirOf } from "./tenants.js";

export const CRM_PROVIDERS = {
  pipedrive: { label: "Pipedrive", fields: ["token"] },
  monday: { label: "monday.com", fields: ["token", "boardId"] },
  fireberry: { label: "Fireberry (Powerlink)", fields: ["token"] },
  webhook: { label: "Webhook — Make / Zapier / n8n / כל CRM", fields: ["url", "secret"] }
};

const STAGE_LABEL = {
  new: "פנייה חדשה",
  invited: "הוזמן/ה לשיחת היכרות",
  hesitant: "מתלבט/ת (\"אחשוב על זה\" / מחיר / זמן)",
  hot: "🟢 רוצה לקבוע שיחת היכרות — לחזור לאשר",
  declined: "לא מעוניין/ת כרגע"
};
const RANK = { new: 0, invited: 1, hesitant: 2, hot: 3, declined: 3 };

const e164 = (d) => (d ? `+${d}` : "");
const local = (d) => (String(d).startsWith("972") ? "0" + String(d).slice(3) : String(d));

class CrmError extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

async function http(url, { method = "GET", headers = {}, body, timeout = 12000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method, signal: ctl.signal, redirect: "error",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body)
    });
    const text = await res.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
    if (!res.ok) throw new CrmError(`${res.status}: ${String(data?.error || data?.message || data?.errors?.[0]?.message || text).slice(0, 160)}`, res.status);
    return data;
  } catch (e) {
    if (e instanceof CrmError) throw e;
    throw new CrmError(e.name === "AbortError" ? "לא ענה בזמן" : String(e.message || e).slice(0, 160), 0);
  } finally { clearTimeout(t); }
}

// ── כתובת Webhook: רק https לכתובת ציבורית (לא לשרתים פנימיים) ──
export function safeWebhookUrl(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h.includes(".") || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".onrender.com")) return null;
  if (/^(\d+\.){3}\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return null;
  }
  if (h.includes(":")) return null; // IPv6 ישיר — לא
  return u.toString();
}

// ============================================================
//  מתאמים — לכל CRM: verify / find / create / note
// ============================================================
const adapters = {
  pipedrive: {
    base: () => process.env.PIPEDRIVE_API || "https://api.pipedrive.com/v1",
    url(cfg, p, q = "") { return `${this.base()}${p}?api_token=${encodeURIComponent(cfg.token)}${q}`; },
    async verify(cfg) {
      const r = await http(this.url(cfg, "/users/me"));
      return { account: r?.data?.company_name || r?.data?.name || "" };
    },
    async find(cfg, phone) {
      for (const term of [e164(phone), local(phone), phone]) {
        const r = await http(this.url(cfg, "/persons/search", `&term=${encodeURIComponent(term)}&fields=phone&exact_match=true&limit=1`));
        const it = r?.data?.items?.[0]?.item;
        if (it?.id) return { id: String(it.id), name: it.name || "" };
      }
      return null;
    },
    async create(cfg, lead) {
      const p = await http(this.url(cfg, "/persons"), { method: "POST", body: { name: lead.name || local(lead.phone), phone: [{ value: e164(lead.phone), primary: true, label: "mobile" }] } });
      const id = String(p?.data?.id || "");
      if (!id) throw new CrmError("Pipedrive לא החזיר מזהה איש קשר", 0);
      try { await http(this.url(cfg, "/leads"), { method: "POST", body: { title: `וואטסאפ · ${lead.name || local(lead.phone)}`, person_id: Number(id) } }); }
      catch (e) { console.error("[crm] Pipedrive ליד נכשל (איש הקשר נוצר):", e.message); }
      return id;
    },
    async note(cfg, id, text) {
      await http(this.url(cfg, "/notes"), { method: "POST", body: { content: text.replace(/\n/g, "<br>"), person_id: Number(id) } });
    }
  },

  monday: {
    endpoint: () => process.env.MONDAY_API || "https://api.monday.com/v2",
    async gql(cfg, query, variables = {}) {
      const r = await http(this.endpoint(), { method: "POST", headers: { Authorization: cfg.token, "API-Version": "2024-10" }, body: { query, variables } });
      if (r?.errors?.length) throw new CrmError(String(r.errors[0].message || "monday error").slice(0, 160), r.errors[0]?.extensions?.status_code || 400);
      if (r?.error_message) throw new CrmError(String(r.error_message).slice(0, 160), Number(r.status_code) || 400);
      return r?.data || {};
    },
    async verify(cfg) {
      if (!/^\d{4,20}$/.test(String(cfg.boardId || ""))) throw new CrmError("צריך את מספר הלוח (Board ID) — המספר שמופיע בכתובת הלוח אחרי /boards/", 400);
      const d = await this.gql(cfg, "query ($b: [ID!]) { me { name } boards(ids: $b) { id name columns { id type title } } }", { b: [String(cfg.boardId)] });
      const board = d?.boards?.[0];
      if (!board) throw new CrmError("לא מצאתי את הלוח — בדקי את מספר הלוח ושהטוקן שייך למשתמש שיש לו גישה אליו", 404);
      const phoneCol = (board.columns || []).find(c => c.type === "phone")?.id || "";
      return { account: board.name, phoneCol };
    },
    async find(cfg, phone) {
      if (!cfg.phoneCol) return null;
      const d = await this.gql(cfg,
        "query ($b: ID!, $c: String!, $v: [String]!) { items_page_by_column_values(board_id: $b, limit: 1, columns: [{ column_id: $c, column_values: $v }]) { items { id name } } }",
        { b: String(cfg.boardId), c: cfg.phoneCol, v: [phone, e164(phone), local(phone)] });
      const it = d?.items_page_by_column_values?.items?.[0];
      return it ? { id: String(it.id), name: it.name || "" } : null;
    },
    async create(cfg, lead) {
      const cv = cfg.phoneCol ? { [cfg.phoneCol]: { phone: e164(lead.phone), countryShortName: "IL" } } : {};
      const name = `${lead.name || "ליד מוואטסאפ"}${cfg.phoneCol ? "" : ` · ${local(lead.phone)}`}`;
      const d = await this.gql(cfg, "mutation ($b: ID!, $n: String!, $cv: JSON) { create_item(board_id: $b, item_name: $n, column_values: $cv) { id } }",
        { b: String(cfg.boardId), n: name.slice(0, 250), cv: JSON.stringify(cv) });
      const id = d?.create_item?.id;
      if (!id) throw new CrmError("monday לא החזיר מזהה פריט", 0);
      return String(id);
    },
    async note(cfg, id, text) {
      await this.gql(cfg, "mutation ($i: ID!, $t: String!) { create_update(item_id: $i, body: $t) { id } }", { i: String(id), t: text.replace(/\n/g, "<br>") });
    }
  },

  fireberry: {
    base: () => process.env.FIREBERRY_API || "https://api.fireberry.com/api",
    h: (cfg) => ({ tokenid: cfg.token }),
    async verify(cfg) {
      const r = await http(`${this.base()}/query`, { method: "POST", headers: this.h(cfg), body: { objecttype: 1, page_size: 1, fields: "accountid" } });
      if (r && r.success === false) throw new CrmError(String(r.message || "Fireberry דחה את הטוקן"), 401);
      return { account: "" };
    },
    async find(cfg, phone) {
      const r = await http(`${this.base()}/query`, {
        method: "POST", headers: this.h(cfg),
        body: { objecttype: 1, page_size: 1, fields: "accountid,accountname", query: `(telephone1 = '${local(phone)}') OR (telephone1 = '${e164(phone)}') OR (telephone1 = '${phone}')` }
      });
      const rows = r?.data?.Data || r?.data?.data || r?.Data || [];
      const it = Array.isArray(rows) ? rows[0] : null;
      return it?.accountid ? { id: String(it.accountid), name: it.accountname || "" } : null;
    },
    async create(cfg, lead) {
      const r = await http(`${this.base()}/record/account`, {
        method: "POST", headers: this.h(cfg),
        body: { accountname: lead.name || `ליד מוואטסאפ ${local(lead.phone)}`, telephone1: local(lead.phone), description: lead.summary.slice(0, 3000) }
      });
      const id = r?.data?.Record?.accountid || r?.data?.accountid || r?.Record?.accountid;
      if (!id) throw new CrmError("Fireberry לא החזיר מזהה רשומה", 0);
      return String(id);
    },
    async note(cfg, id, text, rec) {
      // ההיסטוריה נשמרת בתיאור הרשומה (מצטבר), כדי לא לדרוס את מה שכבר נכתב
      const desc = `${rec?.desc ? rec.desc + "\n\n" : ""}${new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })} · ${text}`.slice(-3000);
      await http(`${this.base()}/record/account/${encodeURIComponent(id)}`, { method: "PUT", headers: this.h(cfg), body: { description: desc } });
      return { desc };
    }
  },

  webhook: {
    async post(cfg, payload) {
      const url = safeWebhookUrl(cfg.url);
      if (!url) throw new CrmError("הכתובת חייבת להיות https ציבורית", 400);
      const body = JSON.stringify(payload);
      const headers = { "User-Agent": "CureBot-CRM/1.0" };
      if (cfg.secret) headers["X-CureBot-Signature"] = "sha256=" + crypto.createHmac("sha256", cfg.secret).update(body).digest("hex");
      return http(url, { method: "POST", headers, body });
    },
    async verify(cfg) {
      await this.post(cfg, { event: "test", message: "בדיקת חיבור מ-CureBot", at: new Date().toISOString() });
      return { account: new URL(safeWebhookUrl(cfg.url)).hostname };
    },
    async find() { return null; },
    async create(cfg, lead) {
      await this.post(cfg, { event: "lead", ...lead.payload });
      return `wh:${lead.phone}`;
    },
    async note(cfg, _id, _text, _rec, ev) {
      await this.post(cfg, { event: "stage", ...ev.payload });
    }
  }
};

/** בדיקת חיבור: מנסה לקרוא מה-CRM. מחזיר {ok, error, extra} עם הודעה ברורה בעברית. */
export async function verifyCrm(cfg) {
  const a = adapters[cfg?.provider];
  if (!a) return { ok: false, error: "סוג CRM לא מוכר" };
  if (cfg.provider === "webhook") {
    if (!safeWebhookUrl(cfg.url)) return { ok: false, error: "צריך כתובת https מלאה (למשל מ-Make: https://hook.eu1.make.com/…)" };
  } else if (!/^[\w.\-=]{16,}$/.test(String(cfg.token || "").replace(/\s/g, ""))) {
    return { ok: false, error: "המפתח לא נראה תקין — צריך להעתיק את ה-API token במלואו" };
  }
  try {
    const extra = await a.verify(cfg);
    return { ok: true, extra: extra || {} };
  } catch (e) {
    if (e.status === 401 || e.status === 403) return { ok: false, error: `${CRM_PROVIDERS[cfg.provider].label} לא מכיר את המפתח או שחסרות לו הרשאות (${e.status})` };
    if (e.status === 404) return { ok: false, error: e.message.replace(/^404: /, "") };
    return { ok: false, error: `לא הצלחתי להתחבר ל-${CRM_PROVIDERS[cfg.provider].label}: ${e.message}` };
  }
}

/** מנהל הסנכרון של חיבור אחד. getCfg() מחזיר את ההגדרות הנוכחיות (או null = לא מחובר). */
export function createCrm(tenantId, getCfg, onError = () => {}) {
  const file = path.join(path.dirname(authDirOf(tenantId)), "crm.json");
  let map = {};
  try { map = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* new */ }
  const save = () => {
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + ".tmp", JSON.stringify(map)); fs.renameSync(file + ".tmp", file); }
    catch (e) { console.error(`[${tenantId}] crm save:`, e.message); }
  };
  let chain = Promise.resolve();
  const enqueue = (fn) => (chain = chain.then(fn, fn));
  const fail = (cfg, e, phone) => {
    const label = CRM_PROVIDERS[cfg.provider]?.label || "CRM";
    console.error(`[${tenantId}] ${label} נכשל (…${String(phone).slice(-3)}): ${e.message}`);
    onError(e.status === 401 || e.status === 403 ? `המפתח של ${label} כבר לא תקף או חסרות לו הרשאות — צריך לחבר מחדש` : `${label} לא זמין כרגע — ננסה בפנייה הבאה`);
  };

  /** קריאה: האם הטלפון כבר קיים ב-CRM? {found, name} או null אם לא מחובר / תקלה. */
  function lookup(phone) {
    const cfg = getCfg();
    if (!cfg?.provider || !/^\d{8,15}$/.test(String(phone || ""))) return Promise.resolve(null);
    const key = `p:${phone}`;
    if (map[key]?.id) return Promise.resolve({ found: true, existing: !!map[key].existing, name: map[key].name || "" });
    return enqueue(async () => {
      try {
        const hit = await adapters[cfg.provider].find(cfg, phone);
        if (hit) { map[key] = { id: hit.id, name: hit.name, existing: true, stage: map[key]?.stage, at: Date.now() }; save(); }
        return hit ? { found: true, existing: true, name: hit.name } : { found: false };
      } catch (e) { fail(cfg, e, phone); return null; }
    });
  }

  /** כתיבה: {phone, name, stage, source, first, text} — יוצר/מעדכן רק כשמשהו השתנה. */
  function sync(ev) {
    const cfg = getCfg();
    if (!cfg?.provider || !ev?.phone || !/^\d{8,15}$/.test(ev.phone)) return Promise.resolve();
    const a = adapters[cfg.provider];
    return enqueue(async () => {
      const key = `p:${ev.phone}`;
      const rec = map[key] || {};
      const stage = ev.stage || "new";
      if (rec.id && rec.stage && RANK[stage] <= RANK[rec.stage] && !(stage === "hesitant" && rec.stage !== "hesitant")) return;
      const payload = {
        phone: e164(ev.phone), phoneLocal: local(ev.phone), name: ev.name || "", stage, stageLabel: STAGE_LABEL[stage] || stage,
        source: ev.source || "", firstMessage: ev.first || "", lastMessage: (ev.text || "").slice(0, 500), at: new Date().toISOString()
      };
      try {
        let id = rec.id, created = false;
        if (!id) {
          const hit = await a.find(cfg, ev.phone);
          if (hit) id = hit.id;
          else {
            const summary = `פנייה חדשה בוואטסאפ${ev.source ? ` · ${ev.source}` : ""}${ev.first ? `\nהודעה ראשונה: ${ev.first}` : ""}`;
            id = await a.create(cfg, { phone: ev.phone, name: ev.name, summary, payload });
            created = true;
          }
        }
        let extra = {};
        if (!created || stage !== "new") {
          const text = rec.id
            ? `שלב: ${STAGE_LABEL[stage] || stage}${ev.text ? `\nכתב/ה: ${ev.text.slice(0, 300)}` : ""}`
            : `פנייה חוזרת בוואטסאפ${ev.source ? ` · ${ev.source}` : ""}${ev.first ? `\nהודעה ראשונה: ${ev.first}` : ""}${stage !== "new" ? `\nשלב: ${STAGE_LABEL[stage]}` : ""}`;
          extra = (await a.note(cfg, id, text, rec, { payload })) || {};
        }
        map[key] = { ...rec, ...extra, id, stage, existing: rec.existing || (!created && !rec.id), at: Date.now() };
        save();
        console.log(`[${tenantId}] ${CRM_PROVIDERS[cfg.provider].label}: ליד …${ev.phone.slice(-3)} → ${stage}${created ? " (נוצר)" : ""}`);
        onError(null);
      } catch (e) { fail(cfg, e, ev.phone); }
    });
  }
  return { sync, lookup, flush: () => chain };
}
