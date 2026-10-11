// רישום הטלפון של קטי להתראות דחיפה. GET מחזיר את המפתח הציבורי, POST שומר מנוי.
import { NextRequest } from "next/server";
import { store } from "@/lib/redis";
import { notifyKety, pushPublicKey } from "@/lib/push";

export const runtime = "nodejs";
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const ok = (req: NextRequest) => !!ADMIN_KEY && req.nextUrl.searchParams.get("key") === ADMIN_KEY;

export async function GET(req: NextRequest) {
  if (!ok(req)) return new Response("Forbidden", { status: 403 });
  return Response.json({ publicKey: pushPublicKey() });
}

export async function POST(req: NextRequest) {
  if (!ok(req)) return new Response("Forbidden", { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { subscription?: unknown; test?: boolean };
  if (body.subscription) await store.addPushSub(JSON.stringify(body.subscription));
  if (body.test) await notifyKety("✅ ההתראות פועלות", "מעכשיו כל פנייה חדשה תקפוץ כאן בטלפון.");
  return Response.json({ ok: true });
}
