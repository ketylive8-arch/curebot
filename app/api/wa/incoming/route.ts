// הודעות מוואטסאפ (מכשיר מקושר) מגיעות לכאן מהתהליך wa/worker.mjs שרץ באותו שרת.
import { NextRequest } from "next/server";
import { handleIncoming, optOut } from "@/lib/core";
import { kv } from "@/lib/kv";
import { notifyKety } from "@/lib/push";
import { store } from "@/lib/redis";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_KEY || "";
  if (!secret || req.headers.get("x-wa-secret") !== secret) return new Response("Forbidden", { status: 403 });
  const b = (await req.json().catch(() => ({}))) as {
    type?: string; userId?: string; name?: string; messageId?: string; text?: string; audio?: boolean; status?: string;
  };
  // מצב החיבור: כשהוואטסאפ מתנתק — התראה לקטי (לכל היותר פעם ב-6 שעות), כדי שלא יעבור זמן בלי מענה
  if (b.type === "status") {
    if (b.status === "connected") await kv.del("wa:alerted");
    else if (!(await kv.get("wa:alerted"))) {
      await kv.set("wa:alerted", 1, 6 * 3600);
      await notifyKety("⚠️ הוואטסאפ התנתק מהבוט — הוא לא עונה עכשיו", "לחצי כאן: יופיע קוד חיבור, מקלידים אותו בוואטסאפ ← מכשירים מקושרים. דקה אחת.");
    }
    return Response.json({ ok: true });
  }
  const userId = (b.userId || "").replace(/[^0-9a-zA-Z_-]/g, "").slice(0, 40);
  if (!userId) return new Response("Bad request", { status: 400 });

  if (b.type === "optout") {
    await optOut(`whatsapp:${(b.userId || "").replace(/[^0-9a-zA-Z_-]/g, "")}`);
    return Response.json({ ok: true });
  }
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
