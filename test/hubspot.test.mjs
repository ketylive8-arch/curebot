// בדיקת החיבור ל-HubSpot מול שרת HubSpot מדומה: יצירת ליד, עדכון שלבים, ספאם לא נכנס, הטוקן לא יוצא לדפדפן.
import http from "http";
const os = await import("os"), fs = await import("fs");
process.env.DATA_DIR = os.tmpdir() + "/curebot-hs-" + process.pid; fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
Object.assign(process.env, { AI_MODE: "texts", DEBOUNCE_MS: "0", DELAY_FACTOR: "0" });
const calls = [];
let nextId = 100;
const srv = http.createServer((req, res) => {
  let b = ""; req.on("data", c => b += c); req.on("end", () => {
    const body = b ? JSON.parse(b) : null;
    calls.push({ m: req.method, p: req.url, body, auth: req.headers.authorization });
    res.setHeader("Content-Type", "application/json");
    if (req.headers.authorization !== "Bearer pat-good-token-0123456789abcdef") { res.statusCode = 401; return res.end('{"message":"bad token"}'); }
    if (req.url.startsWith("/crm/v3/objects/contacts/search")) return res.end('{"results":[]}');
    if (req.method === "POST" && req.url === "/crm/v3/objects/contacts") return res.end(JSON.stringify({ id: String(nextId++) }));
    res.end("{}");
  });
});
await new Promise(r => srv.listen(0, r));
process.env.HUBSPOT_API = `http://127.0.0.1:${srv.address().port}`;

const { createTenant, setHubspot, publicTenant, getTenant } = await import("../src/tenants.js");
const { WaSession } = await import("../src/session.js");
const { verifyToken } = await import("../src/hubspot.js");
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const now = () => Math.floor(Date.now() / 1000);

ok(!(await verifyToken("pat-wrong-token-0123456789abcdef")).ok, "wrong token → rejected with a clear message");
ok((await verifyToken("pat-good-token-0123456789abcdef")).ok, "good token → accepted");

const { tenant } = createTenant({ name: "קטי", ownerNumber: "0543032349", adminOwned: true, kind: "curemindset" });
setHubspot(tenant.id, "pat-good-token-0123456789abcdef");
const pub = JSON.stringify(publicTenant(getTenant(tenant.id)));
ok(!pub.includes("pat-good") && publicTenant(getTenant(tenant.id)).hubspot.connected, "token never sent to the browser; panel sees 'connected'");

const s = new WaSession(tenant.id);
s.sock = { user: { id: "972543032349:5@s.whatsapp.net" }, sendMessage: async () => {}, readMessages: async () => {}, sendPresenceUpdate: async () => {} };
s.state.me = "972543032349";
const msg = (num, text) => ({ key: { remoteJid: num + "@s.whatsapp.net", fromMe: false, id: "M" + Math.random() }, pushName: "דנה", messageTimestamp: now(), message: { conversation: text } });

await s.handleMessage(msg("972521112233", "היי"));
await s.hub.flush();
const create = calls.find(c => c.m === "POST" && c.p === "/crm/v3/objects/contacts");
ok(create && create.body.properties.phone === "+972521112233" && create.body.properties.firstname === "דנה" && create.body.properties.hs_lead_status === "NEW" && create.body.properties.lifecyclestage === "lead", "new lead → HubSpot contact (phone, name, NEW lead)");
ok(calls.some(c => c.p === "/crm/v3/objects/notes" && /פנייה חדשה בוואטסאפ/.test(c.body.properties.hs_note_body)), "new lead → note with source and first message");

await s.handleMessage(msg("972521112233", "אני מרגישה לחץ כל הזמן ולא ישנה טוב"));
await s.hub.flush();
ok(calls.some(c => c.m === "PATCH" && c.body.properties.hs_lead_status === "IN_PROGRESS"), "invited to intro call → IN_PROGRESS");

await s.handleMessage(msg("972521112233", "אפשר ביום שלישי בערב"));
await s.hub.flush();
ok(calls.some(c => c.m === "PATCH" && c.body.properties.hs_lead_status === "OPEN_DEAL"), "wrote a day/time → OPEN_DEAL (🟢)");
ok(calls.filter(c => c.m === "POST" && c.p === "/crm/v3/objects/contacts").length === 1, "same person → one contact, no duplicates");

const before = calls.length;
await s.handleMessage(msg("972529998877", "שלום אני השליח, החבילה שלך למטה"));
await s.hub.flush();
ok(calls.length === before, "courier / spam → not sent to HubSpot");

setHubspot(tenant.id, "pat-revoked-token-0123456789abcd");
await s.handleMessage(msg("972523334455", "היי"));
await s.hub.flush();
ok(/לא תקף/.test(getTenant(tenant.id).hubspot.error), "revoked token → bot keeps answering, panel shows 'reconnect HubSpot'");

srv.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
console.log(process.exitCode ? "❌ נכשל" : "✅ בדיקות HubSpot עברו"); process.exit(process.exitCode || 0);
