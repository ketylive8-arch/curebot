// ============================================================
//  פרופיל העסק — כך כל חיבור יודע על איזה עסק הוא עונה ואיך.
//  שני סוגים:
//   • "curemindset" — השיטה של קטי (הפרומפט הקליני והמנוע המקומי הקיימים).
//   • "business"    — כל עסק אחר: עונה רק לפי מה שבעל/ת העסק כתב/ה כאן
//                     (פרטי העסק + שאלות ותשובות). לא ממציא מידע.
//  בלי OpenAI (מצב טקסטים, חינמי): התשובות נבחרות מתוך הטקסטים האלה.
//  עם OpenAI: הפרופיל הופך להנחיות, והתשובות זורמות — אבל עדיין רק לפיו.
// ============================================================

const LIM = { short: 80, mid: 300, long: 1200, faq: 30 };
const clip = (v, n) => String(v ?? "").trim().slice(0, n);

export function defaultProfile(kind, name = "") {
  return {
    kind: kind === "curemindset" ? "curemindset" : "business",
    businessName: clip(name, LIM.short),
    businessType: "",
    about: "",
    hours: "",
    address: "",
    bookingLink: "",
    website: "",
    greeting: "",
    handoffText: "",
    faq: []
  };
}

/** ניקוי קלט מהדפדפן: אורכים מוגבלים, קישורים רק http(s), עד 30 שאלות. */
export function sanitizeProfile(input, prev) {
  const p = { ...(prev || defaultProfile("business")) };
  if (!input || typeof input !== "object") return p;
  if (input.kind === "curemindset" || input.kind === "business") p.kind = input.kind;
  for (const k of ["businessName", "businessType", "hours", "address"]) if (input[k] !== undefined) p[k] = clip(input[k], LIM.short);
  for (const k of ["greeting", "handoffText"]) if (input[k] !== undefined) p[k] = clip(input[k], LIM.mid);
  if (input.about !== undefined) p.about = clip(input.about, LIM.long);
  for (const k of ["bookingLink", "website"]) {
    if (input[k] === undefined) continue;
    const v = clip(input[k], LIM.mid);
    p[k] = !v ? "" : /^https?:\/\//i.test(v) ? v : "https://" + v.replace(/^\/+/, "");
  }
  if (Array.isArray(input.faq)) {
    p.faq = input.faq
      .map(f => ({ q: clip(f?.q, LIM.mid), a: clip(f?.a, LIM.long) }))
      .filter(f => f.q && f.a)
      .slice(0, LIM.faq);
  }
  return p;
}

// ── הבנת שאלה בעברית בלי AI: מילים משמעותיות, בלי אותיות שימוש ומילות קישור ──
const STOP = new Set("את של על יש אני אתם אתן מה איך זה זו כן לא אם גם רק עם או הם הן היא הוא לי לך לכם אפשר רוצה רציתי שאלה בבקשה תודה היי שלום הי מתי איפה כמה למה האם יהיה יש לכם עוד".split(" "));
function tokens(s) {
  return String(s || "").toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map(w => (w.length > 3 && /^[והבלמשכ]/.test(w) ? w.slice(1) : w))
    .filter(w => w.length > 1 && !STOP.has(w));
}
function bestFaq(faq, text) {
  const tt = new Set(tokens(text));
  let best = null, bestScore = 0;
  for (const f of faq || []) {
    const qt = [...new Set(tokens(f.q))];
    if (!qt.length) continue;
    const hit = qt.filter(w => tt.has(w) || [...tt].some(x => x.length > 3 && (x.includes(w) || w.includes(x)))).length;
    const score = hit / qt.length;
    if ((hit >= 2 || (hit >= 1 && score >= 0.5)) && score > bestScore) { best = f; bestScore = score; }
  }
  return best;
}

const CRISIS = ["אובדנ", "לפגוע בעצמי", "לא רוצה לחיות", "להתאבד", "אתאבד", "פגיעה עצמית", "לשים סוף", "אין טעם לחיות"];
const HUMAN = ["לדבר עם", "בן אדם", "בנאדם", "נציג", "אנושי", "תתקשרו", "תחזרו אליי", "שיחזרו אליי", "טלפון שלכם"];
const has = (t, list) => list.some(w => t.includes(w));

/**
 * מנוע הטקסטים לעסק (חינמי, בלי AI). מחזיר את אותו מבנה כמו המוח הקליני.
 * unanswered=true: לא נמצאה תשובה בטקסטים — מסומן לבעל/ת העסק כדי להוסיף שאלה.
 */
export function businessReply(p, userText, chat) {
  const t = String(userText || "").toLowerCase();
  const name = p.businessName || "העסק";
  const first = !chat || (chat.history?.length || 0) === 0;
  const R = (reply, extra = {}) => ({ reply, ended: false, alert: false, human: false, infoCard: false, unanswered: false, ...extra });
  const booking = p.bookingLink ? `\nלקביעה: ${p.bookingLink}` : "";

  if (has(t, CRISIS)) {
    return R("שמחים שכתבת, ואת/ה לא לבד 💛 אם זה דחוף או קשה מאוד עכשיו — ער\"ן זמינים 24/7 בטלפון 1201, ובמצב חירום מד\"א 101. נעביר את הפנייה גם לצוות.", { alert: true, human: true });
  }
  if (has(t, HUMAN)) {
    return R(p.handoffText || `בשמחה — אני מעבירה את הפנייה ל${name}, ויחזרו אלייך בהקדם 🙏`, { human: true });
  }

  const hello = first ? (p.greeting || `היי! כאן ${name} 👋`) : "";
  const join = (body) => (hello ? `${hello}\n\n${body}` : body);

  const f = bestFaq(p.faq, t);
  if (f) return R(join(f.a));

  if (p.hours && /שעות|פתוח|פתוחים|סוגרים|סגורים|עד מתי|באיזה ימים|ימי פעילות/.test(t)) return R(join(`שעות הפעילות: ${p.hours}`));
  if (p.address && /איפה|כתובת|מיקום|להגיע|נמצאים/.test(t)) return R(join(`אנחנו נמצאים ב: ${p.address}`));
  if (p.bookingLink && /לקבוע|תור|פגישה|להזמין|הזמנה|פנוי|זמינות/.test(t)) return R(join(`אפשר לקבוע כאן, בכמה לחיצות:\n${p.bookingLink}`));
  if (p.website && /אתר|עוד פרטים|מידע נוסף|לקרוא/.test(t)) return R(join(`כל הפרטים באתר: ${p.website}`));

  // הודעה ראשונה כללית ("היי", "שאלה") — פתיחה חמה ושאלה אחת
  if (first && tokens(t).length <= 2) {
    const intro = p.about ? `${p.about.split(/[.\n]/)[0].trim()}.` : "";
    return R(`${p.greeting || `היי! כאן ${name} 👋`}${intro ? "\n" + intro : ""}\nאיך אפשר לעזור?`);
  }

  // אין תשובה בטקסטים — לא ממציאים. מעבירים לצוות ומסמנים לבעל/ת העסק.
  return R(join(`תודה שכתבת! את זה אני רוצה שיענו לך בדיוק — העברתי לצוות של ${name} ויחזרו אלייך בהקדם.${booking}`), { unanswered: true });
}

/** הנחיות ל-OpenAI מתוך הפרופיל — כשיש קרדיט. */
export function businessPrompt(p) {
  const lines = [
    `את/ה המענה בוואטסאפ של "${p.businessName || "העסק"}"${p.businessType ? ` (${p.businessType})` : ""}.`,
    p.about && `על העסק: ${p.about}`,
    p.hours && `שעות פעילות: ${p.hours}`,
    p.address && `כתובת: ${p.address}`,
    p.bookingLink && `קישור לקביעה/הזמנה: ${p.bookingLink}`,
    p.website && `אתר: ${p.website}`,
    p.greeting && `הודעת פתיחה מועדפת: ${p.greeting}`,
    p.faq?.length && "שאלות ותשובות (המידע היחיד שמותר להסתמך עליו):\n" + p.faq.map(f => `ש: ${f.q}\nת: ${f.a}`).join("\n"),
    "",
    "כללים:",
    "- עברית טבעית וחמה, 2-4 שורות, שאלה אחת לכל היותר. בלי שפה של רובוט.",
    "- לעולם אל תמציא/י מחירים, זמינות, שירותים או פרטים שלא מופיעים למעלה.",
    "- אם אין לך את המידע: אמור/י שמעבירים לצוות ויחזרו בהקדם, והוסף/י בשורה נפרדת [[HUMAN]].",
    `- אם מבקשים לדבר עם אדם: ${p.handoffText ? `"${p.handoffText}"` : "אמור/י שמעבירים לצוות"} והוסף/י בשורה נפרדת [[HUMAN]].`,
    "- מחשבות אובדניות או סכנה מיידית: עני/ה בחום, הפני/ה לער\"ן 1201 או מד\"א 101, והוסף/י בשורה נפרדת [[ALERT]].",
    "- בסוף שיחה טבעי (נקבע, נפרדו): הוסף/י בשורה נפרדת [[END]]. התווים האלה רק בשורה נפרדת."
  ];
  return lines.filter(l => l !== false && l !== undefined && l !== null && l !== 0).join("\n");
}
