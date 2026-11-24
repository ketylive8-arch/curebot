// בדיקות חיבור ה-CRM — עם שרת מדומה לכל מערכת (בלי רשת אמיתית).
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "crm-test-"));
const { createCrm, verifyCrm, safeWebhookUrl } = await import("../src/crm.js");

let fails = 0;
const ok = (c, name) => { console.log(`${c ? "PASS" : "FAIL"} ${name}`); if (!c) fails++; };

// ── fetch מדומה: כל בקשה נרשמת ומקבלת תשובה לפי ה-handler של הבדיקה ──
let calls = [], handler = () => ({});
globalThis.fetch = async (url, opt = {}) => {
  const body = opt.body ? JSON.parse(opt.body) : undefined;
  calls.push({ url: String(url), method: opt.method || "GET", headers: opt.headers || {}, body, raw: opt.body });
  const r = handler(String(url), opt.method || "GET", body, opt.headers || {});
  const status = r?.__status || 200;
  return { ok: status < 400, status, text: async () => JSON.stringify(r?.__body ?? r) };
};
const reset = (h) => { calls = []; handler = h; };
const PHONE = "972501234567";

// ===== Pipedrive =====
{
  const people = {};
  reset((url, method, body) => {
    if (url.includes("/users/me")) return { data: { company_name: "סטודיו בדיקה" } };
    if (url.includes("/persons/search")) {
      const term = decodeURIComponent(url.match(/term=([^&]+)/)[1]);
      const hit = Object.entries(people).find(([, p]) => p.phone === term);
      return { data: { items: hit ? [{ item: { id: Number(hit[0]), name: hit[1].name } }] : [] } };
    }
    if (url.includes("/persons") && method === "POST") { const id = 100 + Object.keys(people).length; people[id] = { name: body.name, phone: body.phone[0].value }; return { data: { id } }; }
    if (url.includes("/leads")) return { data: { id: "lead-uuid" } };
    if (url.includes("/notes")) return { data: { id: 1 } };
    return { __status: 404 };
  });
  const cfg = { provider: "pipedrive", token: "a".repeat(40) };
  const v = await verifyCrm(cfg);
  ok(v.ok && v.extra.account === "סטודיו בדיקה", "pipedrive: connect-and-test reads the account");
  const crm = createCrm("pd00000001", () => cfg);
  ok((await crm.lookup(PHONE))?.found === false, "pipedrive: read — new phone not found");
  await crm.sync({ phone: PHONE, name: "דנה", stage: "new", source: "מודעה באינסטגרם", first: "אשמח לפרטים" });
  ok(Object.keys(people).length === 1 && calls.some(c => c.url.includes("/leads")), "pipedrive: new lead → person + lead created");
  await crm.sync({ phone: PHONE, name: "דנה", stage: "new" });
  ok(Object.keys(people).length === 1, "pipedrive: same lead again → no duplicate");
  calls = [];
  await crm.sync({ phone: PHONE, stage: "hot", text: "יום שלישי ב-10" });
  ok(calls.some(c => c.url.includes("/notes") && c.body.content.includes("רוצה לקבוע")), "pipedrive: stage change → note");
  // מישהו שכבר קיים ב-CRM לפני שפנה לבוט
  people[555] = { name: "לקוחה ותיקה", phone: "+972509999999" };
  const crm2 = createCrm("pd00000002", () => cfg);
  ok((await crm2.lookup("972509999999"))?.found === true, "pipedrive: read — existing customer found by phone");
  const before = Object.keys(people).length;
  await crm2.sync({ phone: "972509999999", name: "x", stage: "new" });
  ok(Object.keys(people).length === before, "pipedrive: existing customer → note only, no new person");
  reset(() => ({ __status: 401, __body: { error: "unauthorized" } }));
  const bad = await verifyCrm(cfg);
  ok(!bad.ok && /401/.test(bad.error), "pipedrive: wrong token → clear error");
}

// ===== monday.com =====
{
  const items = [];
  reset((url, method, body) => {
    const q = body.query;
    if (q.includes("me {")) return { data: { me: { name: "קטי" }, boards: [{ id: "123456", name: "לידים", columns: [{ id: "name", type: "name" }, { id: "phone_1", type: "phone" }] }] } };
    if (q.includes("items_page_by_column_values")) {
      const hit = items.find(i => body.variables.v.includes(i.phone));
      return { data: { items_page_by_column_values: { items: hit ? [{ id: hit.id, name: hit.name }] : [] } } };
    }
    if (q.includes("create_item")) { const cv = JSON.parse(body.variables.cv); const it = { id: String(900 + items.length), name: body.variables.n, phone: cv.phone_1?.phone }; items.push(it); return { data: { create_item: { id: it.id } } }; }
    if (q.includes("create_update")) return { data: { create_update: { id: "u1" } } };
    return { errors: [{ message: "unknown" }] };
  });
  const cfg = { provider: "monday", token: "b".repeat(40), boardId: "123456" };
  const v = await verifyCrm(cfg);
  ok(v.ok && v.extra.phoneCol === "phone_1", "monday: connect-and-test finds the board and its phone column");
  cfg.phoneCol = v.extra.phoneCol;
  const crm = createCrm("mo00000001", () => cfg);
  await crm.sync({ phone: PHONE, name: "רון", stage: "new" });
  ok(items.length === 1 && items[0].phone === "+" + PHONE, "monday: new lead → item with phone column");
  ok(calls.some(c => c.headers.Authorization === cfg.token), "monday: token sent in Authorization header");
  ok((await verifyCrm({ ...cfg, boardId: "" })).ok === false, "monday: missing board id → clear error");
}

// ===== Fireberry =====
{
  const accounts = [];
  reset((url, method, body, headers) => {
    if (headers.tokenid !== "c".repeat(36)) return { __status: 401, __body: { message: "bad token" } };
    if (url.endsWith("/query")) {
      if (!body.query) return { success: true, data: { Data: [] } };
      const hit = accounts.find(a => body.query.includes(`'${a.telephone1}'`));
      return { success: true, data: { Data: hit ? [{ accountid: hit.id, accountname: hit.accountname }] : [] } };
    }
    if (url.endsWith("/record/account") && method === "POST") { const a = { id: "acc-" + accounts.length, ...body }; accounts.push(a); return { success: true, data: { Record: { accountid: a.id } } }; }
    if (url.includes("/record/account/") && method === "PUT") { const a = accounts.find(x => url.endsWith(x.id)); a.description = body.description; return { success: true }; }
    return { __status: 404 };
  });
  const cfg = { provider: "fireberry", token: "c".repeat(36) };
  ok((await verifyCrm(cfg)).ok, "fireberry: connect-and-test");
  const crm = createCrm("fb00000001", () => cfg);
  await crm.sync({ phone: PHONE, name: "מיכל", stage: "new", first: "היי, שאלה על הסדנה" });
  ok(accounts.length === 1 && accounts[0].telephone1 === "0501234567" && accounts[0].description.includes("הסדנה"), "fireberry: new lead → account with local phone + first message");
  await crm.sync({ phone: PHONE, stage: "invited" });
  await crm.sync({ phone: PHONE, stage: "hot" });
  ok(/הוזמן/.test(accounts[0].description) && /רוצה לקבוע/.test(accounts[0].description), "fireberry: stage history accumulates in description");
  ok(!(await verifyCrm({ ...cfg, token: "d".repeat(36) })).ok, "fireberry: wrong token → error");
}

// ===== Webhook (Make / Zapier / n8n) =====
{
  reset(() => ({ accepted: true }));
  const cfg = { provider: "webhook", url: "https://hook.eu1.make.com/abc123", secret: "s3cret" };
  ok((await verifyCrm(cfg)).ok && calls[0].body.event === "test", "webhook: connect-and-test sends one test event");
  calls = [];
  const crm = createCrm("wh00000001", () => cfg);
  await crm.sync({ phone: PHONE, name: "נועה", stage: "new", source: "כפתור באתר", first: "אשמח לפרטים" });
  const c = calls[0];
  ok(c?.body.event === "lead" && c.body.phone === "+" + PHONE && c.body.phoneLocal === "0501234567" && c.body.source === "כפתור באתר", "webhook: lead payload has phone, local phone and source");
  const sig = "sha256=" + crypto.createHmac("sha256", "s3cret").update(c.raw).digest("hex");
  ok(c.headers["X-CureBot-Signature"] === sig, "webhook: signed with HMAC-SHA256");
  await crm.sync({ phone: PHONE, stage: "hot" });
  ok(calls.at(-1).body.event === "stage" && calls.at(-1).body.stage === "hot", "webhook: stage change → stage event");
  for (const u of ["http://hook.make.com/x", "https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://192.168.1.1/x", "https://169.254.169.254/latest", "https://curebot-whatsapp.onrender.com/api"]) {
    ok(safeWebhookUrl(u) === null, "webhook: blocked internal/unsafe address " + u);
  }
}

// ===== תקלה ב-CRM לא מפילה כלום =====
{
  reset(() => { throw new Error("network down"); });
  const errs = [];
  const crm = createCrm("er00000001", () => ({ provider: "pipedrive", token: "a".repeat(40) }), (e) => errs.push(e));
  await crm.sync({ phone: PHONE, stage: "new" });
  ok(errs.some(e => e && /לא זמין/.test(e)), "CRM down → error shown to owner, bot keeps going");
  ok((await createCrm("er00000002", () => null).lookup(PHONE)) === null, "no CRM connected → nothing happens");
}

if (fails) { console.log(`❌ ${fails} בדיקות CRM נכשלו`); process.exit(1); }
console.log("✅ כל בדיקות ה-CRM עברו");
