// ============================================================
//  שומר החיבורים: כל 5 דקות בודק שכל מספר שנרשם למערכת מחובר לוואטסאפ ועונה.
//  מספר שהיה מחובר ונפל ליותר מ-10 דקות (או שנותק מהטלפון ומחכה לסריקה מחדש) —
//  נשלחת התראה לקטי ולמספר ההתראות של אותו חיבור. כשהוא חוזר — הודעה שחזר.
//  נפילות של שניות (קורה כמה פעמים ביום, החיבור חוזר לבד) לא מתריעות.
// ============================================================
import { listTenants, getTenant } from "./tenants.js";
import { getSession } from "./session.js";
import { ownerJid, pickSession } from "./notify.js";

const CHECK_MS = Number(process.env.WATCHDOG_MS || 5 * 60 * 1000);
const DOWN_MS = Number(process.env.WATCHDOG_DOWN_MS || 10 * 60 * 1000);
const REPEAT_MS = 6 * 3600 * 1000; // תזכורת אם עדיין לא מחובר
const phone = (d) => (d ? "0" + String(d).replace(/^972/, "") : "");

/** שולח התראה מחיבור מחובר כלשהו. אם רק החיבור של קטי מחובר — לצ'אט "אני" שלה. */
async function alert(to, text) {
  const s = pickSession() || listTenants().map(t => getSession(t.id)).find(x => x?.sock && x.state.status === "connected");
  if (!s) { console.error("[watchdog] אין אף חיבור מחובר לשליחת התראה:", text.split("\n")[0]); return false; }
  try { await s.send(to, { text }); return true; }
  catch (e) { console.error("[watchdog] שליחת התראה נכשלה:", e.message); return false; }
}

export function checkAll(now = Date.now(), sessionOf = getSession) {
  const out = [];
  for (const t of listTenants()) {
    const s = sessionOf(t.id);
    if (!s || s.stopped) continue;
    const up = s.state.status === "connected";
    const label = `${t.name}${s.state.me ? ` (${phone(s.state.me)})` : ""}`;
    if (up) {
      if (s.downAlertAt) {
        out.push({ id: t.id, msg: `✅ CureBot: החיבור "${label}" חזר לעבוד ועונה שוב.` });
        s.downAlertAt = 0;
      }
      continue;
    }
    if (!s.everConnected && !s.loggedOutAt) continue;       // חיבור חדש שעוד לא נסרק — אין מה להתריע
    if (!s.downSince || now - s.downSince < DOWN_MS) continue;
    if (s.downAlertAt && now - s.downAlertAt < REPEAT_MS) continue;
    s.downAlertAt = now;
    const mins = Math.round((now - s.downSince) / 60000);
    const why = s.state.status === "qr"
      ? "המכשיר נותק מוואטסאפ בטלפון. צריך לסרוק מחדש: וואטסאפ ← מכשירים מקושרים ← קישור מכשיר."
      : "החיבור לא מצליח לחזור. כדאי לבדוק שהטלפון דלוק ומחובר לאינטרנט.";
    out.push({ id: t.id, msg: `⚠️ CureBot: החיבור "${label}" לא מחובר כבר ${mins} דקות, והבוט לא עונה בו.\n${why}` });
  }
  return out;
}

export function startWatchdog() {
  setInterval(async () => {
    for (const { id, msg } of checkAll()) {
      console.log(`[watchdog] ${msg.split("\n")[0]}`);
      const kety = ownerJid();
      await alert(kety, msg);
      const own = getTenant(id)?.ownerNumber;
      if (own && `${own}@s.whatsapp.net` !== kety) await alert(`${own}@s.whatsapp.net`, msg);
    }
  }, CHECK_MS).unref?.();
}
