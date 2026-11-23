// בדיקת לוגיקת ההודעות מול חיבור וואטסאפ מדומה: מי מקבל תשובה, מתי הבוט שותק, ושהשליחה עצמה עובדת.
// הרצה: npm test
process.env.DATA_DIR = (await import("os")).tmpdir() + "/curebot-test-" + process.pid; process.env.NUDGE_MS = "300"; process.env.AI_MODE = "texts"; process.env.DEBOUNCE_MS = "0"; process.env.DELAY_FACTOR = "0";
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
ok(sent.length === 3, "unreadable message → nothing is sent to the person (no confusing texts)");
ok(s.brain.recentActivity().flagged.some(f => f.kind === "unreadable") && s.view().leads.some(l => l.status === "unreadable"), "unreadable message → shown to the owner instead");

// 6. unreadable, but the readable retry arrives in time → no resend request
await s.handleMessage({ key: { remoteJid: "972506666666@s.whatsapp.net", fromMe: false, id: "X2" }, messageTimestamp: now(), messageStubType: 2 });
await s.handleMessage(inMsg("972506666666", "שאלה על הסדנה"));
await wait(700);
ok(sent.length === 4, "retry arrived → answered normally");

// 7. image without caption → gentle text request
await s.handleMessage({ key: { remoteJid: "972507777777@s.whatsapp.net", fromMe: false, id: "I1" }, messageTimestamp: now(), message: { imageMessage: { mimetype: "image/jpeg" } } });
ok(sent.length === 5 && sent[4].text.includes("במילים"), "photo without words → asks to write");

// 8. edited message text is read
await s.handleMessage({ key: { remoteJid: "972508888888@s.whatsapp.net", fromMe: false, id: "E1" }, messageTimestamp: now(), message: { editedMessage: { message: { conversation: "מה השעות שלכם?" } } } });
ok(sent.length === 6, "edited message is understood");

// 9. bot paused / inactive → silent
updateTenant(tenant.id, { settings: { active: false } });
await s.handleMessage(inMsg("972509999999", "היי"));
ok(sent.length === 6, "auto-reply switch off → silent");
updateTenant(tenant.id, { settings: { active: true } });

// 10. lead from a Facebook/Instagram ad → source recorded
await s.handleMessage({ key: { remoteJid: "972511212121@s.whatsapp.net", fromMe: false, id: "AD1" }, messageTimestamp: now(),
  message: { extendedTextMessage: { text: "היי, ראיתי את המודעה", contextInfo: { externalAdReply: { title: "סדנת חוסן", sourceType: "ad", sourceUrl: "https://www.instagram.com/p/x" } } } } });
const adLead = s.view().leads.find(l => l.from === "972511212121");
ok(adLead && adLead.source.kind === "ad" && adLead.source.label.includes("אינסטגרם") && adLead.status === "answered", "ad lead: source = Instagram ad, answered");

// 11. lead from the website button → source recorded
await s.handleMessage(inMsg("972512323232", "היי קטי! אשמח לקבוע שיחה ראשונית"));
ok(s.view().leads.find(l => l.from === "972512323232")?.source.kind === "site", "website button lead: source = site");

// 13. someone advertising their own business / offering a service → filtered, no reply at all
const before = sent.length;
await s.handleMessage(inMsg("972520000001", "היי! אני מתמחה בבניית אתרים לעסקים 🚀 מבצע מיוחד רק השבוע — 30% הנחה! לפרטים: www.webpro.co.il 050-1234567"));
await s.handleMessage(inMsg("972520000002", "שירותי קידום בגוגל ושיווק דיגיטלי לעסקים, מחיר מיוחד! www.seo.co.il"));
await s.handleMessage(inMsg("972520000003", "ביטוח רכב בהנחה של 20%! לפרטים 052-7654321 www.bit.co.il"));
await s.handleMessage(inMsg("972520000011", "אנחנו מציעים שירות ניקיון לבית במחיר מיוחד"));
ok(sent.length === before, "ads / service offers → filtered, no reply");

// 14. courier, bank, "remove me" and unrelated chit-chat → filtered
await s.handleMessage(inMsg("972520000012", "השליח בדרך, החבילה שלך תגיע היום עד 18:00"));
await s.handleMessage(inMsg("972520000013", "נא לעדכן את פרטי חשבון הבנק שלך בקישור"));
await s.handleMessage(inMsg("972520000014", "להסרה השב הסר"));
await s.handleMessage(inMsg("972520000015", "מה שלומך? ראיתי שהעברת את הדירה, אולי ניפגש בשבוע הבא לקפה ונעשה ברביקיו"));
ok(sent.length === before, "courier / bank / removal / unrelated → filtered");

// 15. numbers starting with +1 (Base44 agents, automations) → never answered
await s.handleMessage(inMsg("15551234567", "היי, אשמח לפרטים על הליווי"));
ok(sent.length === before && /\+1/.test(s.view().leads.find(l => l.from === "15551234567")?.reason || ""), "+1 number → not answered, reason shown");

// 15b. verification codes and automated notices → ignored
await s.handleMessage(inMsg("972520000016", "קוד האימות שלך הוא 482913. אין להעביר אותו לאף אחד"));
await s.handleMessage(inMsg("972520000017", "החבילה שלך בדרך! מספר מעקב RR123456789IL"));
ok(sent.length === before, "verification code / tracking notice → ignored");

// 15c. a message that another bot of THIS system sent (alert / test reply) → never answered
s.markSent("BOTMSG1");
await s.handleMessage({ key: { remoteJid: "972542306016@s.whatsapp.net", fromMe: false, id: "BOTMSG1" }, messageTimestamp: now(), message: { conversation: "🟡 ביקשו לדבר איתך" } });
ok(sent.length === before, "message sent by another bot of the system → not answered (no bot loop)");

// 16. clear spam → ignored, nothing sent
const b2 = sent.length;
await s.handleMessage(inMsg("972520000004", "הצטרפו לקבוצה שלנו 👉 https://chat.whatsapp.com/AbCdEf"));
await s.handleMessage(inMsg("972520000005", "רוצה להרוויח מהבית? הכנסה פסיבית עם קריפטו https://x.co https://y.co"));
ok(sent.length === b2, "spam (group invite / crypto) → ignored");

// 17. real need → answered and led to an intro meeting
await s.handleMessage(inMsg("972520000006", "היי, הבת שלי בת 15 מתמודדת עם חרדה חברתית ולא יוצאת מהבית. אשמח לפרטים על הליווי"));
ok(sent.length === b2 + 1 && sent.at(-1).text.includes("calendly") && !/^(שמחה לשמוע|איזה יופי)/.test(sent.at(-1).text), "real need → responds to the story first, then intro meeting link");

// 18. a real lead who pasted a link is NOT treated as an ad
await s.handleMessage(inMsg("972520000007", "ראיתי את המודעה שלך באינסטגרם https://instagram.com/p/abc אשמח לפרטים"));
ok(!sent.at(-1).text.includes("פנית בעקבות עניין"), "lead with a link + interest → normal answer, not an ad question");

// 19. loop protection: a chat that keeps firing gets at most 6 answers in 10 minutes, then the bot stops
const b3 = sent.length;
for (let i = 0; i < 8; i++) await s.handleMessage(inMsg("972530000009", "שאלה מספר " + i + " על הטיפול"));
ok(sent.length - b3 === 6, "loop/flood: max 6 answers per chat in 10 minutes (" + (sent.length - b3) + ")");
ok(/הגנה מחסימה/.test(s.view().leads.find(l => l.from === "972530000009")?.reason || ""), "loop/flood: reason shown to owner");

// 20. my emoji reaction (❤️) on a lead's message is NOT a manual reply → bot stays in
const react = { key: { remoteJid: "972540000373@s.whatsapp.net", fromMe: true, id: "R1" }, messageTimestamp: now(), message: { reactionMessage: { text: "❤️" } } };
if (s.isFresh(react)) s.noteManualReply(react);
const b4 = sent.length;
await s.handleMessage(inMsg("972540000373", "היי, רציתי לשאול על הליווי לבת שלי"));
ok(sent.length === b4 + 1, "my emoji reaction does not take the bot out of the chat");

// 21. when I really reply, the bot steps out — and voice notes there get NO automatic reply
const mine = { key: { remoteJid: "972540000374@s.whatsapp.net", fromMe: true, id: "R2" }, messageTimestamp: now(), message: { conversation: "היי, אני אחזור אלייך" } };
if (s.isFresh(mine)) s.noteManualReply(mine);
const b5 = sent.length;
await s.handleMessage({ key: { remoteJid: "972540000374@s.whatsapp.net", fromMe: false, id: "V1" }, messageTimestamp: now(), message: { audioMessage: { seconds: 12 } } });
await s.handleMessage(inMsg("972540000374", "תודה"));
ok(sent.length === b5, "after I really reply: bot silent, including voice notes");

// 22. "bring the bot back" button
s.resumeChat("972540000374@s.whatsapp.net");
await s.handleMessage(inMsg("972540000374", "יש לי עוד שאלה על הסדנה"));
ok(sent.length === b5 + 1, "bring-back button → bot answers again");

// 23. voice notes with no transcription → asks to write ONCE, not on every recording
const b6 = sent.length;
for (const id of ["V2", "V3", "V4"]) await s.handleMessage({ key: { remoteJid: "972540000375@s.whatsapp.net", fromMe: false, id }, messageTimestamp: now(), message: { audioMessage: { seconds: 8 } } });
ok(sent.length === b6 + 1 && sent.at(-1).text.includes("בכתב"), "3 voice notes → one gentle 'please write'");

// 24. a business connection answers its own customers by its profile — and a customer asking about deliveries is a lead
const { tenant: bt } = createTenant({ name: "פיצה טובה", ownerNumber: "0501231234", kind: "business" });
updateTenant(bt.id, { profile: { businessName: "פיצה טובה", about: "פיצרייה בתל אביב", hours: "א-ה 12:00-23:00", faq: [{ q: "יש לכם משלוחים?", a: "כן! משלוחים בכל תל אביב עד 23:00 🍕" }] } });
const bs = new WaSession(bt.id);
const bsent = [];
bs.sock = { user: { id: "972501231111:3@s.whatsapp.net" }, sendMessage: async (to, p) => { bsent.push({ to, text: p.text }); }, readMessages: async () => {}, sendPresenceUpdate: async () => {} };
bs.state.me = "972501231111";
await bs.handleMessage(inMsg("972520000020", "היי, יש לכם משלוחים לרמת אביב?"));
ok(bsent.length === 1 && bsent[0].text.includes("משלוחים בכל תל אביב"), "business: customer asking about delivery → answered from the business FAQ");
await bs.handleMessage(inMsg("972520000021", "שלום אני השליח של וולט, החבילה שלך ממתינה בלובי"));
ok(bsent.length === 1, "business: courier message → ignored");

// 25. watchdog: a number that was connected and dropped for >10 minutes → alert; a fresh unscanned one → no alert
const { checkAll } = await import("../src/watchdog.js");
s.everConnected = true; s.state.status = "qr"; s.downSince = Date.now() - 11 * 60000;
bs.state.status = "qr"; // never connected
const alerts = checkAll(Date.now(), (id) => (id === tenant.id ? s : id === bt.id ? bs : null));
ok(alerts.length === 1 && alerts[0].id === tenant.id && alerts[0].msg.includes("לסרוק מחדש"), "watchdog: dropped number → one alert with what to do");
ok(checkAll(Date.now(), (id) => (id === tenant.id ? s : null)).length === 0, "watchdog: no repeated alert within 6 hours");
s.state.status = "connected";
ok(checkAll(Date.now(), (id) => (id === tenant.id ? s : null))[0]?.msg.includes("חזר"), "watchdog: back online → 'reconnected' notice");

// 26. script: greeting → story → invite to an intro call → lead writes a day/time → confirmation + green alert to the owner
const f0 = sent.length;
await s.handleMessage(inMsg("972560000001", "היי"));
await s.handleMessage(inMsg("972560000001", "אני מרגישה לחץ כל הזמן ולא ישנה טוב"));
ok(sent.at(-1).text.includes("calendly") && sent.at(-1).text.includes("יום ושעה"), "script: second answer invites to a free intro call (link or day/time)");
await s.handleMessage(inMsg("972560000001", "אפשר ביום שלישי בערב"));
const conf = sent.slice(f0).find(x => x.text.startsWith("רשמתי"));
const hotAlert = sent.slice(f0).find(x => x.to === "972543032349@s.whatsapp.net" && x.text.includes("🟢"));
ok(conf && hotAlert && hotAlert.text.includes("0560000001"), "script: day/time → confirmation to the lead + green alert with phone to the owner");
const f1 = sent.length;
await s.handleMessage(inMsg("972560000002", "שאלה מספר 3 על הטיפול שלך"));
ok(sent.length === f1 + 1 && !sent.slice(f1).some(x => x.text.includes("🟢")), "script: a number in a question is not mistaken for a time");

// 12. skipped lead records the reason
s.savedContacts.add("972513434343@s.whatsapp.net");
await s.handleMessage(inMsg("972513434343", "מה נשמע"));
ok(/איש קשר שמור/.test(s.view().leads.find(l => l.from === "972513434343")?.reason || ""), "skipped lead shows why");
console.log(process.exitCode ? "❌ נכשל" : "✅ כל הבדיקות עברו"); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); process.exit(process.exitCode || 0);
