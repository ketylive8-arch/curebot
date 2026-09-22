// Webhook של מטא — GET לאימות, POST לקבלת הודעות.
// מחזיר 200 מיד ומעבד ברקע (waitUntil) כדי שמטא לא תשלח שוב.
import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { handleIncoming } from "@/lib/core";
import { notifyOwner } from "@/lib/alerts";
import {
  verifySignature,
  parseWebhook,
  sendText,
  markRead,
  downloadMedia,
} from "@/lib/whatsapp";
import { transcribe, transcriptionEnabled } from "@/lib/transcribe";

export const runtime = "nodejs";

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || "";

// ── אימות ה-webhook (מתבצע פעם אחת בהגדרה מול מטא) ──
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const mode = p.get("hub.mode");
  const token = p.get("hub.verify_token");
  const challenge = p.get("hub.challenge");
  if (mode === "subscribe" && token && token === VERIFY_TOKEN) {
    return new Response(challenge || "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// ── קבלת הודעות ──
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifySignature(raw, signature)) {
    return new Response("Invalid signature", { status: 403 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  // עונים 200 מיד; מעבדים ברקע.
  waitUntil(processWebhook(body).catch((e) => console.error("[webhook] עיבוד נכשל:", e?.message)));
  return new Response("OK", { status: 200 });
}

async function processWebhook(body: any) {
  const items = parseWebhook(body);
  for (const item of items) {
    try {
      if (item.kind === "text") {
        await markRead(item.msg.messageId);
        await dispatch(item.msg.userId, item.msg.name, item.msg);
      } else if (item.kind === "audio") {
        await markRead(item.messageId);
        if (!transcriptionEnabled()) {
          await sendText(item.userId, "שמעתי שהשארת הודעה קולית 🙏 אשמח אם תכתבי לי כאן בכמה מילים, כדי שאוכל לעזור מיד.");
          continue;
        }
        const media = await downloadMedia(item.mediaId);
        const text = media ? await transcribe(media.buffer, media.mime) : null;
        if (!text) {
          await sendText(item.userId, "לא הצלחתי לשמוע את ההקלטה 🙏 אפשר לכתוב לי במקום?");
          continue;
        }
        await dispatch(item.userId, item.name, {
          channel: "whatsapp",
          userId: item.userId,
          text,
          messageId: item.messageId,
          name: item.name,
        });
      } else {
        await markRead(item.messageId);
        await sendText(item.userId, "תודה 🙏 כרגע אני יכולה לקרוא רק הודעות טקסט — אשמח אם תכתבי לי במילים מה מביא אותך.");
      }
    } catch (e) {
      console.error("[webhook] שגיאה בטיפול בהודעה:", (e as Error)?.message);
    }
  }
}

async function dispatch(
  userId: string,
  name: string | undefined,
  msg: Parameters<typeof handleIncoming>[0],
) {
  const result = await handleIncoming(msg);
  for (const reply of result.replies) {
    await sendText(userId, reply);
  }
  if (result.alert || result.human) {
    await notifyOwner({
      kind: result.alert ? "alert" : "human",
      from: userId,
      name,
      summary: msg.text,
    });
  }
}
