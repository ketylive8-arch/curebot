// התראות דחיפה לטלפון של קטי (Web Push). כל פנייה חדשה, בקשה לדבר איתה או מצוקה
// מקפיצות התראה; לחיצה פותחת את השיחה בלוח הבקרה. בלי וואטסאפ ובלי שירות חיצוני.
import webpush from "web-push";
import { store } from "./redis";

const PUB = process.env.VAPID_PUBLIC_KEY || "";
const PRIV = process.env.VAPID_PRIVATE_KEY || "";
if (PUB && PRIV) webpush.setVapidDetails("mailto:" + (process.env.OWNER_EMAIL || "ketyse@gmail.com"), PUB, PRIV);

export const pushPublicKey = () => PUB;

export async function notifyKety(title: string, body: string, conversation?: string) {
  if (!PUB || !PRIV) return;
  const subs = await store.listPushSubs();
  console.log(`[push] → ${title} (${subs.length} מכשירים)`);
  const payload = JSON.stringify({ title, body: body.slice(0, 160), conversation: conversation || "" });
  await Promise.all(
    subs.map(async (raw) => {
      try {
        await webpush.sendNotification(JSON.parse(raw), payload, { TTL: 24 * 3600 });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await store.removePushSub(raw); // מנוי שפג — מוחקים
        else console.error("[push] שליחה נכשלה:", (e as Error).message);
      }
    }),
  );
}
