import { SYSTEM_PROMPT, CALENDLY } from "./prompt.js";

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

  // ── הסכמה/עניין לתאם ──
  if (has("כן", "בא לי", "אשמח", "מעוניינ", "רוצה לתאם", "רוצה פגישה", "נשמע טוב", "מתי אפשר", "קדימה", "בשמחה")) {
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

// ── אבחון OpenAI: בודק לאיזה ארגון/פרויקט שייך המפתח והאם יש קרדיט.
// רץ פעם אחת בעליית השרת, ומדפיס ללוג תמונה מדויקת כדי לאתר את בעיית הקרדיט.
export async function diagnoseOpenAI() {
  if (!API_KEY) { console.log("[diag] ⚠️ אין OPENAI_API_KEY מוגדר"); return; }
  console.log(`[diag] מפתח OpenAI מוגדר (מסתיים ב-...${API_KEY.slice(-4)}), מודל:${MODEL}`);
  try {
    const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${API_KEY}` } });
    console.log(`[diag] models: HTTP ${r.status} | org:${r.headers.get("openai-organization")} | project:${r.headers.get("openai-project")}`);
  } catch (e) { console.log("[diag] models שגיאה:", e.message); }
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1, messages: [{ role: "user", content: "hi" }] })
    });
    const b = await r.text();
    if (r.ok) console.log("[diag] ✅ בדיקת שיחה הצליחה — יש קרדיט, OpenAI פעיל!");
    else console.log(`[diag] ❌ בדיקת שיחה נכשלה: HTTP ${r.status} | ${b.slice(0, 220)}`);
  } catch (e) { console.log("[diag] completion שגיאה:", e.message); }
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
    // כרטיס המידע נשלח פעם אחת בלבד לכל שיחה — שלא יחזור אחרי כל הודעה.
    if (local.infoCard && chat.infoSent) local.infoCard = false;
    else if (local.infoCard) chat.infoSent = true;
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
