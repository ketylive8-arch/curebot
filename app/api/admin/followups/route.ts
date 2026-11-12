// מעקבים (המשפך): רשימה, הוספת פולואפ להצעה, ביטול.
import { NextRequest } from "next/server";
import { store } from "@/lib/redis";
import { addFollowup, listFollowups, setFollowupStatus } from "@/lib/followups";

export const runtime = "nodejs";
const ok = (req: NextRequest) => !!process.env.ADMIN_KEY && req.nextUrl.searchParams.get("key") === process.env.ADMIN_KEY;

export async function GET(req: NextRequest) {
  if (!ok(req)) return new Response("Forbidden", { status: 403 });
  return Response.json({ followups: await listFollowups(100) });
}

export async function POST(req: NextRequest) {
  if (!ok(req)) return new Response("Forbidden", { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { key?: string; days?: number; note?: string; id?: string; action?: string };
  if (b.id && b.action === "cancel") return Response.json(await setFollowupStatus(b.id, "cancelled", "בוטל מלוח הבקרה"));
  if (!b.key) return new Response("Bad request", { status: 400 });
  const meta = (await store.getConversation(b.key)).meta;
  if (!meta) return new Response("Not found", { status: 404 });
  const days = Math.min(30, Math.max(1, Number(b.days) || 7));
  const f = await addFollowup({
    key: b.key, kind: "offer", due: Date.now() + days * 86400_000, note: (b.note || "").slice(0, 200),
    name: meta.lead?.name || meta.name, phone: meta.lead?.phone || (meta.channel === "whatsapp" ? meta.userId : undefined),
  });
  await store.recordConversation({ ...meta, lead: { ...meta.lead, stage: "נשלחה הצעה" } });
  return Response.json(f);
}
