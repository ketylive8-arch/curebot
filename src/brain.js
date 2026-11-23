import { SYSTEM_PROMPT, CALENDLY, SITE } from "./prompt.js";
import { classifyMessage, isYes, isNo } from "./classify.js";
import { businessReply, businessPrompt } from "./business.js";

// ============================================================
//  תסריט השיחה של CureMindset (מנוע הטקסטים — עובד גם בלי OpenAI).
//  המטרה: להוביל כל פונה לשיחת היכרות עם קטי, בלי לחץ ובקצב של שיחה אנושית.
//   שלב 1 — פתיחה:  קבלה חמה + שאלה אחת: "בשבילך או בשביל מישהו קרוב?"
//   שלב 2 — הקשבה:  שיקוף של מה שסיפרו (לפי הנושא) + שאלה אחת שמעמיקה.
//   שלב 3 — הזמנה:  משפט קצר על איך קטי עובדת + הזמנה לשיחת היכרות ללא עלות:
//                   קישור לקלנדלי, או "כתבי לי יום ושעה ואעביר לקטי".
//   שלב 4 — סגירה:  כתבו יום/שעה → אישור + התראה לקטי (ליד חם) · "קבעתי" → תודה
//                   מחיר → הסבר + קישור · "אחשוב" → בלי לחץ, הדלת פתוחה · "לא" → פרידה יפה.
//  לא מאבחנים, לא מבטיחים תוצאות, לא נוקבים במחיר. מצוקה / בקשה לאדם — קודם לכל.
// ============================================================
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const TOPICS = [
  { // הורה / ילד / נוער
    words: ["בן שלי", "בת שלי", "הבן", "הבת", "הילד", "הילדה", "ילד שלי", "נוער", "מתבגר", "מתבגרת", "בית ספר", "ילדים", "חברתי", "ביישן", "ביישנית", "מופנם", "לא מצליח להתחבר"],
    reflect: ["אני שומעת כמה את דואגת, וזה יפה כל כך 💛 קושי חברתי או חוסר ביטחון בגיל הזה זה בדיוק מקום שאפשר לעבוד איתו — בעדינות ובקצב של הילד/ה.",
      "כמה טוב שאת מחפשת בשבילו/ה 💛 על דברים כאלה קטי עובדת הרבה — לבנות ביטחון וחוסן בלי לחץ, אישית או בקבוצה לנוער."],
    ask: "בן/בת כמה, ומה הכי מדאיג אותך עכשיו?",
    how: "עם ילדים ונוער קטי מתחילה תמיד בשיחה עם ההורה — להבין את התמונה ולבנות יחד את הדרך הנכונה."
  },
  { // כאבים / גוף
    words: ["כאב", "מיגרנ", "כאבים", "בגוף", "פסיכוסומט", "מתח שרירים", "בטן", "לחץ דם", "שינה", "נדודי שינה"],
    reflect: ["אוי, אני שומעת אותך 💛 לגוף יש הרבה פעמים שפה רגשית, וקטי עובדת על השורש הרגשי שמאחורי התסמין — לצד המעקב הרפואי, לא במקומו.",
      "נשמע מתיש, ואני איתך 💛 לא פעם הגוף מחזיק רגש שלא קיבל מקום, ושם בדיוק העבודה של קטי."],
    ask: "כמה זמן זה כבר איתך?",
    how: "קטי עובדת עם NLP ועבודה סומטית, בתהליך קצר וממוקד שנוגע במה שמאחורי התסמין."
  },
  { // מסכים / התמכרות
    words: ["מסך", "מסכים", "טלפון", "התמכר", "משחקים", "גיימינג", "טיקטוק"],
    reflect: ["מובן לגמרי 💛 מאחורי המסך לרוב מסתתר ויסות רגשי שחסר — וכשמחזקים את החוסן, הצורך לברוח למסך פוחת מעצמו.",
      "אני מכירה את זה טוב 💛 המסך הוא בדרך כלל הפתרון, לא הבעיה — הוא ממלא חלל רגשי."],
    ask: "זה בשבילך או בשביל מישהו בבית?",
    how: "קטי עובדת על החוסן הרגשי שמתחת להרגל, וזה מה שמזיז את זה באמת."
  },
  { // טראומה
    words: ["טראומ", "עבר קשה", "פגעו בי", "שכול", "אלימות", "פוסט טראומה", "חרדה מאז"],
    reflect: ["תודה שנתת בי אמון לכתוב את זה 💛 עם דברים כאלה עובדים בעדינות רבה, בקצב שלך ובמקום בטוח — בלי לחפור.",
      "אני מחזיקה איתך את מה שכתבת 💛 יש דרך עדינה ובטוחה לגעת בזה, לאט ובשליטה שלך."],
    ask: "",
    how: "זה מהלב של העבודה של קטי, ונכון לעשות את זה יחד איתה אישית."
  },
  { // חרדה / לחץ / דימוי / תקיעות
    words: ["חרד", "לחץ", "פאניק", "פניקה", "מתח", "תקוע", "תקועה", "דיכא", "עצב", "ביטחון", "דימוי", "פחד", "שפל", "נגמר לי הכוח", "אין לי כוח", "שחוק", "שחוקה", "עייפ", "בודד", "בודדה", "לבד", "קשה לי", "מרגישה", "מרגיש"],
    reflect: ["אני שומעת אותך, וזה אמיץ באמת לכתוב את זה 💛 מה שאת מתארת הוא דפוס — ודפוס אפשר לרכך, הוא לא מי שאת.",
      "תודה ששיתפת, זה לא מובן מאליו 💛 מה שאת מרגישה הגיוני לגמרי, וזה גם נִתן לשינוי.",
      "קשה, ואני איתך בזה 💛 הרבה פעמים מה שמרגיש 'ככה אני תמיד' הוא דפוס נלמד — והמוח יודע ללמוד גם דרך חדשה."],
    ask: "איפה זה הכי מתבטא אצלך — בגוף, במחשבות, בשינה?",
    how: "קטי עובדת על השורש של הדפוס, לא רק להרגיע לרגע — בתהליך קצר וממוקד."
  }
];
const topicOf = (t) => TOPICS.find(x => x.words.some(w => t.includes(w))) || null;

// יום/חלק ביום, או שעה בפורמט של שעה ("ב-10", "10:30", "בשעה 5") — לא כל מספר בהודעה.
const TIME_RE = /(^|[\s,.])(ב?יום )?(ראשון|שני|שלישי|רביעי|חמישי|שישי|מוצ"ש|מוצאי שבת)|מחר|מחרתיים|היום|השבוע|בבוקר|בצהריים|אחה"צ|אחר הצהריים|בערב|בשעה\s*\d|ב-?\s?([01]?\d|2[0-3])\b|\b([01]?\d|2[0-3]):[0-5]\d/;
const BOOKED_RE = /קבעתי|נקבע|נרשמתי|בחרתי (זמן|שעה|מועד)|הזמנתי (שיחה|פגישה)|שריינתי/;
const HESITATE_RE = /אחשוב|אני אחשוב|לא בטוח|לא יודעת|לא יודע|אין לי זמן|יקר|אחר כך|בהמשך|לא עכשיו|אחזור אלי/;
const NO_RE = /^(לא|לא תודה|ממש לא|לא רלוונטי|לא מעוניינ|תודה לא)/;
const YES_RE = /^(כן|בטח|ברור|כמובן|אשמח|מעוניינ|נשמע טוב|למה לא|קדימה|בשמחה|בא לי|רוצה|אוקיי|אוקי|סגור|יאללה)/;

function inviteText() {
  return pick([
    "הצעד הבא הכי פשוט: שיחת היכרות קצרה עם קטי (כ-20 דקות, בטלפון או בזום), בלי עלות ובלי התחייבות — להכיר, להבין מה מתאים לך, ולראות אם זה מדבר אלייך.",
    "אני מציעה שתדברי עם קטי בשיחת היכרות קצרה — בלי עלות ובלי התחייבות. בשיחה היא מבינה מה עובר עלייך ואומרת לך בכנות אם ואיך היא יכולה לעזור."
  ]) + `\n\nאפשר לבחור זמן כאן: ${CALENDLY}\nאו פשוט לכתוב לי איזה יום ושעה נוחים לך, ואני אדאג שקטי תחזור אלייך לתאם 🙏`;
}

function localReply(userText, chat) {
  const t = (userText || "").toLowerCase().trim();
  const has = (...words) => words.some(w => t.includes(w));
  const c = chat || {};
  const turns = Math.floor((c.history?.length || 0) / 2); // כמה פעמים כבר ענינו בשיחה הזו
  const R = (reply, extra = {}) => ({ reply, ended: false, alert: false, human: false, hot: false, infoCard: false, ...extra });
  const invite = (body) => { c.invited = true; return R(`${body}\n\n${inviteText()}`); };

  // ── בטיחות — מצוקה חריפה (קודם כל) ──
  if (has("אובדנ", "לפגוע בעצמי", "לא רוצה לחיות", "להתאבד", "אתאבד", "פגיעה עצמית", "לשים סוף", "אין טעם לחיות", "רוצה למות")) {
    return R("אני ממש שמחה שכתבת, ואני רוצה שתדעי שאת לא לבד 💛 מה שאת מרגישה חשוב, וקטי תחזור אלייך אישית בהקדם. אם זה דחוף או קשה מאוד ברגע זה — ער\"ן זמינים 24/7 בטלפון 1201. את יקרה, ומגיע לך תמיכה עכשיו.", { alert: true, human: true });
  }
  // ── בקשה לדבר עם אדם ──
  if (has("לדבר עם קטי", "לדבר עם קיטי", "בן אדם", "בנאדם", "בן-אדם", "אנושי", "לדבר עם מישהו", "נציג", "שקטי תתקשר", "תתקשרי אליי", "שיחזרו אליי")) {
    return R(pick([
      "בטח 💛 אני מעבירה לקטי שתחזור אלייך אישית. אם נוח לך, כתבי לי איזה יום ושעה מתאימים, או תפסי זמן כאן:\n" + CALENDLY,
      "כמובן 🙏 אני מסמנת לקטי שתחזור אלייך בעצמה. אפשר גם לבחור זמן שנוח לך, והיא כבר תהיה מוכנה:\n" + CALENDLY
    ]), { human: true });
  }
  // ── "את בוט?" ──
  if (has("את בוט", "זה בוט", "אתה בוט", "רובוט", "מי מדבר", "מי זה")) {
    return R("אני המענה הראשוני של קטי — כאן כדי להקשיב לך ולחבר אותך אליה אישית 💛 ספרי לי, מה מביא אותך?");
  }

  // ── אחרי שהזמנו לשיחת היכרות: סוגרים ──
  if (c.invited) {
    if (BOOKED_RE.test(t)) {
      c.booked = true;
      return R("מעולה, איזה כיף 💛 קטי תתכונן לשיחה ותהיה איתך בזמן שבחרת. אם יעלה משהו לפני — אני כאן.", { ended: true, hot: true });
    }
    if (NO_RE.test(t)) return R("בסדר גמור, ותודה שכתבת 🙏 אם תרצי בהמשך — את תמיד מוזמנת לחזור לכאן. שיהיה לך יום טוב 💛", { ended: true });
    if (has("מחיר", "כמה עולה", "עלות", "תשלום", "כמה זה", "כמה כסף")) {
      return R(`שאלה במקום 🙏 שיחת ההיכרות עצמה בלי עלות. המחיר של התהליך מותאם אישית — לפי מה שנכון לך — וקטי עוברת על זה יחד איתך בשיחה, בשקיפות מלאה.\n\nלבחירת זמן: ${CALENDLY}\nאו כתבי לי יום ושעה ואעביר לקטי.`);
    }
    if (HESITATE_RE.test(t)) {
      // followup: תזכורת עדינה אחת בעוד שבוע (session.js מתזמן ושולח)
      if (c.softened) return R("בטח, קחי את הזמן 💛 אני כאן כשתרצי.", { ended: true, followup: true });
      c.softened = true;
      return R("לגמרי מובן, ואין שום לחץ 💛 שיחת ההיכרות היא רק כדי להכיר ולהבין אם זה בכלל מתאים — בלי התחייבות. אם נוח יותר, אפשר גם לקבוע לשבוע הבא. רוצה שאשמור לך מקום?", { followup: true });
    }
    if (TIME_RE.test(t) && t.length <= 90) {
      c.proposed = true;
      return R("רשמתי ✔️ העברתי לקטי את הזמן שנוח לך, והיא תחזור אלייך לאשר. תודה, ונתראה 💛", { hot: true });
    }
    if (YES_RE.test(t) && t.length <= 45) {
      return R(`מעולה 💛 אפשר לבחור כאן זמן שנוח לך: ${CALENDLY}\nאו לכתוב לי יום ושעה, ואעביר לקטי.`);
    }
  }

  // ── מחיר (לפני שהזמנו) ──
  if (has("מחיר", "כמה עולה", "עלות", "תשלום", "כמה זה", "כמה כסף", "מחירון")) {
    return invite("שאלה במקום 🙏 אין מחיר אחד — התהליך נבנה לפי מה שנכון לך, וקטי עוברת על זה יחד איתך בשיחת ההיכרות.");
  }
  // ── הסכמה קצרה / רוצים לקבוע ──
  if ((t.length <= 45 && YES_RE.test(t)) || has("לקבוע", "לתאם", "פגישה", "שיחת היכרות", "מתי אפשר")) {
    return invite("איזה יופי שאת פותחת לזה דלת 💛");
  }
  // ── סיפור לפי נושא: שיקוף → שאלה אחת → הזמנה ──
  const found = topicOf(t);
  if (found) {
    const first = !c.topic;
    c.topic = TOPICS.indexOf(found);
    // הודעה ראשונה שכבר מספרת הרבה — לא שואלים עוד, משקפים ומזמינים.
    if (turns === 0 && found.ask && t.length < 70) return R(`${pick(found.reflect)}\n\n${found.ask}`);
    return invite(`${first ? pick(found.reflect) : "תודה שאת מספרת לי 💛"} ${found.how}`);
  }

  // ── "מה זה / מה את עושה / ראיתי אותך" ──
  if (has("שיטה", "מה את עוש", "מה את מעביר", "מה זה", "מה הפעילות", "ראיתי אותך", "ראיתי את המודעה", "ראיתי את הפרסום", "פייסבוק", "אינסטגרם", "סדנ", "טיפול", "אימון", "ליווי", "במה את עוסקת", "פרטים", "אשמח לשמוע")) {
    if (turns >= 1) return invite("CureMindset זו עבודה רגשית שבונה חוסן — NLP ועבודה סומטית, בתהליך קצר שנוגע בשורש ולא רק בסימפטום.");
    return R("כיף שפנית 💛 CureMindset זו עבודה רגשית שבונה חוסן — שילוב של NLP ועבודה סומטית, שנוגע בשורש של הדפוס ולא רק בסימפטום. תהליך קצר שמחזק ביטחון, רוגע ודימוי עצמי.\n\nספרי לי — זה בשבילך, או בשביל מישהו קרוב?");
  }

  // ── ברכה בלבד ──
  if (has("היי", "הי", "שלום", "בוקר טוב", "ערב טוב", "מה נשמע", "הלו", "אהלן") && t.length <= 25) {
    return R(pick([
      "היי, כמה טוב שכתבת 💛 אני המענה של קטי שגב. ספרי לי בכמה מילים מה מביא אותך — משהו שאת מרגישה בעצמך, או בשביל מישהו קרוב?",
      "היי 💛 שמחה שפנית. מה גרם לך לכתוב היום — משהו שלך, או של מישהו קרוב?"
    ]));
  }

  // ── ברירת מחדל ──
  if (turns === 0) return R("שמחה שפנית 💛 ספרי לי במילים שלך מה מביא אותך — ונמצא יחד את הצעד הנכון.");
  if (!c.invited) return invite(`תודה שאת משתפת 💛 ${c.topic != null ? TOPICS[c.topic].how : "מה שאת מתארת זה בדיוק סוג הדברים שקטי עובדת איתם."}`);
  return R("אני כאן 💛 אם נוח לך, כתבי לי יום ושעה לשיחה קצרה עם קטי — או בחרי זמן כאן:\n" + CALENDLY);
}

// ── OpenAI (אופציונלי) ──
// אין "OpenAI חינמי" ל-API: בלי קרדיט OpenAI מחזיר 429. לכן המערכת עובדת כברירת מחדל
// במצב "טקסטים" — המנוע המקומי בשיטת CureMindset (חינמי, בלי מפתח). אם יש מפתח עם
// קרדיט, היא עוברת לבד ל-OpenAI. "מפסק" (circuit breaker): אחרי כשל קרדיט/מפתח לא
// מנסים שוב 30 דקות — כדי שכל הודעה לא תחכה לכשל לפני שהיא עונה.
const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.MODEL && /^gpt|^o\d/i.test(process.env.MODEL) ? process.env.MODEL : "gpt-4o-mini";
const AI_MODE = (process.env.AI_MODE || "auto").toLowerCase(); // auto | texts
const ai = { downUntil: 0, reason: API_KEY ? "" : "no-key" };

export function aiState() {
  if (AI_MODE === "texts") return { mode: "texts", reason: "forced" };
  if (!API_KEY) return { mode: "texts", reason: "no-key" };
  if (ai.downUntil > Date.now()) return { mode: "texts", reason: ai.reason || "unavailable" };
  return { mode: "openai", reason: "" };
}

function tripBreaker(message) {
  const m = String(message || "");
  const reason = /insufficient_quota|no credits|billing|\b429\b/i.test(m) ? "no-credit"
    : /\b401\b|invalid_api_key|Incorrect API key/i.test(m) ? "bad-key" : "error";
  ai.reason = reason;
  ai.downUntil = Date.now() + (reason === "error" ? 2 : 30) * 60 * 1000;
  console.log(`[brain] OpenAI לא זמין (${reason}) — עונים במנוע הטקסטים`);
}

export async function diagnoseOpenAI() {
  if (!API_KEY) { console.log("[diag] אין OPENAI_API_KEY — עובדים במצב טקסטים (חינמי)"); return; }
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1, messages: [{ role: "user", content: "hi" }] })
    });
    if (r.ok) { ai.downUntil = 0; console.log("[diag] ✅ OpenAI פעיל — יש קרדיט"); }
    else { const b = await r.text(); tripBreaker(`${r.status} ${b}`); console.log(`[diag] OpenAI: HTTP ${r.status} | ${b.slice(0, 160)}`); }
  } catch (e) { console.log("[diag] OpenAI שגיאה:", e.message); }
}

async function callOpenAI(systemPrompt, messages) {
  if (aiState().mode !== "openai") throw new Error("openai-skipped");
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, temperature: 0.7, messages: [{ role: "system", content: systemPrompt }, ...messages] })
    });
    if (!res.ok) { const body = await res.text(); throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`); }
    const data = await res.json();
    const text = (data.choices?.[0]?.message?.content || "").trim();
    if (!text) throw new Error("empty response");
    return text;
  } catch (err) {
    if (err.message !== "openai-skipped") tripBreaker(err.message);
    throw err;
  }
}

/** טקסט חופשי מ-OpenAI (למשל יצירת שאלות ותשובות). זורק שגיאה אם אין קרדיט. */
export async function aiText(systemPrompt, userText) {
  return callOpenAI(systemPrompt, [{ role: "user", content: userText }]);
}

const MAX_TURNS = 10;
const TTL_MS = 48 * 60 * 60 * 1000;

/**
 * מוח נפרד לכל חיבור וואטסאפ (כל משתמש/ת במערכת): זיכרון שיחות, השהיות, מונים ולידים
 * משלו — כך שני חיבורים לעולם לא מתערבבים.
 */
export function createBrain(getProfile = () => null) {
  const chats = new Map();
  let globalPause = false;
  let handled = 0;
  const flagged = [];

  function getChat(jid) {
    const now = Date.now();
    for (const [k, v] of chats) if (now - v.updated > TTL_MS) chats.delete(k);
    if (!chats.has(jid)) chats.set(jid, { history: [], updated: now, pausedUntil: 0, infoSent: false });
    return chats.get(jid);
  }
  function remember(chat, userText, reply) {
    chat.history.push({ role: "user", content: userText });
    chat.history.push({ role: "assistant", content: reply });
    if (chat.history.length > MAX_TURNS * 2) chat.history = chat.history.slice(-MAX_TURNS * 2);
    chat.updated = Date.now();
  }

  const brain = {
    isPaused: (jid) => getChat(jid).pausedUntil > Date.now(),
    pause: (jid, hours = 12) => { getChat(jid).pausedUntil = Date.now() + hours * 3600 * 1000; },
    resetChat: (jid) => { chats.delete(jid); },
    /** אחרי תזכורת: השיחה כבר "אחרי הזמנה", כך ש"שלישי בערב" ייקלט כזמן לשיחת היכרות. */
    markInvited: (jid) => { const c = getChat(jid); c.invited = true; c.softened = true; c.updated = Date.now(); },
    pauseAll: (v) => { globalPause = !!v; },
    isGloballyPaused: () => globalPause,
    countHandled: () => { handled++; },
    /** kind: "alert" (מצוקה) | "human" (ביקשו אדם) | "unanswered" (לא הייתה תשובה בטקסטים) */
    flag(from, text, alert, kind) {
      flagged.unshift({ from, text, alert: !!alert, kind: kind || (alert ? "alert" : "human"), at: Date.now() });
      if (flagged.length > 30) flagged.pop();
    },
    stats: () => ({ activeChats: chats.size, handled }),
    recentActivity() {
      const day = Date.now() - 24 * 3600 * 1000;
      const recent = flagged.filter(f => f.at > day);
      return { activeChats: chats.size, handled, hot: recent.filter(f => f.kind === "human" || f.kind === "hot").length, alerts: recent.filter(f => f.alert).length, unanswered: recent.filter(f => f.kind === "unanswered").length, flagged: recent };
    },

    async thinkAsOwner(jid, userText, systemPrompt, context) {
      const chat = getChat(jid);
      try {
        const reply = await callOpenAI(systemPrompt + "\n\n" + context, [...chat.history, { role: "user", content: userText }]);
        remember(chat, userText, reply);
        return reply;
      } catch { return null; }
    },

    /** @returns {{reply:string, ended:boolean, alert:boolean, human:boolean, infoCard:boolean}} */
    async think(jid, userText) {
      const chat = getChat(jid);
      // לכל חיבור הפרופיל שלו: השיטה של קטי, או עסק אחר שעונה לפי הטקסטים של בעליו.
      const profile = getProfile() || { kind: "curemindset" };
      const isBiz = profile.kind === "business";

      // ── קודם מבינים מה זו ההודעה: ספאם / פרסום של עסק / פנייה אמיתית ──
      const R = (reply, extra = {}) => ({ reply, ended: false, alert: false, human: false, infoCard: false, ...extra });
      const site = isBiz ? (profile.website || profile.bookingLink || "") : SITE;
      const booking = isBiz ? (profile.bookingLink || "") : CALENDLY;
      // בשיחה שכבר מתנהלת (הבוט ענה והאדם ממשיך לכתוב) — לא מסווגים כספאם/פרסום.
      // אדם אמיתי באמצע שיחה יכול לשלוח הודעה ארוכה עם קישורים, וזה לא סיבה להפסיק לענות לו.
      const ongoing = !chat.promoAsked && chat.history.length >= 2;
      // לעסק אחר: מילים מהפרופיל (סוג העסק, שירותים, בעיות שלקוחות מגיעים איתן) גם מסמנות רלוונטיות.
      const bizWords = isBiz ? [...new Set(`${profile.businessType || ""} ${profile.services || ""} ${profile.problems || ""}`.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4))] : [];
      const kind = ongoing ? "normal" : classifyMessage(userText, bizWords);
      if (chat.promoAsked && !chat.promoResolved) {
        // שאלנו "זה בעקבות עניין בשירות?" — עכשיו מקשיבים לתשובה
        if (isYes(userText)) {
          chat.promoResolved = true;
          const reply = isBiz
            ? `מעולה 🙂${site ? `\nכל הפרטים כאן: ${site}` : ""}${booking && booking !== site ? `\nולקביעה: ${booking}` : ""}`
            : `מעולה 💛 כאן אפשר לקרוא עוד על הדרך שלי: ${SITE}\nואם מתאים לך, אפשר לקבוע שיחת היכרות קצרה, בלי עלות ובלי התחייבות:\n${CALENDLY}`;
          remember(chat, userText, reply);
          return R(reply);
        }
        if (isNo(userText)) {
          chat.promoResolved = true;
          remember(chat, userText, "בסדר גמור, תודה ויום טוב 🙏");
          return R("בסדר גמור, תודה ויום טוב 🙏", { ended: true });
        }
        if (kind !== "normal") return { reply: "", ignore: true, reason: "פרסום — כבר שאלנו פעם אחת, לא ממשיכים" };
        chat.promoResolved = true; // כתבו משהו אמיתי — ממשיכים כרגיל
      }
      if (kind === "spam") return { reply: "", ignore: true, reason: "נראה כמו ספאם או דיוור — לא עונים" };
      if (kind === "auto") return { reply: "", ignore: true, reason: "הודעה אוטומטית / שליח / קוד אימות — לא עונים" };
      // פרסום / הצעת שירות / הודעה שלא קשורה לעסק — מסננים ולא עונים (נשאר לבעלים לראות בוואטסאפ).
      if (kind === "promo") return { reply: "", ignore: true, reason: "פרסום / הצעת שירות — לא עונים" };
      if (kind === "irrelevant") return { reply: "", ignore: true, reason: "לא קשור לפעילות העסק — לא עונים" };
      let raw = "";
      try {
        raw = await callOpenAI(isBiz ? businessPrompt(profile) : SYSTEM_PROMPT, [...chat.history, { role: "user", content: userText }]);
      } catch {
        const local = isBiz ? businessReply(profile, userText, chat) : localReply(userText, chat);
        if (local.infoCard && chat.infoSent) local.infoCard = false;
        else if (local.infoCard) chat.infoSent = true;
        remember(chat, userText, local.reply);
        return local;
      }
      const ended = raw.includes("[[END]]");
      const alert = raw.includes("[[ALERT]]");
      const human = raw.includes("[[HUMAN]]");
      const hot = raw.includes("[[HOT]]");
      const followup = raw.includes("[[FOLLOWUP]]");
      const reply = raw.replace(/\[\[(END|ALERT|HUMAN|HOT|FOLLOWUP)\]\]/g, "").trim();
      remember(chat, userText, reply);
      let infoCard = false;
      if (ended && !chat.infoSent) { infoCard = true; chat.infoSent = true; }
      return { reply, ended, alert, human, hot, followup, infoCard };
    }
  };
  return brain;
}
