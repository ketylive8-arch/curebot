import { SYSTEM_PROMPT, CALENDLY, SITE } from "./prompt.js";
import { classifyMessage, isYes, isNo } from "./classify.js";
import { businessReply, businessPrompt } from "./business.js";

// בוחר וריאציה אקראית — כדי שהתשובות לא יישמעו תבניתיות אלא אנושיות ומגוונות.
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ── מוח מקומי (fallback) — עונה בשיטת CureMindset גם כש-OpenAI לא זמין/אין קרדיט.
// מזהה את סוג הפנייה + שלב השיחה, מגוון בניסוחים, ומוביל בעדינות לשיחת היכרות.
function localReply(userText, chat) {
  const t = (userText || "").toLowerCase().trim();
  const has = (...words) => words.some(w => t.includes(w));
  const firstContact = !chat || (chat.history?.length || 0) === 0;
  const alreadyInvited = Boolean(chat && chat.invited);
  const R = (reply, extra = {}) => ({ reply, ended: false, alert: false, human: false, infoCard: false, ...extra });

  // הזמנה לשיחה — בכמה ניסוחים, ורק אם עוד לא הזמנו בשיחה הזו (שלא יחזור על עצמו).
  function withInvite(body) {
    if (alreadyInvited) return body;
    if (chat) chat.invited = true;
    const inv = pick([
      `\n\nאם מתחשק לך, אפשר פשוט לתאם שיחה קצרה עם קטי ולראות אם זה מדבר אלייך — בלי שום התחייבות:\n${CALENDLY}`,
      `\n\nהכי פשוט לקבוע רגע שיחת היכרות קטנה עם קטי, שתכירי ותרגישי אם זה מתאים לך:\n${CALENDLY}`,
      `\n\nרוצה? אפשר לבחור זמן שנוח לך לשיחה קצרה עם קטי, בלי עלות ובלי מחויבות:\n${CALENDLY}`
    ]);
    return body + inv;
  }

  // ── בטיחות — מצוקה חריפה (קודם כל) ──
  if (has("אובדנ", "לפגוע בעצמי", "לא רוצה לחיות", "להתאבד", "אתאבד", "פגיעה עצמית", "לשים סוף", "אין טעם לחיות")) {
    return R("אני ממש שמחה שכתבת, ואני רוצה שתדעי שאת לא לבד 💛 מה שאת מרגישה חשוב, וקטי תחזור אלייך אישית בהקדם. אם זה דחוף או קשה מאוד ברגע זה — יש קו תמיכה חם וזמין 24/7, ער\"ן בטלפון 1201. את יקרה, ומגיע לך תמיכה עכשיו.", { alert: true, human: true });
  }

  // ── בקשה לדבר עם אדם ──
  if (has("לדבר עם קטי", "לדבר עם קיטי", "בן אדם", "בנאדם", "בן-אדם", "אנושי", "לדבר עם מישהו", "נציג", "מדברת עם קטי")) {
    return R(pick([
      "בטח 💛 אני כבר מעבירה לקטי שתחזור אלייך אישית. ובינתיים, אם נוח לך, אפשר לתפוס לה זמן לשיחה כאן:\n" + CALENDLY,
      "כמובן 🙏 אני מסמנת לקטי שתחזור אלייך בעצמה. אפשר גם פשוט לבחור זמן שנוח לך והיא כבר תהיה מוכנה:\n" + CALENDLY
    ]), { human: true });
  }

  // ── שאלה אם זה בוט ──
  if (has("את בוט", "זה בוט", "אתה בוט", "רובוט", "מי מדבר")) {
    return R(pick([
      "אני המענה הראשוני של קטי — כאן כדי להקשיב לך ולחבר אותך אליה אישית 💛 מה מביא אותך אלינו?",
      "אני זו שעונה ראשונה אצל קטי, כדי שלא תישארי בלי מענה 💛 קטי עצמה נכנסת אישית להמשך. ספרי לי — מה שלומך, ומה הביא אותך?"
    ]));
  }

  // ── הסכמה/עניין לתאם ── רק לתשובה קצרה ("כן", "אשמח", "מתי אפשר?").
  // הודעה ארוכה שמספרת מה עובר על האדם ממשיכה לענפים של התוכן — קודם להתייחס לסיפור,
  // ואז להזמין לשיחת היכרות (withInvite). בלי זה "הבת שלי עם חרדה, אשמח לפרטים" קיבלה "שמחה לשמוע".
  if (t.length <= 45 && has("כן", "בא לי", "אשמח", "מעוניינ", "רוצה לתאם", "רוצה פגישה", "נשמע טוב", "מתי אפשר", "קדימה", "בשמחה")) {
    if (chat) chat.invited = true;
    return R(pick([
      "איזה יופי שאת פותחת לזה דלת 💛 הנה הקישור לבחור זמן שנוח לך, וקטי כבר תחזור אלייך מוכנה:\n" + CALENDLY,
      "שמחה לשמוע 💛 תבחרי כאן את הזמן שהכי מסתדר לך, וזהו — קטי תדאג לשאר:\n" + CALENDLY
    ]), { infoCard: true });
  }

  // ── מחיר ──
  if (has("מחיר", "כמה עולה", "עלות", "תשלום", "כמה זה", "כמה כסף", "מחירון")) {
    return R(withInvite(pick([
      "שאלה במקום 🙏 אין מחיר אחד — זה נבנה לפי מה שנכון בשבילך ולפי סוג התהליך, וקטי עוברת על זה יחד איתך בשיחת ההיכרות (שהיא בלי עלות).",
      "הוגן לשאול 💛 המחיר מותאם אישית, כי כל תהליך נבנה אחרת. בשיחת ההיכרות (חינם) קטי מסבירה בדיוק מה מתאים לך וכמה זה."
    ])));
  }

  // ── הורה / ילד / נוער ──
  if (has("בן שלי", "בת שלי", "הבן", "הבת", "הילד", "הילדה", "ילד שלי", "נוער", "מתבגר", "מתבגרת", "בית ספר", "ילדים", "חברתי", "ביישן", "מופנם", "לא מצליח להתחבר")) {
    return R(withInvite(pick([
      "אני שומעת כמה את דואגת לו/ה — וזה יפה כל כך 💛 קושי חברתי או ביטחון בגיל הזה זה מקום שאפשר ממש לעבוד איתו, בעדינות ובקצב שלו/ה, אישית או בקבוצת חוסן לנוער.",
      "כמה טוב שאת מחפשת בשבילו/ה 💛 בדיוק על דברים כאלה קטי עובדת — לבנות ביטחון וחוסן חברתי בלי לחץ, בקצב של הילד/ה. יש גם מסלול אישי וגם קבוצתי."
    ])));
  }

  // ── כאבים / מיגרנה / גוף ──
  if (has("כאב", "מיגרנ", "כאבים", "בגוף", "פסיכוסומט", "מתח שרירים")) {
    return R(withInvite(pick([
      "אוי, אני שומעת אותך 💛 לגוף יש הרבה פעמים שפה רגשית — בשיטה עובדים על השורש הרגשי שמשפיע גם על הגוף (בלי להחליף רופא), והרבה אנשים מרגישים הקלה כשנוגעים במה שמאחורי התסמין.",
      "נשמע מתיש, ואני איתך 💛 לא פעם הגוף מחזיק רגש שלא קיבל מקום. קטי עובדת בדיוק שם, על השורש — לצד המעקב הרפואי, לא במקומו."
    ])));
  }

  // ── מסכים / התמכרות ──
  if (has("מסך", "מסכים", "טלפון", "התמכר", "משחקים", "גיימינג", "טיקטוק")) {
    return R(withInvite(pick([
      "מובן לגמרי 💛 מאחורי המסך לרוב מסתתר ויסות רגשי שחסר — וכשמחזקים את החוסן הרגשי, הצורך לברוח למסך פוחת מעצמו. אפשר לעבוד עם זה יפה.",
      "אני מכירה את זה טוב 💛 המסך זה בדרך כלל הפתרון, לא הבעיה — הוא ממלא חלל רגשי. קטי עובדת על החוסן שמתחת, וזה מה שמזיז את זה באמת."
    ])));
  }

  // ── חרדה / לחץ / דיכאון / דימוי עצמי / תקיעות ──
  if (has("חרד", "לחץ", "פאניק", "פניקה", "מתח", "תקוע", "דיכא", "עצב", "ביטחון", "דימוי", "פחד", "שפל", "נגמר לי הכוח", "אין לי כוח", "שחוק", "עייפ", "בודד", "לבד")) {
    return R(withInvite(pick([
      "אני שומעת אותך, וזה אמיץ באמת לכתוב את זה 💛 מה שאת מתארת הוא דפוס — ודפוס אפשר לרכך, הוא לא מי שאת. קטי עובדת בדיוק על השורש, לא רק להרגיע לרגע.",
      "תודה ששיתפת, זה לא מובן מאליו 💛 מה שאת מרגישה הגיוני לחלוטין, וזה גם נִתן לשינוי — בתהליך קצר וממוקד שנוגע בשורש ולא רק במה שנראה מבחוץ.",
      "קשה, ואני איתך בזה 💛 הרבה פעמים מה שמרגיש 'ככה אני תמיד' הוא בעצם דפוס נלמד — והמוח יודע ללמוד גם דרך חדשה. זה בדיוק העבודה של קטי."
    ])));
  }

  // ── טראומה / עבר קשה ──
  if (has("טראומ", "עבר קשה", "פגעו בי", "שכול", "אלימות")) {
    return R(withInvite(pick([
      "תודה שנתת בי אמון לכתוב את זה 💛 עם דברים כאלה עובדים בעדינות רבה ובקצב שלך, במקום בטוח — בלי לחפור. זה בדיוק מהלב של העבודה של קטי, ונכון לעשות את זה יחד איתה.",
      "אני מחזיקה איתך את מה שכתבת 💛 יש דרך עדינה ובטוחה לגעת בזה, לאט ובשליטה שלך. קטי מלווה בדיוק במקומות האלה."
    ])));
  }

  // ── מה השיטה / מה את עושה / ראיתי אותך ──
  if (has("שיטה", "מה את עוש", "מה את מעביר", "מה זה", "מה הפעילות", "ראיתי אותך", "פייסבוק", "אינסטגרם", "פעילות", "סדנ", "חינוך", "טיפול", "אימון", "מה יש לך להציע", "במה את עוסקת")) {
    return R(pick([
      "כיף שאת שואלת 💛 CureMindset זו עבודה רגשית שבונה חוסן — שילוב של NLP ועבודה סומטית, שנוגע בשורש של הדפוס ולא רק בסימפטום. תהליך קצר שמחזק דימוי עצמי, רוגע וביטחון.\n\nומה איתך — מה הביא אותך אליי? משהו שלך, או של מישהו קרוב?",
      "בשמחה אספר 💛 זו לא הרצאה ולא 'חינוך' — זו עבודה רגשית שמחזקת חוסן, מבוססת NLP, קצרה וממוקדת, שעובדת עם תת-המודע לא נגדו. \"החופש להוביל. העוצמה להגשים.\"\n\nספרי לי מה מביא אותך, ואדע לכוון אותך."
    ]));
  }

  // ── ברכה בלבד / פתיחה ──
  if (has("היי", "הי", "שלום", "בוקר טוב", "ערב טוב", "מה נשמע", "הלו", "אהלן") && t.length <= 25) {
    return R(pick([
      "היי, כמה טוב שכתבת 💛 אני המענה של קטי שגב. ספרי לי בכמה מילים מה מביא אותך — משהו שאת מרגישה בעצמך, או בשביל מישהו קרוב?",
      "היי 💛 שמחה שפנית. מה איתך — מה גרם לך לכתוב לי היום?",
      "אהלן 🙏 כאן המענה של קטי, ואני פנויה בשבילך לגמרי. מה מביא אותך?"
    ]));
  }

  // ── ברירת מחדל — הכלה + שאלת גילוי ──
  if (firstContact) {
    return R(pick([
      "היי, כמה טוב שכתבת 💛 אני כאן כדי להקשיב. ספרי לי קצת — מה הכי מעסיק אותך בזמן האחרון?",
      "שמחה שפנית 💛 ספרי לי במילים שלך מה מביא אותך, ונצא מזה יחד."
    ]));
  }
  return R(withInvite(pick([
    "אני איתך 💛 ספרי לי עוד קצת — מה הכי כבד עלייך עכשיו, או מה היית הכי רוצה שישתנה?",
    "אני ממש כאן בשבילך 💛 מה הדבר שהכי היית רוצה שיהיה אחרת? ככה אדע לכוון אותך נכון."
  ])));
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
      return { activeChats: chats.size, handled, hot: recent.filter(f => f.kind === "human").length, alerts: recent.filter(f => f.alert).length, unanswered: recent.filter(f => f.kind === "unanswered").length, flagged: recent };
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
      const kind = classifyMessage(userText);
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
      if (kind === "promo") {
        chat.promoAsked = true;
        const reply = isBiz
          ? `היי, תודה שכתבת 🙂 רק כדי לדייק — זה בעקבות עניין ב${profile.businessName || "שירות שלנו"}?${site ? ` אם כן, כל הפרטים כאן: ${site}` : ""}`
          : `היי, תודה שכתבת 🙂 רק כדי לדייק — פנית בעקבות עניין בליווי שלי? אם כן, אפשר לקרוא עוד כאן: ${SITE}\nואשמח לשמוע מה מביא אותך.`;
        remember(chat, userText, reply);
        return R(reply);
      }
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
      const reply = raw.replace(/\[\[(END|ALERT|HUMAN)\]\]/g, "").trim();
      remember(chat, userText, reply);
      let infoCard = false;
      if (ended && !chat.infoSent) { infoCard = true; chat.infoSent = true; }
      return { reply, ended, alert, human, infoCard };
    }
  };
  return brain;
}
