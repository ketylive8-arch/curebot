// משפך המעקבים: חזרה במועד שהפונה ביקש/ה, ופולואפ שבוע אחרי שנשלחה הצעה.
// כל מעקב נשמר ב-Redis עם מועד; לולאה בשרת (instrumentation) בודקת כל דקה מה הגיע זמנו:
// חזרה מבוקשת — התראה לקטי בטלפון; פולואפ להצעה — הודעת ערך קצרה שנשלחת לפונה בוואטסאפ.
import { randomBytes } from "crypto";
import { kv } from "./kv";
import { store } from "./redis";
import { notifyKety } from "./push";
import { prettyPhone } from "./leads";

export type Followup = {
  id: string;
  key: string; // מפתח השיחה (whatsapp:972… / try:…)
  kind: "callback" | "offer";
  due: number;
  note: string;
  name?: string;
  phone?: string;
  status: "pending" | "done" | "sent" | "cancelled";
  created: number;
  result?: string;
};

const TZ = "Asia/Jerusalem";

/** "2026-11-14 10:00" בשעון ישראל → epoch ms. מחזיר null אם לא תקין. */
export function parseIsraelTime(s: string): number | null {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (!m) return null;
  const [y, mo, d, h = "10", mi = "00"] = m.slice(1);
  const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  // ההפרש בין שעון ישראל ל-UTC באותו רגע (מתחשב בשעון קיץ)
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(asUtc)).reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {});
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
  const t = asUtc - (local - asUtc);
  return Number.isFinite(t) ? t : null;
}

export const israelNow = () =>
  new Date().toLocaleString("he-IL", { timeZone: TZ, weekday: "long", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const prettyWhen = (t: number) =>
  new Date(t).toLocaleString("he-IL", { timeZone: TZ, weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

export async function addFollowup(f: Omit<Followup, "id" | "status" | "created">): Promise<Followup> {
  const item: Followup = { ...f, id: randomBytes(5).toString("hex"), status: "pending", created: Date.now() };
  await kv.set(`fu:item:${item.id}`, item, 120 * 24 * 3600);
  await kv.zadd("fu:all", item.due, item.id);
  return item;
}

export async function listFollowups(limit = 100): Promise<Followup[]> {
  const ids = await kv.zrevrange("fu:all", limit);
  const items = await Promise.all(ids.map((id) => kv.get<Followup>(`fu:item:${id}`)));
  return items.filter((x): x is Followup => !!x).sort((a, b) => a.due - b.due);
}

export async function setFollowupStatus(id: string, status: Followup["status"], result?: string) {
  const f = await kv.get<Followup>(`fu:item:${id}`);
  if (!f) return null;
  const next = { ...f, status, ...(result ? { result } : {}) };
  await kv.set(`fu:item:${id}`, next, 120 * 24 * 3600);
  return next;
}

/** כל מי שביקש/ה הסרה — לא מקבל/ת מעקבים. */
export async function cancelFollowupsFor(key: string) {
  for (const f of await listFollowups(200)) if (f.key === key && f.status === "pending") await setFollowupStatus(f.id, "cancelled", "ביקש/ה הסרה");
}

type Ask = (messages: { role: "user" | "assistant"; content: string }[], extra?: string) => Promise<string>;
type Send = (phone: string, text: string) => Promise<void>;

/** מריץ את כל המעקבים שהגיע זמנם. נקרא כל דקה. */
export async function runDueFollowups(ask: Ask, send: Send) {
  const now = Date.now();
  for (const f of await listFollowups(200)) {
    if (f.status !== "pending" || f.due > now) continue;
    const who = [f.name, prettyPhone(f.phone)].filter(Boolean).join(" · ") || "פונה";
    if (f.kind === "callback") {
      await setFollowupStatus(f.id, "done", "נשלחה תזכורת לקטי");
      await notifyKety(`⏰ הזמן לחזור ל${who}`, f.note || "ביקש/ה שתחזרי במועד הזה", f.key);
      continue;
    }
    // פולואפ להצעה: הודעת ערך קצרה בקול של קטי, על בסיס השיחה
    const { history } = await store.getConversation(f.key);
    let text = "";
    try {
      text = (await ask(
        [...history.slice(-12), { role: "user", content: "(הודעה פנימית מהמערכת, לא מהפונה)" }],
        `=== משימה: פולואפ שבוע אחרי הצעה ===
עבר שבוע מאז שקטי שלחה הצעה לפונה הזה${f.note ? ` (${f.note})` : ""}. כתבי הודעת וואטסאפ אחת, קצרה (2–3 משפטים), בקול של קטי:
שאלה חמה מה קורה, תובנה אחת של ערך שקשורה למה שהפונה סיפר/ה, ומשפט אחד על מה מבדיל את הליווי של קטי ולמה זה שווה לו/לה עכשיו.
בלי לחץ, בלי מחירים שלא נאמרו, בלי סמנים. אפשר להזכיר את הקישור ליומן. מחזירים רק את נוסח ההודעה.`,
      )).replace(/\[\[[^\]]*\]\]/g, "").trim();
    } catch (e) {
      console.error("[followup] ניסוח נכשל:", (e as Error).message);
    }
    if (!text) continue; // ננסה שוב בדקה הבאה
    if (f.phone && f.key.startsWith("whatsapp:")) {
      await send(f.phone, text);
      await store.pushHistory(f.key, { role: "user", content: "(פולואפ אוטומטי שבוע אחרי ההצעה)" }, { role: "assistant", content: text });
      await setFollowupStatus(f.id, "sent", text);
      await notifyKety(`📨 נשלח פולואפ ל${who}`, text, f.key);
    } else {
      await setFollowupStatus(f.id, "done", text);
      await notifyKety(`📨 הגיע זמן פולואפ ל${who} — נוסח מוכן`, text, f.key);
    }
  }
}
