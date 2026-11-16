// בדיקת "צרי לי שאלות ותשובות": זיהוי סוג העסק, מילוי מהפרטים, וסימון [להשלים] — שלעולם לא נשלח ללקוח.
process.env.AI_MODE = "texts";
const { templateDraft, generateDraft, detectIndustry } = await import("../src/generate.js");
const { businessReply, sanitizeProfile } = await import("../src/business.js");
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };

const yoga = sanitizeProfile({ kind: "business", businessName: "סטודיו נועה", businessType: "סטודיו ליוגה", about: "שיעורי יוגה לנשים בחיפה. קבוצות קטנות.", hours: "א׳-ה׳ 8-21", bookingLink: "calendly.com/noa" });
const d = await generateDraft(yoga);
ok(d.source === "templates" && d.industry === "fitness", "yoga studio → fitness questions (free templates)");
ok(d.faq.length >= 7, "draft has " + d.faq.length + " questions");
ok(d.faq.find(f => f.q === "מה אתם עושים?").a.includes("יוגה"), "answers filled from what the owner wrote");
ok(d.faq.find(f => f.q === "איך קובעים?").a.includes("calendly.com/noa"), "booking link used");
ok(d.faq.some(f => /\[להשלים/.test(f.a)), "missing info marked [להשלים]");
ok(d.greeting.includes("סטודיו נועה") && d.handoffText.includes("סטודיו נועה"), "greeting + handoff written");

const cases = [["מטפלת רגשית בשיטת NLP", "therapy"], ["קוסמטיקאית ובניית ציפורניים", "beauty"], ["משרד עורכי דין לדיני משפחה", "legal"], ["קייטרינג ומגשי אירוח", "food"], ["אינסטלטור ושיפוצים כלליים", "home"], ["מורה פרטית למתמטיקה לבגרות", "education"], ["צלם אירועים", "photo"], ["חנות אונליין לתכשיטים", "shop"]];
for (const [type, want] of cases) ok(detectIndustry({ businessType: type })?.key === want, `"${type}" → ${want}`);
ok(!detectIndustry({ businessType: "עוד משהו כללי לגמרי" }) || detectIndustry({ businessType: "עוד משהו כללי לגמרי" }).key !== "legal", "the word 'עוד' does not mean lawyer");

// a saved profile with an unfinished answer → bot never sends the placeholder
const p = sanitizeProfile({ ...yoga, faq: [{ q: "כמה עולה שיעור?", a: "[להשלים: מחיר]" }, { q: "יש חניה?", a: "כן, חניה חינם." }] });
const r1 = businessReply(p, "כמה עולה שיעור?", { history: [{}, {}] });
ok(!/\[להשלים/.test(r1.reply) && r1.unanswered, "unfinished answer is NOT sent — handed over instead");
const r2 = businessReply(p, "יש לכם חניה?", { history: [{}, {}] });
ok(r2.reply.includes("חניה חינם"), "finished answers still work");
console.log(process.exitCode ? "❌ נכשל" : "✅ כל בדיקות היצירה עברו");
