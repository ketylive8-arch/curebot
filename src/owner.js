import { recentActivity, pauseAll, isGloballyPaused, pause, resetChat } from "./brain.js";

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
"סטטוס" · "לידים" · "השהה" · "המשך" · "שלח ל0501234567: הטקסט"`;

/**
 * פקודות שמטופלות בקוד ולא עוברות למודל — מהיר ואמין.
 * מחזיר מחרוזת תשובה, או null אם זו לא פקודה מוכרת.
 */
export async function handleCommand(text, sock) {
  const t = text.trim();

  if (/^(סטטוס|status)$/i.test(t)) {
    const a = recentActivity();
    return (
      `סטטוס הסוכן\n` +
      `${isGloballyPaused() ? "⏸ מושהה" : "▶️ פעיל"}\n\n` +
      `שיחות פעילות: ${a.activeChats}\n` +
      `הודעות שנענו: ${a.handled}\n` +
      `לידים חמים היום: ${a.hot}\n` +
      `התראות מצוקה: ${a.alerts}`
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

/** ההקשר שנשלח למודל כשקטי שואלת שאלה חופשית */
export function ownerContext() {
  const a = recentActivity();
  return (
    `נתוני הסוכן ברגע זה:\n` +
    `- מצב: ${isGloballyPaused() ? "מושהה" : "פעיל"}\n` +
    `- שיחות פעילות: ${a.activeChats}\n` +
    `- הודעות שנענו: ${a.handled}\n` +
    `- לידים חמים: ${a.hot}\n` +
    `- התראות מצוקה: ${a.alerts}\n` +
    (a.flagged.length
      ? `- מסומנים: ${a.flagged.slice(0, 5).map(f => `${f.from} (${f.alert ? "מצוקה" : "ביקשו אותך"})`).join(", ")}`
      : `- אין לידים מסומנים`)
  );
}
