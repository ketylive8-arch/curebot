// לוח הבקרה: מצב חיבור הוואטסאפ, QR, קוד חיבור, וניתוק.
import { NextRequest } from "next/server";
import QRCode from "qrcode";
import { getWaState, sendWaCommand } from "@/lib/wa";

export const runtime = "nodejs";
const ok = (req: NextRequest) => !!process.env.ADMIN_KEY && req.nextUrl.searchParams.get("key") === process.env.ADMIN_KEY;

export async function GET(req: NextRequest) {
  if (!ok(req)) return new Response("Forbidden", { status: 403 });
  const s = await getWaState();
  if (!s) return Response.json({ status: "off" });
  const qrDataUrl = s.status === "qr" && s.qr ? await QRCode.toDataURL(s.qr, { margin: 2, width: 280 }) : "";
  const stale = Date.now() - (s.updated || 0) > 10 * 60 * 1000 && s.status !== "connected";
  return Response.json({ ...s, qr: undefined, qrDataUrl, stale });
}

export async function POST(req: NextRequest) {
  if (!ok(req)) return new Response("Forbidden", { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; phone?: string };
  if (b.action === "pair") await sendWaCommand({ action: "pair", phone: (b.phone || process.env.OWNER_NUMBER || "").replace(/\D/g, "") });
  else if (b.action === "logout") await sendWaCommand({ action: "logout" });
  else return new Response("Bad request", { status: 400 });
  return Response.json({ ok: true });
}
