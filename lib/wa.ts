// גישה למצב חיבור הוואטסאפ (מכשיר מקושר) שהתהליך wa/worker.mjs שומר ב-Redis.
import { createClient } from "redis";

type R = ReturnType<typeof createClient>;
let client: Promise<R> | null = null;
function redis(): Promise<R> | null {
  if (!process.env.REDIS_URL) return null;
  if (!client) {
    const c = createClient({ url: process.env.REDIS_URL });
    c.on("error", () => {});
    client = c.connect().then(() => c as R);
  }
  return client;
}

export type WaState = { status: string; qr: string; pairingCode: string; me: string; lastEvent: string; contacts: number; updated: number };

export async function getWaState(): Promise<WaState | null> {
  const r = redis();
  if (!r) return null;
  const raw = await (await r).get("wa:state");
  return raw ? (JSON.parse(raw) as WaState) : null;
}

export async function sendWaCommand(cmd: { action: "pair" | "logout"; phone?: string }) {
  const r = redis();
  if (!r) throw new Error("no redis");
  await (await r).set("wa:cmd", JSON.stringify(cmd), { EX: 60 });
}

export type WaLog = { t: number; who: string; name: string; action: string };

/** יומן ההודעות הפרטיות האחרונות (נענתה / למה לא) והאם עונים גם לאנשי קשר שמורים. */
export async function getWaExtras(): Promise<{ log: WaLog[]; answerContacts: boolean }> {
  const r = redis();
  if (!r) return { log: [], answerContacts: false };
  const c = await r;
  const [raw, ac] = await Promise.all([c.lRange("wa:log", 0, 19), c.get("wa:answerContacts")]);
  return { log: raw.map((x) => JSON.parse(x) as WaLog), answerContacts: !!ac };
}

export async function setAnswerContacts(on: boolean) {
  const r = redis();
  if (!r) throw new Error("no redis");
  if (on) await (await r).set("wa:answerContacts", "1");
  else await (await r).del("wa:answerContacts");
}
