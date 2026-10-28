// הודעות מוואטסאפ (מכשיר מקושר) מגיעות לכאן מהתהליך wa/worker.mjs שרץ באותו שרת.
import { NextRequest } from "next/server";
import { handleIncoming } from "@/lib/core";
import { store } from "@/lib/redis";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_KEY || "";
  if (!secret || req.headers.get("x-wa-secret") !== secret) return new Response("Forbidden", { status: 403 });
  const b = (await req.json().catch(() => ({}))) as {
    type?: string; userId?: string; name?: string; messageId?: string; text?: string; audio?: boolean;
  };
  const userId = (b.userId || "").replace(/[^0-9a-zA-Z_-]/g, "").slice(0, 40);
  if (!userId) return new Response("Bad request", { status: 400 });

  // קטי ענתה בעצמה — הבוט שותק בשיחה הזו 12 שעות
  if (b.type === "owner-reply") {
    await store.pause(`whatsapp:${userId}`, 12);
    return Response.json({ ok: true, replies: [] });
  }
  if (!b.text && b.audio) {
    return Response.json({ replies: ["לא הצלחתי לשמוע את ההקלטה 🙏 אפשר לכתוב לי במקום?"] });
  }
  const r = await handleIncoming({
    channel: "whatsapp", userId, name: b.name || undefined, text: b.text || "", messageId: b.messageId || "",
  });
  return Response.json({ replies: r.replies, skipped: r.skipped ?? null });
}
