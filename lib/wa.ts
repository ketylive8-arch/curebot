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
