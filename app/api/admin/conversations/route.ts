import { NextRequest } from "next/server";
import { store } from "@/lib/redis";

export const runtime = "nodejs";

const ADMIN_KEY = process.env.ADMIN_KEY || "";

function authed(req: NextRequest): boolean {
  return Boolean(ADMIN_KEY) && req.nextUrl.searchParams.get("key") === ADMIN_KEY;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return new Response("Forbidden", { status: 403 });

  const key = req.nextUrl.searchParams.get("conversation");
  if (key) {
    const conv = await store.getConversation(key);
    return Response.json(conv);
  }

  const list = await store.listConversations(50);
  const globallyPaused = await store.isGloballyPaused();
  // מסמנים אילו שיחות מושהות כרגע (הבוט לא עונה בהן)
  const withPause = await Promise.all(
    list.map(async (m) => ({ ...m, paused: await store.isPaused(m.key) })),
  );
  return Response.json({ conversations: withPause, globallyPaused });
}
