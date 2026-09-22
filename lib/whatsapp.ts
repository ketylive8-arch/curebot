// מתאם WhatsApp Cloud API (Meta) — אימות חתימה, פענוח הודעות נכנסות, ושליחה.
import crypto from "crypto";
import type { IncomingMessage } from "./core";

const GRAPH_VERSION = process.env.GRAPH_VERSION || "v21.0";
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID || "";
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || "";
const APP_SECRET = process.env.META_APP_SECRET || "";

/** אימות חתימת X-Hub-Signature-256 מול META_APP_SECRET (בטוח מפני תזמון). */
export function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!APP_SECRET) return false;
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// סוג הודעה נכנסת אחרי פענוח — טקסט מוכן, או מדיה שדורשת טיפול נפרד.
export type ParsedInbound =
  | { kind: "text"; msg: IncomingMessage }
  | { kind: "audio"; userId: string; name?: string; messageId: string; mediaId: string }
  | { kind: "unsupported"; userId: string; name?: string; messageId: string };

/** מפענח את גוף ה-webhook של מטא לרשימת הודעות נכנסות. מתעלם מ-statuses ומקבוצות. */
export function parseWebhook(body: any): ParsedInbound[] {
  const out: ParsedInbound[] = [];
  const entries = body?.entry || [];
  for (const entry of entries) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      if (!value.messages) continue; // statuses (delivered/read) — מתעלמים
      const nameByWa: Record<string, string> = {};
      for (const c of value.contacts || []) nameByWa[c.wa_id] = c?.profile?.name;

      for (const m of value.messages) {
        const from = m.from; // מספר בינ"ל בלי +
        const name = nameByWa[from];
        const messageId = m.id;
        if (m.context?.forwarded && false) continue; // placeholder — לא מסנן

        if (m.type === "text") {
          out.push({ kind: "text", msg: { channel: "whatsapp", userId: from, text: m.text?.body || "", messageId, name } });
        } else if (m.type === "interactive") {
          const t = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || "";
          out.push({ kind: "text", msg: { channel: "whatsapp", userId: from, text: t, messageId, name } });
        } else if (m.type === "button") {
          out.push({ kind: "text", msg: { channel: "whatsapp", userId: from, text: m.button?.text || "", messageId, name } });
        } else if (m.type === "audio" || m.type === "voice") {
          out.push({ kind: "audio", userId: from, name, messageId, mediaId: m.audio?.id || m.voice?.id });
        } else {
          out.push({ kind: "unsupported", userId: from, name, messageId });
        }
      }
    }
  }
  return out;
}

/** שולח הודעת טקסט לפונה דרך Graph API. */
export async function sendText(to: string, text: string): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: true, body: text },
    }),
  });
  if (!res.ok) {
    const b = await res.text();
    console.error(`[whatsapp] שליחה נכשלה (${res.status}): ${b.slice(0, 300)}`);
    throw new Error(`graph ${res.status}`);
  }
}

/** מסמן הודעה כנקראה (וי כחול) — לא חובה. */
export async function markRead(messageId: string): Promise<void> {
  try {
    await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId }),
    });
  } catch {
    /* לא קריטי */
  }
}

/** מוריד מדיה (הקלטה) מ-Graph API ומחזיר Buffer + סוג MIME. */
export async function downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mime: string } | null> {
  try {
    const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });
    if (!metaRes.ok) return null;
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
    if (!meta.url) return null;
    const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } });
    if (!fileRes.ok) return null;
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    return { buffer, mime: meta.mime_type || "audio/ogg" };
  } catch {
    return null;
  }
}
