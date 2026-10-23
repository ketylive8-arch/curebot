// דוח שיחות חד-פעמי ללוגים של השרת — כדי שאפשר יהיה לסכם לקטי מי פנה ומאיפה,
// גם מסביבה שלא מגיעה ללוח הבקרה. פועל רק כש-DIGEST_UNTIL בעתיד (חלון קצר),
// ומדפיס טלפון מוסתר חלקית. הפרטים המלאים — בלוח הבקרה בלבד.
import { store } from "./redis";

const mask = (p?: string) => (p ? "0" + p.replace(/^972/, "").slice(0, 2) + "-xxx-x" + p.slice(-3) : "");

export async function logDigest() {
  const until = Date.parse(process.env.DIGEST_UNTIL || "");
  if (!until || Date.now() > until) return;
  const list = (await store.listConversations(50)).filter((c) => c.channel !== "demo");
  console.log(`[digest] ${list.length} שיחות אחרונות (ללא דמו):`);
  for (const c of list) {
    const l = c.lead || {};
    const when = new Date(c.created || c.updated).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
    console.log(
      "[digest] " +
        [when, c.channel === "try" ? "אתר" : c.channel, c.source && `מקור: ${c.source}`, l.name && `שם: ${l.name}`,
          l.phone ? `טלפון: ${mask(l.phone)}` : "בלי טלפון", l.forWhom, l.topic, l.stage, `דגל: ${c.flag || "-"}`,
          `סיכום: ${(l.summary || c.last || "").slice(0, 160)}`].filter(Boolean).join(" | "),
    );
  }
}
