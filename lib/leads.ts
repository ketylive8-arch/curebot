// כרטיס ליד: מי פנה, איך חוזרים אליו, ומה הוא צריך. נבנה אוטומטית מתוך השיחה —
// טלפון/מייל נשלפים בביטוי רגולרי (אמין), והשאר (שם, למי, נושא, סיכום) במודל קטן ומהיר.
import Anthropic from "@anthropic-ai/sdk";
import type { ChatMsg } from "./redis";

export type Lead = {
  name?: string;
  phone?: string; // בפורמט 9725XXXXXXXX
  email?: string;
  forWhom?: string; // "הורה לבת 14" / "לעצמה" / "רכזת בבית ספר"
  age?: string;
  city?: string;
  topic?: string; // במה מדובר, בכמה מילים
  stage?: string; // "שואלת שאלות" / "מעוניינת בשיחת היכרות" / "קיבלה קישור ליומן" / "ביקשה שקטי תחזור"
  summary?: string; // 1–2 משפטים לקטי
};

const PHONE_RE = /(?:\+?972[-\s]?|0)(5\d)[-\s]?(\d{3})[-\s]?(\d{4})\b/;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;

/** טלפון ישראלי נייד מטקסט חופשי → 9725XXXXXXXX */
export function findPhone(text: string): string | undefined {
  const m = text.match(PHONE_RE);
  return m ? `972${m[1]}${m[2]}${m[3]}` : undefined;
}
export function findEmail(text: string): string | undefined {
  return text.match(EMAIL_RE)?.[0];
}

/** 0501234567 לתצוגה */
export function prettyPhone(p?: string): string {
  if (!p) return "";
  const local = p.startsWith("972") ? "0" + p.slice(3) : p;
  return local.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3");
}

const client = new Anthropic();
const LEAD_MODEL = process.env.LEAD_MODEL || "claude-haiku-4-5-20251001";

const INSTRUCTIONS = `את/ה עוזר/ת של קטי שגב (קליניקה לליווי רגשי). לפניך שיחה בין פונה לבין העוזרת הדיגיטלית.
החזר/י JSON בלבד, בלי טקסט נוסף, עם השדות (בעברית, רק מה שנאמר במפורש — לא לנחש; שדה לא ידוע משמיטים):
{"name": שם הפונה, "forWhom": למי העזרה (למשל "הורה לבן 13", "לעצמה", "רכזת בבית ספר"), "age": גיל הילד/ה או הפונה,
 "city": עיר, "topic": במה מדובר בכמה מילים, "stage": אחד מ: "שואל/ת שאלות" | "מתעניין/ת בשיחת היכרות" | "קיבל/ה קישור ליומן" | "ביקש/ה שקטי תחזור" | "לא מעוניין/ת",
 "summary": משפט או שניים לקטי — מה קורה ומה הצעד הבא}`;

/** מעדכן כרטיס ליד מתוך השיחה. לא זורק — בכישלון מחזיר את מה שיש. */
export async function extractLead(history: ChatMsg[], prev: Lead = {}): Promise<Lead> {
  const userText = history.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  const lead: Lead = { ...prev };
  lead.phone = findPhone(userText) || lead.phone;
  lead.email = findEmail(userText) || lead.email;
  try {
    const convo = history.map((m) => `${m.role === "user" ? "פונה" : "עוזרת"}: ${m.content}`).join("\n");
    const resp = await client.messages.create({
      model: LEAD_MODEL,
      max_tokens: 400,
      system: INSTRUCTIONS,
      messages: [{ role: "user", content: convo }],
    });
    const raw = resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Lead;
    for (const k of ["name", "forWhom", "age", "city", "topic", "stage", "summary"] as const) {
      const v = json[k];
      if (typeof v === "string" && v.trim()) lead[k] = v.trim().slice(0, 300);
    }
  } catch (e) {
    console.error("[lead] חילוץ נכשל:", (e as Error).message);
  }
  return lead;
}
