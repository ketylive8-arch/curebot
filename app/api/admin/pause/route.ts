import { NextRequest } from "next/server";
import { store } from "@/lib/redis";

export const runtime = "nodejs";

const ADMIN_KEY = process.env.ADMIN_KEY || "";

export async function POST(req: NextRequest) {
  if (!ADMIN_KEY || req.nextUrl.searchParams.get("key") !== ADMIN_KEY) {
    return new Response("Forbidden", { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    scope?: "global" | "conversation";
    conversation?: string;
    on?: boolean;
  };

  if (body.scope === "global") {
    await store.setGlobalPause(Boolean(body.on));
    return Response.json({ ok: true, globallyPaused: Boolean(body.on) });
  }

  if (body.scope === "conversation" && body.conversation) {
    if (body.on) await store.pause(body.conversation, 12); // השהיה ידנית ל-12 שעות
    else await store.resume(body.conversation); // הבוט חוזר לענות בשיחה
    return Response.json({ ok: true });
  }

  return new Response("Bad request", { status: 400 });
}
