import { SYSTEM_PROMPT } from "./prompt.js";

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.MODEL || "claude-sonnet-4-6";

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

/** שיחה עם קטי עצמה — פרומפט אחר, בלי הסמנים של הלידים */
export async function thinkAsOwner(jid, userText, systemPrompt, context) {
  const chat = getChat(jid);
  const messages = [...chat.history, { role: "user", content: userText }];

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        system: systemPrompt + "\n\n" + context,
        messages
      })
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const reply = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();

    chat.history.push({ role: "user", content: userText });
    chat.history.push({ role: "assistant", content: reply });
    if (chat.history.length > MAX_TURNS * 2) chat.history = chat.history.slice(-MAX_TURNS * 2);
    chat.updated = Date.now();

    return reply || "לא הצלחתי לנסח תשובה, תנסי שוב.";
  } catch (e) {
    console.error("[brain owner]", e.message);
    return "יש תקלה בחיבור למודל. תנסי שוב בעוד רגע.";
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
  let lastError = null;

  // עד שלושה ניסיונות, עם המתנה גדלה — מכסה תקלות רשת ועומס זמני
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages
        })
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
      }

      const data = await res.json();
      raw = (data.content || [])
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("")
        .trim();

      if (raw) break;
      throw new Error("empty response");
    } catch (err) {
      lastError = err;
      console.error(`[brain] ניסיון ${attempt} נכשל:`, err.message);
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1500));
    }
  }

  if (!raw) {
    console.error("[brain] כל הניסיונות נכשלו:", lastError?.message);
    return {
      reply: "קיבלתי את ההודעה שלך 🙏 יש אצלנו תקלה טכנית קטנה ברגע זה — קטי תחזור אלייך אישית בהקדם.",
      ended: false, alert: true, human: true, infoCard: false
    };
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
