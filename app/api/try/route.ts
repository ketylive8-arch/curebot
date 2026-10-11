// דף ההדגמה הציבורי: מריץ את אותה ליבה בלי מפתח, עם הגבלת קצב כדי שאף אחד לא ישרוף קרדיט.
// שיחות כאן מסומנות בערוץ "try" ולא שולחות התראות לקטי (ההתראות יוצאות רק מה-webhook של וואטסאפ).
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { handleIncoming } from "@/lib/core";
import { store } from "@/lib/redis";

export const runtime = "nodejs";
export const maxDuration = 60;

const PER_IP_HOUR = 25;
const GLOBAL_DAY = 400;

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const [perIp, global] = await Promise.all([store.hit(`try:ip:${ip}`, 3600), store.hit("try:day", 86400)]);
  if (perIp > PER_IP_HOUR || global > GLOBAL_DAY) return new Response("Too many requests", { status: 429 });

  const body = (await req.json().catch(() => ({}))) as { message?: string; session?: string };
  const message = (body.message || "").toString().slice(0, 500);
  const session = (body.session || "").toString().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  if (!message.trim() || !session) return new Response("Bad request", { status: 400 });

  const result = await handleIncoming({ channel: "try", userId: session, text: message, messageId: randomUUID() });
  return Response.json({
    replies: result.replies,
    alert: result.alert,
    human: result.human,
    ended: result.ended,
    skipped: result.skipped ?? null,
  });
}
