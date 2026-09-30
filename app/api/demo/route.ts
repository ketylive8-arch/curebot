// דמו: מריץ את הליבה האמיתית (אותו מוח, אותה זיכרון, אותם סמנים) בלי וואטסאפ,
// כדי שאפשר לראות את הסוכן עובד מהדפדפן. מוגן ב-ADMIN_KEY כדי שאף אחד אחר לא יבזבז קרדיט.
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { handleIncoming } from "@/lib/core";

export const runtime = "nodejs";
export const maxDuration = 60;

const ADMIN_KEY = process.env.ADMIN_KEY || "";

export async function POST(req: NextRequest) {
  if (!ADMIN_KEY || req.nextUrl.searchParams.get("key") !== ADMIN_KEY) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { message?: string; session?: string };
  const message = (body.message || "").toString().slice(0, 1000);
  // מזהה שיחה מהדפדפן — מנוקה כדי שלא יוכל לגעת במפתחות אחרים ב-Redis.
  const session = (body.session || "").toString().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  if (!message.trim() || !session) return new Response("Bad request", { status: 400 });

  const result = await handleIncoming({
    channel: "demo",
    userId: session,
    text: message,
    messageId: randomUUID(),
  });

  return Response.json({
    replies: result.replies,
    alert: result.alert,
    human: result.human,
    ended: result.ended,
    skipped: result.skipped ?? null,
  });
}
