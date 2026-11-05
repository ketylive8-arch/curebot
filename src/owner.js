import { recentActivity, pauseAll, isGloballyPaused, pause, resetChat } from "./brain.js";
import { listClients, clientCard, setStage, addAppointment, parseWhen, upcomingAppointments, summary } from "./office.js";

export const OWNER_SYSTEM = `את/ה העוזר/ת האישי/ת של קטי שגב, מנהלת הקליניקה CURE MINDSET.
קטי מדברת אלייך בוואטסאפ, לרוב בהודעה קולית שתומללה, ולכן הטקסט שאת/ה מקבל/ת עשוי להיות מדובר, לא ערוך, ועם שגיאות תמלול. הבן/י את הכוונה, אל תתקן/י אותה.

תפקידך: לתת לה תמונת מצב על הסוכן שעונה לפונות, ולעזור לה לנהל אותו.

סגנון:
- עברית טבעית, קצרה, ענייני. 2-5 שורות.
- ישר לעניין. בלי "בשמחה", בלי לחזור על השאלה.
- אם משהו לא ברור — שאלה אחת קצרה.

מה שאת/ה יודע/ת: נתוני הפעילות שמצורפים לך למטה. אל תמציא/י נתונים שאינם שם.
אם היא מבקשת פעולה שאין לך — תגיד/י בקצרה מה כן אפשר.

הפקודות הישירות שהמערכת מבינה בלי לעבור דרכך, וכדאי להזכיר אותן כשרלוונטי:
"סטטוס" · "לידים" · "לקוחות" · "לקוח 0501234567" · "שלב 0501234567 פגישה" ·
"פגישה 0501234567 מחר 10:00" · "פגישות" · "השהה" · "המשך" · "שלח ל0501234567: הטקסט"`;

/**
 * פקודות שמטופלות בקוד ולא עוברות למודל — מהיר ואמין.
 * מחזיר מחרוזת תשובה, או null אם זו לא פקודה מוכרת.
 */
export async function handleCommand(text, sock) {
  const t = text.trim();

  if (/^(סטטוס|status)$/i.test(t)) {
    const a = recentActivity();
    const o = summary();
    return (
      `סטטוס הסוכן\n` +
      `${isGloballyPaused() ? "⏸ מושהה" : "▶️ פעיל"}\n\n` +
      `שיחות פעילות: ${a.activeChats}\n` +
      `הודעות שנענו: ${a.handled}\n` +
      `לידים חמים היום: ${a.hot}\n` +
      `התראות מצוקה: ${a.alerts}\n\n` +
      `במשרד: ${o.clients} לקוחות · ${o.newClients} חדשים · ${o.meetings} בפגישה · ${o.closed} סגורים\n` +
      `פגישות קרובות: ${o.appointments}\n` +
      `מחכים לך: ${o.waiting}`
    );
  }

  if (/^(לידים|leads)$/i.test(t)) {
    const a = recentActivity();
    if (!a.flagged.length) return "אין לידים מסומנים כרגע.";
    return (
      `לידים שדורשים אותך:\n\n` +
      a.flagged
        .slice(0, 10)
        .map(f => `${f.alert ? "🔴" : "🟡"} ${f.from}\n"${f.text.slice(0, 70)}"`)
        .join("\n\n")
    );
  }

  // ── המשרד: לקוחות ופגישות ──

  if (/^(לקוחות|clients)$/i.test(t)) {
    const list = listClients(12);
    if (!list.length) return "עוד אין לקוחות במשרד. כל פנייה חדשה תיפתח כאן אוטומטית.";
    return (
      `הלקוחות האחרונים (${list.length}):\n\n` +
      list
        .map(c => `${c.alert ? "🔴" : c.needsYou ? "🟡" : "•"} ${c.name || c.phone} · ${c.stageLabel}\n   "${(c.lastText || "").slice(0, 60)}"`)
        .join("\n")
    );
  }

  const one = t.match(/^לקוח(?:ה)?\s+([0-9+\-\s]{9,16})$/);
  if (one) {
    const card = clientCard(one[1]);
    return card || "לא מצאתי לקוח עם המספר הזה.";
  }

  const stage = t.match(/^שלב\s+([0-9+\-\s]{9,16})\s+(.+)$/);
  if (stage) {
    const c = setStage(stage[1], stage[2]);
    if (c) return `✅ ${c.name || c.phone} עודכן לשלב: ${stage[2].trim()}`;
    return "לא הצלחתי לעדכן. אפשרויות השלב: חדש / בשיחה / פגישה / לקוח.";
  }

  if (/^(פגישות|יומן|appointments)$/i.test(t)) {
    const list = upcomingAppointments(10);
    if (!list.length) return "אין פגישות ביומן. אפשר לכתוב: \"פגישה 0501234567 מחר 10:00\".";
    return "הפגישות הקרובות:\n\n" + list.map(a => `📅 ${a.whenLabel} — ${a.name || a.phone}`).join("\n");
  }

  const appt = t.match(/^(?:קבע(?:י)?\s+)?פגישה\s+([0-9+\-\s]{9,16})\s+(.+)$/);
  if (appt) {
    const when = parseWhen(appt[2]);
    if (!when) return "לא הבנתי מתי. אפשר למשל: \"פגישה 0501234567 מחר 10:00\".";
    const a = addAppointment(appt[1], when, "");
    if (!a) return "לא הצלחתי לקבוע את הפגישה.";
    return `✅ נקבעה פגישה עם ${a.name || a.phone} ל-${when.toLocaleString("he-IL", { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}`;
  }

  if (/^(השהה|עצור|pause)$/i.test(t)) {
    pauseAll(true);
    return "⏸ הסוכן מושהה. הוא לא יענה לאף אחד עד שתכתבי \"המשך\".";
  }

  if (/^(המשך|הפעל|resume)$/i.test(t)) {
    pauseAll(false);
    return "▶️ הסוכן פעיל שוב.";
  }

  // שלח ל0501234567: הטקסט
  const send = t.match(/^שלח\s+ל\s*([0-9+\-\s]{9,15})\s*:\s*([\s\S]+)$/);
  if (send) {
    const digits = send[1].replace(/\D/g, "");
    const num = digits.startsWith("972") ? digits : "972" + digits.replace(/^0/, "");
    const body = send[2].trim();
    try {
      await sock.sendMessage(`${num}@s.whatsapp.net`, { text: body });
      // אחרי שליחה ידנית — הסוכן לא נכנס לשיחה הזו ל-12 שעות
      pause(`${num}@s.whatsapp.net`, 12);
      return `✅ נשלח ל-${num}. הסוכן לא יתערב בשיחה הזו ב-12 השעות הקרובות.`;
    } catch (e) {
      return `❌ השליחה נכשלה: ${e.message}`;
    }
  }

  if (/^(אפס שיחה|reset)\s+(.+)$/i.test(t)) {
    const num = t.split(/\s+/).pop().replace(/\D/g, "");
    resetChat(`${num.startsWith("972") ? num : "972" + num.replace(/^0/, "")}@s.whatsapp.net`);
    return "השיחה אופסה. בפנייה הבאה הסוכן מתחיל מאפס.";
  }

  return null;
}

/**
 * מענה ניהולי מקומי (כשאין OpenAI) — עונה לקטי מתוך הנתונים האמיתיים,
 * בעברית ענייני, ומכוון לפקודות הזמינות. לעולם לא "תקלה טכנית".
 */
export function localManageReply(text) {
  const t = (text || "").toLowerCase().trim();
  const a = recentActivity();
  const has = (...w) => w.some(x => t.includes(x));

  if (has("עזרה", "פקודות", "מה אפשר", "help")) {
    return (
      "אני העוזר הניהולי שלך 💛 הנה מה שאפשר לבקש:\n" +
      "• \"סטטוס\" — מצב הסוכן ומספרים\n" +
      "• \"לידים\" — מי פנה ודורש אותך\n" +
      "• \"לקוחות\" — כל הלקוחות והשלב שלהם\n" +
      "• \"לקוח 0501234567\" — כרטיס לקוח מלא\n" +
      "• \"שלב 0501234567 פגישה\" — לעדכן שלב (חדש / בשיחה / פגישה / לקוח)\n" +
      "• \"פגישה 0501234567 מחר 10:00\" — לקבוע פגישה\n" +
      "• \"פגישות\" — היומן הקרוב\n" +
      "• \"השהה\" / \"המשך\" — לעצור או להפעיל את המענה האוטומטי\n" +
      "• \"שלח ל0501234567: טקסט\" — לשלוח הודעה יזומה\n" +
      "• \"אפס שיחה 0501234567\" — להתחיל שיחה מחדש"
    );
  }
  if (has("כמה", "לידים", "פניות", "מצב", "סטטוס", "היום", "מה קורה", "מה המצב")) {
    return (
      `${isGloballyPaused() ? "⏸ הסוכן מושהה כרגע." : "▶️ הסוכן פעיל ועונה."}\n` +
      `שיחות פעילות: ${a.activeChats} · נענו: ${a.handled}\n` +
      `לידים חמים היום: ${a.hot} · התראות מצוקה: ${a.alerts}` +
      (a.flagged.length
        ? `\n\nממתינים לך:\n` + a.flagged.slice(0, 5).map(f => `${f.alert ? "🔴" : "🟡"} ${f.from} — "${f.text.slice(0, 50)}"`).join("\n")
        : `\n\nאין כרגע לידים שדורשים התייחסות אישית.`)
    );
  }
  if (has("מצוק", "דחוף", "אדום", "התראות")) {
    const alerts = a.flagged.filter(f => f.alert);
    if (!alerts.length) return "אין כרגע התראות מצוקה. 🙏";
    return "🔴 התראות שדורשות אותך:\n" + alerts.slice(0, 8).map(f => `${f.from} — "${f.text.slice(0, 60)}"`).join("\n");
  }
  // ברירת מחדל — מכוון בעדינות
  return (
    `אני כאן לנהל איתך את הסוכן 💛 אפשר לשאול "מה המצב היום", "לידים", או לכתוב "עזרה" לכל הפקודות.\n` +
    `כרגע: ${a.activeChats} שיחות פעילות, ${a.hot} לידים חמים, ${a.alerts} התראות.`
  );
}

/** ההקשר שנשלח למודל כשקטי שואלת שאלה חופשית */
export function ownerContext() {
  const a = recentActivity();
  const o = summary();
  const appts = upcomingAppointments(5);
  return (
    `נתוני הסוכן ברגע זה:\n` +
    `- מצב: ${isGloballyPaused() ? "מושהה" : "פעיל"}\n` +
    `- שיחות פעילות: ${a.activeChats}\n` +
    `- הודעות שנענו: ${a.handled}\n` +
    `- לידים חמים: ${a.hot}\n` +
    `- התראות מצוקה: ${a.alerts}\n` +
    `- לקוחות במשרד: ${o.clients} (${o.newClients} חדשים, ${o.meetings} בפגישה, ${o.closed} סגורים)\n` +
    `- פגישות קרובות: ` + (appts.length ? appts.map(x => `${x.whenLabel} ${x.name || x.phone}`).join(" · ") : "אין") + "\n" +
    (a.flagged.length
      ? `- מסומנים: ${a.flagged.slice(0, 5).map(f => `${f.from} (${f.alert ? "מצוקה" : "ביקשו אותך"})`).join(", ")}`
      : `- אין לידים מסומנים`)
  );
}
