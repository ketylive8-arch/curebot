// משימות ביומן של קטי: כל מעקב (חזרה מבוקשת / פולואפ להצעה) נשלח כהזמנת יומן למייל שלה.
// Gmail מוסיף הזמנות כאלה ליומן Google אוטומטית, עם תזכורת. בנוסף נבנה קישור "הוספה ליומן"
// ללוח הבקרה, למקרה שהמייל לא יצא (בלי RESEND_API_KEY / OWNER_EMAIL).
import { Resend } from "resend";
import type { Followup } from "./followups";
import { prettyPhone } from "./leads";

const stamp = (t: number) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export function taskTitle(f: Followup): string {
  const who = [f.name, prettyPhone(f.phone)].filter(Boolean).join(" · ") || "פונה";
  return f.kind === "callback" ? `📞 לחזור ל${who}` : `📨 פולואפ להצעה · ${who}`;
}

export function taskDetails(f: Followup): string {
  return [
    f.kind === "callback" ? `ביקש/ה שתחזרי במועד הזה: "${f.note}"` : "שבוע אחרי ההצעה. CureBot שולח הודעת ערך קצרה בוואטסאפ ומעדכן אותך.",
    f.phone ? `וואטסאפ: https://wa.me/${f.phone}` : "",
    "השיחה המלאה: https://curebot-agent.onrender.com/admin",
  ].filter(Boolean).join("\n");
}

/** קישור "הוספה ליומן Google" עם כל הפרטים מוכנים. */
export function googleCalendarLink(f: Followup): string {
  const q = new URLSearchParams({
    action: "TEMPLATE", text: taskTitle(f), details: taskDetails(f),
    dates: `${stamp(f.due)}/${stamp(f.due + 15 * 60000)}`, ctz: "Asia/Jerusalem",
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

export function inviteIcs(f: Followup, to: string): string {
  return [
    "BEGIN:VCALENDAR", "PRODID:-//CureBot//Followups//HE", "VERSION:2.0", "METHOD:REQUEST", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:curebot-${f.id}@curebot-agent.onrender.com`,
    `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(f.due)}`, `DTEND:${stamp(f.due + 15 * 60000)}`,
    `SUMMARY:${esc(taskTitle(f))}`, `DESCRIPTION:${esc(taskDetails(f))}`,
    "ORGANIZER;CN=CureBot:mailto:onboarding@resend.dev",
    `ATTENDEE;CN=קטי;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${to}`,
    "STATUS:CONFIRMED", "SEQUENCE:0",
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(taskTitle(f))}`, "TRIGGER:-PT10M", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

/** שולח את המשימה ליומן של קטי. לא זורק — מחזיר אם נשלח. */
export async function sendCalendarTask(f: Followup): Promise<boolean> {
  const key = process.env.RESEND_API_KEY, to = process.env.OWNER_EMAIL;
  if (!key || !to) return false;
  try {
    const ics = inviteIcs(f, to);
    const r = await new Resend(key).emails.send({
      from: "CureBot <onboarding@resend.dev>", to, subject: taskTitle(f),
      text: `${taskDetails(f)}\n\nהמשימה נוספה ליומן שלך.`,
      attachments: [{ filename: "invite.ics", content: Buffer.from(ics).toString("base64"), contentType: "text/calendar; charset=utf-8; method=REQUEST" }],
    });
    if ((r as { error?: { message?: string } }).error) throw new Error((r as { error: { message?: string } }).error.message || "resend error");
    console.log(`[calendar] משימה נשלחה ליומן: ${taskTitle(f)}`);
    return true;
  } catch (e) {
    console.error("[calendar] שליחה ליומן נכשלה:", (e as Error).message);
    return false;
  }
}
