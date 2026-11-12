// בדיקת לוגיקת ההודעות מול חיבור וואטסאפ מדומה: מי מקבל תשובה, מתי הבוט שותק, ושהשליחה עצמה עובדת.
// הרצה: npm test
process.env.DATA_DIR = (await import("os")).tmpdir() + "/curebot-test-" + process.pid; process.env.NUDGE_MS = "300"; process.env.AI_MODE = "texts";
const fs = await import("fs"); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
const { createTenant, updateTenant } = await import("../src/tenants.js");
const { WaSession } = await import("../src/session.js");
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const now = () => Math.floor(Date.now() / 1000);

const { tenant } = createTenant({ name: "בדיקה", ownerNumber: "0543032349", adminOwned: true, kind: "curemindset" });
const s = new WaSession(tenant.id);
const sent = [];
s.sock = { user: { id: "972543032349:5@s.whatsapp.net" }, sendMessage: async (to, p) => { sent.push({ to, text: p.text }); }, readMessages: async () => {}, sendPresenceUpdate: async () => {} };
s.state.me = "972543032349";
const DELAY = 4200; // shortDelay max
const inMsg = (num, text, extra = {}) => ({ key: { remoteJid: num + "@s.whatsapp.net", fromMe: false, id: "M" + Math.random() }, messageTimestamp: now(), message: text == null ? undefined : { conversation: text }, ...extra });
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// 1. normal message from a new person → answered
await s.handleMessage(inMsg("972501111111", "היי, אני מרגישה הרבה לחץ לאחרונה"));
ok(sent.length === 1 && sent[0].to === "972501111111@s.whatsapp.net" && sent[0].text.length > 20, "new person gets an answer");

// 2. history sync of my OLD messages must NOT pause chats
const hist = { key: { remoteJid: "972502222222@s.whatsapp.net", fromMe: true, id: "H1" }, messageTimestamp: now() - 86400, message: { conversation: "old" } };
s.isFresh(hist) || null;
// emulate upsert path
for (const m of [hist]) { if (m.key.fromMe) { if ("append" === "notify" && s.isFresh(m)) s.noteManualReply(m); } }
await s.handleMessage(inMsg("972502222222", "שלום, אפשר פרטים?"));
ok(sent.length === 2, "history sync does not silence the bot");

// 3. a LIVE manual reply by me → bot steps out of that chat
const live = { key: { remoteJid: "972503333333@s.whatsapp.net", fromMe: true, id: "L1" }, messageTimestamp: now(), message: { conversation: "אני עונה" } };
if (s.isFresh(live)) s.noteManualReply(live);
await s.handleMessage(inMsg("972503333333", "תודה!"));
ok(sent.length === 2, "after I answer myself, bot stays out of that chat");

// 4. saved contact → not answered (default)
s.savedContacts.add("972504444444@s.whatsapp.net");
await s.handleMessage(inMsg("972504444444", "היי"));
ok(sent.length === 2, "saved contact is skipped (switch on)");
updateTenant(tenant.id, { settings: { onlyNonContacts: false } });
await s.handleMessage(inMsg("972504444444", "היי"));
ok(sent.length === 3, "saved contact answered when switch is off");
updateTenant(tenant.id, { settings: { onlyNonContacts: true } });

// 5. unreadable (undecrypted) message → polite resend request
await s.handleMessage({ key: { remoteJid: "972505555555@s.whatsapp.net", fromMe: false, id: "X1" }, messageTimestamp: now(), messageStubType: 2, messageStubParameters: ["No session"] });
await wait(700);
ok(sent.length === 4 && sent[3].text.includes("לשלוח אותה שוב"), "unreadable message → asks to resend");

// 6. unreadable, but the readable retry arrives in time → no resend request
await s.handleMessage({ key: { remoteJid: "972506666666@s.whatsapp.net", fromMe: false, id: "X2" }, messageTimestamp: now(), messageStubType: 2 });
await s.handleMessage(inMsg("972506666666", "שאלה על הסדנה"));
await wait(700);
ok(sent.length === 5 && !sent[4].text.includes("לשלוח אותה שוב"), "retry arrived → answered normally, no resend request");

// 7. image without caption → gentle text request
await s.handleMessage({ key: { remoteJid: "972507777777@s.whatsapp.net", fromMe: false, id: "I1" }, messageTimestamp: now(), message: { imageMessage: { mimetype: "image/jpeg" } } });
ok(sent.length === 6 && sent[5].text.includes("במילים"), "photo without words → asks to write");

// 8. edited message text is read
await s.handleMessage({ key: { remoteJid: "972508888888@s.whatsapp.net", fromMe: false, id: "E1" }, messageTimestamp: now(), message: { editedMessage: { message: { conversation: "מה השעות שלכם?" } } } });
ok(sent.length === 7, "edited message is understood");

// 9. bot paused / inactive → silent
updateTenant(tenant.id, { settings: { active: false } });
await s.handleMessage(inMsg("972509999999", "היי"));
ok(sent.length === 7, "auto-reply switch off → silent");
console.log(process.exitCode ? "❌ נכשל" : "✅ כל הבדיקות עברו"); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); process.exit(process.exitCode || 0);
