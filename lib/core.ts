// הליבה — לא תלויה בערוץ. מקבלת הודעה נכנסת, מפעילה את המוח, ומחזירה
// את התשובות לשליחה + דגלים (מצוקה / מעבר לאדם / סיום). מתאמי הערוצים
// (וואטסאפ, ובהמשך אינסטגרם/מסנג'ר) קוראים לה ושולחים את מה שהיא מחזירה.

import { askClaude } from "./anthropic";
import { extractMarkers } from "./markers";
import { CLOSING_CARD, FALLBACK_MESSAGE } from "./prompt";
import { notifyKety } from "./push";
import { store, type ConvMeta, type ChatMsg } from "./redis";

// המוח מוזרק כדי שאפשר יהיה לבדוק את הליבה בלי קריאה אמיתית ל-Claude.
export type AskFn = (messages: ChatMsg[]) => Promise<string>;

export type IncomingMessage = {
  channel: string; // "whatsapp" | "instagram" | "messenger"
  userId: string; // מזהה הפונה בערוץ (מספר / PSID)
  text: string;
  messageId: string;
  name?: string;
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
    raw = await ask(messages);
  } catch (err) {
    console.error("[core] Claude נכשל — הודעת גיבוי:", (err as Error)?.message);
    await store.pushHistory(key, { role: "user", content: text }, { role: "assistant", content: FALLBACK_MESSAGE });
    await record(msg, key, text, "hot");
    alertKety(msg, key, text, history.length === 0, { alert: false, human: false, ended: false });
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
  if (m.alert) title = `🔴 מצוקה ${where} — כדאי לחזור עכשיו`;
  else if (m.human) title = `🙋 ביקשו לדבר איתך ${where}`;
  else if (m.ended) title = `📅 ליד ${where} קיבל קישור ליומן`;
  else if (isNew) title = `✨ פנייה חדשה ${where}`;
  if (!title) return;
  notifyKety(title, text, key).catch((e) => console.error("[push]", (e as Error).message));
}

async function record(msg: IncomingMessage, key: string, last: string, flag: ConvMeta["flag"]) {
  await store.recordConversation({
    key,
    channel: msg.channel,
    userId: msg.userId,
    name: msg.name,
    last: last.slice(0, 120),
    flag,
    updated: Date.now(),
  });
}
