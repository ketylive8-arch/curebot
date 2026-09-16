import { SYSTEM_PROMPT, CALENDLY } from "./prompt.js";

// ── מוח מקומי (fallback) — עונה בשיטת CureMindset גם כש-OpenAI לא זמין/אין קרדיט.
// מזהה את סוג הפנייה לפי מילות מפתח ומחזיר תשובה חמה שמובילה לפגישה.
function localReply(userText) {
  const t = (userText || "").toLowerCase();
  const has = (...words) => words.some(w => t.includes(w));
  const invite = `\n\nבא לך שנתאם שיחת היכרות קצרה עם קטי, בלי התחייבות? אפשר לבחור זמן שנוח לך כאן:\n${CALENDLY}`;

  // בטיחות — מצוקה
  if (has("אובדנ", "לפגוע בעצמי", "לא רוצה לחיות", "להתאבד", "פגיעה עצמית")) {
    return { reply: "אני ממש שמחה שכתבת, ואני רוצה שתדעי שאת לא לבד 💛 מה שאת מרגישה חשוב, וקטי תחזור אלייך אישית בהקדם. אם זה דחוף או קשה מאוד ברגע זה — יש קו תמיכה חם וזמין 24/7, ער\"ן בטלפון 1201. את יקרה וחשובה.", ended: false, alert: true, human: true, infoCard: false };
  }
  // בקשה לדבר עם אדם
  if (has("לדבר עם קטי", "בן אדם", "בנאדם", "אנושי", "לדבר עם מישהו", "נציג")) {
    return { reply: "בטח 💛 אני מעבירה לקטי והיא תחזור אלייך אישית בהקדם.", ended: false, alert: false, human: true, infoCard: false };
  }
  // מחיר
  if (has("מחיר", "כמה עולה", "עלות", "תשלום", "כמה זה")) {
    return { reply: "שאלה חשובה 🙏 המחיר מותאם אישית לפי מה שנכון עבורך, וקטי עוברת על זה יחד איתך בשיחת ההיכרות (ללא עלות)." + invite, ended: false, alert: false, human: false, infoCard: false };
  }
  // הורה / ילד / נוער
  if (has("בן שלי", "בת שלי", "הילד", "הילדה", "נוער", "מתבגר", "מתבגרת", "בית ספר", "ילדים")) {
    return { reply: "אני שומעת כמה חשוב לך לעזור לו/ה — זה אומר עלייך המון 💛 קשיים כאלה בגיל הזה זה מקום שאפשר בהחלט לעבוד איתו, אישית או בקבוצות החוסן לנוער. קטי תתאים את הדרך הנכונה בעדינות ובקצב שלו/ה." + invite, ended: false, alert: false, human: false, infoCard: false };
  }
  // כאבים / מיגרנה
  if (has("כאב", "מיגרנ", "כאבים", "ראש")) {
    return { reply: "אני שומעת אותך 💛 לגוף יש לא פעם שפה רגשית, ובשיטה עובדים על השורש הרגשי שמשפיע גם על הגוף (בלי להחליף מעקב רפואי). רבים חווים הקלה כשנוגעים ברגש שמאחורי התסמין." + invite, ended: false, alert: false, human: false, infoCard: false };
  }
  // מסכים / התמכרות
  if (has("מסך", "מסכים", "טלפון", "התמכר", "משחקים")) {
    return { reply: "מובן לגמרי, וזה בסדר להתחיל ממך 💛 לרוב מאחורי המסך מסתתר ויסות רגשי שחסר — וכשמחזקים את החוסן הרגשי, הצורך לברוח פוחת." + invite, ended: false, alert: false, human: false, infoCard: false };
  }
  // חרדה / לחץ / תקיעות
  if (has("חרד", "לחץ", "פאניק", "מתח", "תקוע", "דיכא", "עצב", "ביטחון", "דימוי")) {
    return { reply: "אני שומעת אותך, וזה אמיץ לכתוב את זה 💛 מה שאת מתארת הוא דפוס שאפשר לרכך — הוא לא גזירת גורל. הדרך של קטי עובדת בדיוק על השורש, לא רק להרגיע לרגע." + invite, ended: false, alert: false, human: false, infoCard: false };
  }
  // מה השיטה / מה את עושה / מה מעבירה
  if (has("שיטה", "מה את עוש", "מה את מעביר", "מה זה", "פעילות", "סדנ", "חינוך", "טיפול", "אימון")) {
    return { reply: "בשמחה 💛 CureMindset היא עבודה רגשית שבונה חוסן — טיפול ואימון מבוססי NLP שעובדים על השורש של הדפוס, בתהליך קצר וממוקד שמחזק דימוי עצמי וביטחון. \"החופש להוביל. העוצמה להגשים.\"" + invite, ended: false, alert: false, human: false, infoCard: false };
  }
  // ברירת מחדל / ברכה
  return { reply: "היי, כמה טוב שכתבת 💛 אני כאן בשבילך. ספרי לי בכמה מילים מה מביא אותך — משהו שאת מרגישה בעצמך, או עבור מישהו קרוב?", ended: false, alert: false, human: false, infoCard: false };
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
    const local = localReply(userText);
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
