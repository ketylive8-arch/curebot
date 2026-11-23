// ============================================================
//  תזכורת אחרי שבוע — לפונה שאמר/ה "אחשוב על זה" / "יקר לי" / "אין לי זמן".
//  הודעה עדינה אחת בלבד, בתוך אותה שיחה (לא פונים למי שלא כתב לנו).
//  נשמר בדיסק (שורד הפעלה מחדש). מתבטל כש: הפונה כתב/ה שוב, קבע/ה, אמר/ה "לא",
//  או כשבעל/ת החיבור ענה/תה ידנית בשיחה. נשלח רק בשעות סבירות בישראל.
// ============================================================
import fs from "fs";
import path from "path";
import { authDirOf } from "./tenants.js";
import { CALENDLY } from "./prompt.js";

export const FOLLOWUP_MS = Number(process.env.FOLLOWUP_MS || 7 * 24 * 3600 * 1000);

const fileOf = (id) => path.join(path.dirname(authDirOf(id)), "followups.json");
export function loadFollowups(id) {
  try { return new Map(Object.entries(JSON.parse(fs.readFileSync(fileOf(id), "utf8")))); } catch { return new Map(); }
}
export function saveFollowups(id, map) {
  try {
    const f = fileOf(id);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f + ".tmp", JSON.stringify(Object.fromEntries(map)));
    fs.renameSync(f + ".tmp", f);
  } catch (e) { console.error(`[${id}] שמירת תזכורות נכשלה:`, e.message); }
}

/** שעות סבירות בישראל: א-ה 10:00-19:59, ו' 10:00-12:59, לא בשבת. */
export function goodHour(now = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", weekday: "short", hour: "numeric", hour12: false })
    .formatToParts(new Date(now)).map(p => [p.type, p.value]));
  const h = Number(parts.hour) % 24;
  if (parts.weekday === "Sat") return false;
  if (parts.weekday === "Fri") return h >= 10 && h < 13;
  return h >= 10 && h < 20;
}

export function followupText(profile) {
  if (profile?.kind === "business") {
    const name = profile.businessName || "אנחנו";
    return `היי 🙂 כאן ${name}. רציתי לבדוק מה שלומך ואם עדיין רלוונטי לך.${profile.bookingLink ? `\nאם מתאים, אפשר לקבוע כאן: ${profile.bookingLink}` : ""}\nאו פשוט לכתוב לי יום ושעה שנוחים לך 🙏`;
  }
  return `היי, כאן המענה של קטי 💛 רציתי לבדוק מה שלומך מאז שדיברנו, ואיך את מרגישה.\n` +
    `אם עדיין מתאים לך, שיחת ההיכרות עם קטי עדיין פתוחה — קצרה, בלי עלות ובלי התחייבות, רק להכיר ולראות אם זה מדבר אלייך.\n\n` +
    `אפשר לבחור זמן כאן: ${CALENDLY}\nאו לכתוב לי יום ושעה שנוחים לך, ואני אדאג שקטי תחזור אלייך 🙏`;
}
