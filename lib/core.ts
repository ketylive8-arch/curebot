// הליבה — לא תלויה בערוץ. מקבלת הודעה נכנסת, מפעילה את המוח, ומחזירה
// את התשובות לשליחה + דגלים (מצוקה / מעבר לאדם / סיום). מתאמי הערוצים
// (וואטסאפ, ובהמשך אינסטגרם/מסנג'ר) קוראים לה ושולחים את מה שהיא מחזירה.

import { askClaude } from "./anthropic";
import { extractMarkers } from "./markers";
import { CLOSING_CARD, FALLBACK_MESSAGE } from "./prompt";
import { notifyKety } from "./push";
import { extractLead, prettyPhone } from "./leads";
import { store, type ConvMeta, type ChatMsg } from "./redis";

// המוח מוזרק כדי שאפשר יהיה לבדוק את הליבה בלי קריאה אמיתית ל-Claude.
export type AskFn = (messages: ChatMsg[], extraSystem?: string) => Promise<string>;

export type IncomingMessage = {
  channel: string; // "whatsapp" | "instagram" | "messenger"
  userId: string; // מזהה הפונה בערוץ (מספר / PSID)
  text: string;
  messageId: string;
  name?: string;
  source?: string; // באתר: העמוד/הקמפיין שממנו נפתח הצ'אט
};

export type HandleResult = {
  replies: string[]; // הודעות לשליחה, לפי הסדר
  alert: boolean; // מצוקה — התראה מיידית
  human: boolean; // ביקש/ה אדם
  ended: boolean;
  skipped?: "duplicate" | "global-pause" | "paused" | "empty";
};

const EMPTY: Omit<HandleResult, "skipped"> = { replies: [], alert: false, human: false, ended: false };

export async function handleIncoming(msg: IncomingMessage, ask: AskFn = askClaude): Promise<HandleResult> {
  const key = `${msg.channel}:${msg.userId}`;
  const text = (msg.text || "").trim();

  if (!text) return { ...EMPTY, skipped: "empty" };
  if (msg.messageId && (await store.seenMessage(msg.messageId))) {
    return { ...EMPTY, skipped: "duplicate" };
  }
  if (await store.isGloballyPaused()) return { ...EMPTY, skipped: "global-pause" };
  if (await store.isPaused(key)) return { ...EMPTY, skipped: "paused" };

  const history = await store.getHistory(key);
  const messages = [...history, { role: "user" as const, content: text }];

  let raw: string;
  try {
    raw = await ask(messages, channelContext(msg.channel));
  } catch (err) {
    console.error("[core] Claude נכשל — הודעת גיבוי:", (err as Error)?.message);
    await store.pushHistory(key, { role: "user", content: text }, { role: "assistant", content: FALLBACK_MESSAGE });
    await record(msg, key, text, "hot");
    updateLead(msg, key, history.length === 0).catch(() => {});
    return { ...EMPTY, replies: [FALLBACK_MESSAGE] };
  }

  const { text: reply, markers } = extractMarkers(raw);
  await store.pushHistory(key, { role: "user", content: text }, { role: "assistant", content: reply });

  const replies = [reply];

  // כרטיס סיום — פעם אחת בלבד לכל שיחה
  if (markers.ended && !(await store.isInfoSent(key))) {
    await store.markInfoSent(key);
    replies.push(CLOSING_CARD);
  }

  // מעבר לאדם / מצוקה — משהים את הבוט בשיחה הזו
  if (markers.human || markers.alert) {
    await store.pause(key, 24);
  }

  const flag: ConvMeta["flag"] = markers.alert
    ? "alert"
    : markers.human
    ? "human"
    : markers.ended
    ? "ended"
    : "hot";
  await record(msg, key, text, flag);
  alertKety(msg, key, text, history.length === 0, markers);
  updateLead(msg, key, history.length === 0).catch((e) => console.error("[lead]", (e as Error).message));

  return { replies, alert: markers.alert, human: markers.human, ended: markers.ended };
}

// התראה לטלפון של קטי: פנייה חדשה, בקשה לדבר איתה, מצוקה או שיחה שנסגרה. לא בדמו הפנימי.
function alertKety(
  msg: IncomingMessage, key: string, text: string, isNew: boolean,
  m: { alert: boolean; human: boolean; ended: boolean },
) {
  if (msg.channel === "demo") return;
  const where = msg.channel === "whatsapp" ? "בוואטסאפ" : "מהאתר";
  let title = "";
  if (m.alert) title = `🔴 מצוקה ${where}, כדאי לחזור עכשיו`;
  else if (m.human) title = `🙋 ביקשו לדבר איתך ${where}`;
  else if (m.ended) title = `📅 ליד ${where} קיבל קישור ליומן`;
  if (!title) return; // פנייה חדשה מתריעה מתוך updateLead, אחרי שיש סיכום
  notifyKety(title, text, key).catch((e) => console.error("[push]", (e as Error).message));
}

async function record(msg: IncomingMessage, key: string, last: string, flag: ConvMeta["flag"]) {
  // שומרים על מה שכבר נאסף (כרטיס ליד, מקור, מועד הפנייה הראשונה)
  const prev = (await store.getConversation(key)).meta;
  await store.recordConversation({
    key,
    channel: msg.channel,
    userId: msg.userId,
    name: msg.name || prev?.name,
    last: last.slice(0, 120),
    flag,
    updated: Date.now(),
    created: prev?.created || Date.now(),
    source: prev?.source || msg.source,
    lead: prev?.lead,
  });
}

// הקשר לפי ערוץ: באתר אין לנו את מספר הטלפון של הפונה, ולכן מבקשים אותו בעדינות.
function channelContext(channel: string): string | undefined {
  if (channel !== "try") return undefined;
  return `=== הקשר: צ'אט באתר ===
השיחה הזו מתקיימת בצ'אט באתר של קטי, לא בוואטסאפ. אין לך את מספר הטלפון של הפונה, ובלי פרטים קטי לא תוכל לחזור.
- לא מבקשים פרטים בהודעה הראשונה. קודם מקשיבים ומבינים.
- אם הפונה חרד/ה או מוצף/ת עכשיו — קודם מרגיעים (כלי הרגעה אחד), ורק אחרי שקצת נרגע/ה מבקשים פרטים. לא באמצע התקף.
- בתשובה השנייה או השלישית שלך, ברגע שהבנת במה מדובר (או מיד כשיש עניין: רוצה שיחה, שואל/ת על מחיר או התאמה, מבקש/ת את קטי) — מבקשים בעדינות שם ומספר וואטסאפ, למשל: "כדי שקטי תוכל לחזור אלייך אישית, איך קוראים לך ומה מספר הוואטסאפ שלך?". אנשים באתר יוצאים מהר — אל תחכי יותר מדי.
- אחרי שנתנו: מודים בקצרה ואומרים שקטי תחזור. אפשר להציע גם קישור ליומן (עם [[END]]).
- לא רוצים לתת פרטים — בסדר גמור, לא לוחצים. מציעים את הקישור ליומן.
- מבקשים פעם אחת בלבד; לא חוזרים על הבקשה בכל הודעה.`;
}

// מעדכן את כרטיס הליד אחרי כל הודעה, ומתריע לקטי ברגע שיש טלפון חדש.
async function updateLead(msg: IncomingMessage, key: string, isNew = false) {
  if (msg.channel === "demo") return;
  const { meta, history } = await store.getConversation(key);
  if (!meta) return;
  const prevPhone = meta.lead?.phone;
  const lead = await extractLead(history, meta.lead || {});
  if (msg.channel === "whatsapp" && !lead.phone) lead.phone = msg.userId; // בוואטסאפ המספר ידוע
  // קוראים שוב את המצב העדכני (ייתכן שבינתיים הגיעה הודעה נוספת) ומעדכנים רק את הכרטיס
  const latest = (await store.getConversation(key)).meta || meta;
  await store.recordConversation({ ...latest, lead: { ...latest.lead, ...lead } });
  const where = msg.channel === "whatsapp" ? "בוואטסאפ" : "מהאתר";
  const about = [lead.forWhom, lead.topic].filter(Boolean).join(" · ");
  if (isNew) {
    notifyKety(`✨ פנייה חדשה ${where}${about ? ": " + about : ""}`, lead.summary || msg.text, key).catch(() => {});
  }
  if (lead.phone && lead.phone !== prevPhone && msg.channel !== "whatsapp") {
    const who = [lead.name, prettyPhone(lead.phone)].filter(Boolean).join(" · ");
    notifyKety(`📞 ליד עם טלפון מהאתר: ${who}`, lead.summary || lead.topic || msg.text, key).catch(() => {});
  }
}
