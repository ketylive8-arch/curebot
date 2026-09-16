import { SYSTEM_PROMPT, CALENDLY } from "./prompt.js";

// ── מוח מקומי (fallback) — עונה בשיטת CureMindset גם כש-OpenAI לא זמין/אין קרדיט.
// מזהה את סוג הפנייה + שלב השיחה, ומחזיר תשובה חמה שמובילה לשיחת היכרות.
function localReply(userText, chat) {
  const t = (userText || "").toLowerCase().trim();
  const has = (...words) => words.some(w => t.includes(w));
  const firstContact = !chat || (chat.history?.length || 0) === 0;
  const invite = `\n\nבא לך שנתאם שיחת היכרות קצרה עם קטי, בלי התחייבות? אפשר לבחור זמן שנוח לך כאן:\n${CALENDLY}`;
  const R = (reply, extra = {}) => ({ reply, ended: false, alert: false, human: false, infoCard: false, ...extra });

  // ── בטיחות — מצוקה חריפה (קודם כל) ──
  if (has("אובדנ", "לפגוע בעצמי", "לא רוצה לחיות", "להתאבד", "אתאבד", "פגיעה עצמית", "לשים סוף", "אין טעם לחיות")) {
    return R("אני ממש שמחה שכתבת, ואני רוצה שתדעי שאת לא לבד 💛 מה שאת מרגישה חשוב, וקטי תחזור אלייך אישית בהקדם. אם זה דחוף או קשה מאוד ברגע זה — יש קו תמיכה חם וזמין 24/7, ער\"ן בטלפון 1201. את יקרה, ומגיע לך תמיכה עכשיו.", { alert: true, human: true });
  }

  // ── בקשה לדבר עם אדם ──
  if (has("לדבר עם קטי", "לדבר עם קיטי", "בן אדם", "בנאדם", "בן-אדם", "אנושי", "לדבר עם מישהו", "נציג", "מדברת עם קטי")) {
    return R("בטח 💛 אני מעבירה לקטי והיא תחזור אלייך אישית בהקדם. בינתיים אפשר גם לתאם שיחת היכרות בזמן שנוח לך:\n" + CALENDLY, { human: true });
  }

  // ── שאלה אם זה בוט ──
  if (has("את בוט", "זה בוט", "אתה בוט", "רובוט", "מי מדבר")) {
    return R("אני המענה הדיגיטלי של קטי, וכאן כדי להקשיב, לעזור ולחבר אותך אליה אישית 💛 ספרי לי מה מביא אותך?");
  }

  // ── הסכמה/עניין לתאם ──
  if (has("כן", "בא לי", "אשמח", "מעוניינ", "רוצה לתאם", "רוצה פגישה", "נשמע טוב", "מתי אפשר", "קדימה", "בשמחה")) {
    return R("איזה כיף 💛 הנה הקישור לבחירת זמן שנוח לך לשיחת ההיכרות עם קטי (ללא עלות):\n" + CALENDLY + "\n\nאחרי שתבחרי — קטי כבר תדע לחזור אלייך מוכנה.", { infoCard: true });
  }

  // ── מחיר ──
  if (has("מחיר", "כמה עולה", "עלות", "תשלום", "כמה זה", "כמה כסף", "מחירון")) {
    return R("שאלה חשובה 🙏 המחיר נקבע אישית לפי מה שנכון עבורך ולפי סוג התהליך, וקטי עוברת על זה יחד איתך בשיחת ההיכרות — שהיא ללא עלות וללא התחייבות." + invite);
  }

  // ── הורה / ילד / נוער ──
  if (has("בן שלי", "בת שלי", "הבן", "הבת", "הילד", "הילדה", "ילד שלי", "נוער", "מתבגר", "מתבגרת", "בית ספר", "ילדים", "חברתי", "ביישן", "מופנם", "לא מצליח להתחבר")) {
    return R("אני שומעת כמה חשוב לך לעזור לו/ה — זה אומר עלייך המון 💛 קושי חברתי או חוסר ביטחון בגיל הזה זה בדיוק מקום שאפשר לעבוד איתו, בעדינות ובקצב של הילד/ה — אישית או בקבוצות החוסן לנוער. קטי תתאים את הדרך הנכונה." + invite);
  }

  // ── כאבים / מיגרנה / גוף ──
  if (has("כאב", "מיגרנ", "כאבים", "בגוף", "פסיכוסומט", "מתח שרירים")) {
    return R("אני שומעת אותך 💛 לגוף יש לא פעם שפה רגשית, ובשיטה עובדים על השורש הרגשי שמשפיע גם על הגוף — בלי להחליף מעקב רפואי. רבים מרגישים הקלה כשנוגעים ברגש שמאחורי התסמין." + invite);
  }

  // ── מסכים / התמכרות ──
  if (has("מסך", "מסכים", "טלפון", "התמכר", "משחקים", "גיימינג", "טיקטוק")) {
    return R("מובן לגמרי, וזה בסדר גמור להתחיל דווקא מהמקום הזה 💛 לרוב מאחורי המסך מסתתר ויסות רגשי שחסר — וכשמחזקים את החוסן הרגשי, הצורך לברוח למסך פוחת מעצמו." + invite);
  }

  // ── חרדה / לחץ / דיכאון / דימוי עצמי / תקיעות ──
  if (has("חרד", "לחץ", "פאניק", "פניקה", "מתח", "תקוע", "דיכא", "עצב", "ביטחון", "דימוי", "פחד", "שפל", "נגמר לי הכוח", "אין לי כוח", "שחוק", "עייפ", "בודד", "לבד")) {
    return R("אני שומעת אותך, וזה אמיץ לכתוב את זה 💛 מה שאת מתארת הוא דפוס — ודפוס אפשר לרכך, הוא לא גזירת גורל. הדרך של קטי עובדת בדיוק על השורש, לא רק להרגיע לרגע, בתהליך קצר וממוקד." + invite);
  }

  // ── טראומה / עבר קשה ──
  if (has("טראומ", "עבר קשה", "פגעו בי", "אובדן", "שכול", "אלימות")) {
    return R("תודה שנתת בי אמון לכתוב את זה 💛 אפשר לעבוד עם דברים כאלה בעדינות רבה ובקצב שלך — בלי לחפור, ובמקום בטוח. זה בדיוק מהלב של העבודה של קטי, ונכון לעשות את הצעד הזה יחד איתה אישית." + invite);
  }

  // ── מה השיטה / מה את עושה / ראיתי אותך ──
  if (has("שיטה", "מה את עוש", "מה את מעביר", "מה זה", "מה הפעילות", "ראיתי אותך", "פייסבוק", "אינסטגרם", "פעילות", "סדנ", "חינוך", "טיפול", "אימון", "מה יש לך להציע", "במה את עוסקת")) {
    return R("בשמחה 💛 CureMindset היא עבודה רגשית שבונה חוסן — טיפול ואימון מבוססי NLP ועבודה סומטית, שעובדים על השורש של הדפוס ולא רק על הסימפטום. תהליך קצר וממוקד שמחזק דימוי עצמי, רוגע וביטחון. \"החופש להוביל. העוצמה להגשים.\"\n\nמה מביא אותך אליי — משהו שאת מרגישה בעצמך, או עבור מישהו קרוב?");
  }

  // ── ברכה בלבד / פתיחה ──
  if (has("היי", "הי", "שלום", "בוקר טוב", "ערב טוב", "מה נשמע", "הלו", "אהלן") && t.length <= 25) {
    return R("היי, כמה טוב שכתבת 💛 אני המענה של קטי שגב וכאן בשבילך. ספרי לי בכמה מילים מה מביא אותך — משהו שאת מרגישה בעצמך, או עבור מישהו קרוב?");
  }

  // ── ברירת מחדל — הכלה + שאלת גילוי ──
  if (firstContact) {
    return R("היי, כמה טוב שכתבת 💛 אני כאן כדי להקשיב. ספרי לי קצת מה מביא אותך — מה הכי מעסיק אותך בזמן האחרון?");
  }
  return R("אני איתך 💛 ספרי לי עוד קצת — מה הכי כבד עלייך עכשיו, או מה היית הכי רוצה שישתנה? ככה אוכל לכוון אותך לצעד הנכון עם קטי." + invite);
}

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.MODEL || "gpt-4o-mini";

// זיכרון שיחה בזיכרון התהליך: 10 הודעות אחרונות לכל פונה, פג אחרי 48 שעות.
const chats = new Map();
const MAX_TURNS = 10;
const TTL_MS = 48 * 60 * 60 * 1000;

function getChat(jid) {
  const now = Date.now();
  for (const [k, v] of chats) if (now - v.updated > TTL_MS) chats.delete(k);
  if (!chats.has(jid)) chats.set(jid, { history: [], updated: now, pausedUntil: 0, infoSent: false });
  return chats.get(jid);
}

export function isPaused(jid) {
  return getChat(jid).pausedUntil > Date.now();
}

export function pause(jid, hours = 12) {
  getChat(jid).pausedUntil = Date.now() + hours * 3600 * 1000;
}

export function resetChat(jid) {
  chats.delete(jid);
}

let globalPause = false;
let handled = 0;
const flagged = [];   // לידים חמים והתראות מצוקה

export function pauseAll(v) { globalPause = v; }
export function isGloballyPaused() { return globalPause; }
export function countHandled() { handled++; }

export function flag(from, text, alert) {
  flagged.unshift({ from, text, alert, at: Date.now() });
  if (flagged.length > 30) flagged.pop();
}

export function stats() {
  return { activeChats: chats.size, handled };
}

export function recentActivity() {
  const day = Date.now() - 24 * 3600 * 1000;
  const recent = flagged.filter(f => f.at > day);
  return {
    activeChats: chats.size,
    handled,
    hot: recent.filter(f => !f.alert).length,
    alerts: recent.filter(f => f.alert).length,
    flagged: recent
  };
}

// ── קריאה ל-OpenAI (Chat Completions) ──
async function callOpenAI(systemPrompt, messages, { retries = 1 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 600,
          temperature: 0.7,
          messages: [{ role: "system", content: systemPrompt }, ...messages]
        })
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
      }

      const data = await res.json();
      const text = (data.choices?.[0]?.message?.content || "").trim();
      if (text) return text;
      throw new Error("empty response");
    } catch (err) {
      lastError = err;
      console.error(`[brain] ניסיון ${attempt} נכשל:`, err.message);
      if (attempt < retries) await new Promise(r => setTimeout(r, attempt * 1500));
    }
  }
  throw lastError || new Error("openai failed");
}

/** שיחה עם קטי עצמה — פרומפט אחר, בלי הסמנים של הלידים */
export async function thinkAsOwner(jid, userText, systemPrompt, context) {
  const chat = getChat(jid);
  const messages = [...chat.history, { role: "user", content: userText }];

  try {
    const reply = await callOpenAI(systemPrompt + "\n\n" + context, messages, { retries: 2 });

    chat.history.push({ role: "user", content: userText });
    chat.history.push({ role: "assistant", content: reply });
    if (chat.history.length > MAX_TURNS * 2) chat.history = chat.history.slice(-MAX_TURNS * 2);
    chat.updated = Date.now();

    return reply || "לא הצלחתי לנסח תשובה, תנסי שוב.";
  } catch (e) {
    console.error("[brain owner]", e.message);
    return "רגע, לא הצלחתי להשלים את זה. תנסי שוב בעוד רגע 🙏";
  }
}

/**
 * שולח את ההודעה למודל ומחזיר תשובה מפורקת.
 * @returns {{reply:string, ended:boolean, alert:boolean, human:boolean, infoCard:boolean}}
 */
export async function think(jid, userText) {
  const chat = getChat(jid);

  const messages = [
    ...chat.history,
    { role: "user", content: userText }
  ];

  let raw = "";
  try {
    // עד שלושה ניסיונות, עם המתנה גדלה — מכסה תקלות רשת ועומס זמני
    raw = await callOpenAI(SYSTEM_PROMPT, messages, { retries: 3 });
  } catch (err) {
    console.error("[brain] OpenAI נכשל:", err?.message, "→ עונה במוח המקומי (CureMindset)");
    // מוח מקומי: עונה תשובה אמיתית וחמה גם בלי OpenAI, ושומר בהיסטוריית השיחה.
    const local = localReply(userText, chat);
    chat.history.push({ role: "user", content: userText });
    chat.history.push({ role: "assistant", content: local.reply });
    if (chat.history.length > MAX_TURNS * 2) chat.history = chat.history.slice(-MAX_TURNS * 2);
    chat.updated = Date.now();
    return local;
  }

  const ended = raw.includes("[[END]]");
  const alert = raw.includes("[[ALERT]]");
  const human = raw.includes("[[HUMAN]]");

  const reply = raw
    .replace(/\[\[END\]\]/g, "")
    .replace(/\[\[ALERT\]\]/g, "")
    .replace(/\[\[HUMAN\]\]/g, "")
    .trim();

  // שומרים בזיכרון את הטקסט הנקי בלבד
  chat.history.push({ role: "user", content: userText });
  chat.history.push({ role: "assistant", content: reply });
  if (chat.history.length > MAX_TURNS * 2) {
    chat.history = chat.history.slice(-MAX_TURNS * 2);
  }
  chat.updated = Date.now();

  // כרטיס הסיום נשלח פעם אחת בלבד לכל שיחה
  let infoCard = false;
  if (ended && !chat.infoSent) {
    infoCard = true;
    chat.infoSent = true;
  }

  return { reply, ended, alert, human, infoCard };
}
