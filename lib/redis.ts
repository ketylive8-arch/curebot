// זיכרון ומצב לכל שיחה, דרך Upstash Redis (REST) — עובד ב-serverless של Vercel.
// אם משתני Upstash לא מוגדרים (למשל בבדיקות מקומיות) — נופלים לזיכרון בתהליך,
// עם אותה התנהגות בדיוק, כדי שהבדיקות ירוצו בלי רשת.

import { Redis } from "@upstash/redis";

export type ChatMsg = { role: "user" | "assistant"; content: string };
export type ConvMeta = {
  key: string;
  channel: string;
  userId: string;
  name?: string;
  last: string;
  flag: "" | "hot" | "human" | "alert" | "ended";
  updated: number;
};

const HISTORY_MAX = 20;
const HISTORY_TTL = 7 * 24 * 60 * 60; // 7 ימים
const DEDUPE_TTL = 24 * 60 * 60; // 24 שעות

interface Store {
  getHistory(key: string): Promise<ChatMsg[]>;
  pushHistory(key: string, user: ChatMsg, assistant: ChatMsg): Promise<void>;
  seenMessage(id: string): Promise<boolean>; // true אם כבר טופל (כפילות)
  isPaused(key: string): Promise<boolean>;
  pause(key: string, hours: number): Promise<void>;
  resume(key: string): Promise<void>;
  isInfoSent(key: string): Promise<boolean>;
  markInfoSent(key: string): Promise<void>;
  isGloballyPaused(): Promise<boolean>;
  setGlobalPause(on: boolean): Promise<void>;
  recordConversation(meta: ConvMeta): Promise<void>;
  listConversations(limit: number): Promise<ConvMeta[]>;
  getConversation(key: string): Promise<{ meta: ConvMeta | null; history: ChatMsg[] }>;
}

// ---------- מימוש Upstash ----------
class UpstashStore implements Store {
  constructor(private r: Redis) {}

  async getHistory(key: string): Promise<ChatMsg[]> {
    const v = await this.r.get<ChatMsg[]>(`hist:${key}`);
    return Array.isArray(v) ? v : [];
  }
  async pushHistory(key: string, user: ChatMsg, assistant: ChatMsg): Promise<void> {
    const hist = await this.getHistory(key);
    hist.push(user, assistant);
    const trimmed = hist.slice(-HISTORY_MAX);
    await this.r.set(`hist:${key}`, trimmed, { ex: HISTORY_TTL });
  }
  async seenMessage(id: string): Promise<boolean> {
    const res = await this.r.set(`dedupe:${id}`, "1", { nx: true, ex: DEDUPE_TTL });
    return res === null; // null => already existed => duplicate
  }
  async isPaused(key: string): Promise<boolean> {
    return (await this.r.exists(`pause:${key}`)) === 1;
  }
  async pause(key: string, hours: number): Promise<void> {
    await this.r.set(`pause:${key}`, Date.now(), { ex: Math.max(1, Math.round(hours * 3600)) });
  }
  async resume(key: string): Promise<void> {
    await this.r.del(`pause:${key}`);
  }
  async isInfoSent(key: string): Promise<boolean> {
    return (await this.r.exists(`info:${key}`)) === 1;
  }
  async markInfoSent(key: string): Promise<void> {
    await this.r.set(`info:${key}`, "1", { ex: HISTORY_TTL });
  }
  async isGloballyPaused(): Promise<boolean> {
    return (await this.r.exists("gpause")) === 1;
  }
  async setGlobalPause(on: boolean): Promise<void> {
    if (on) await this.r.set("gpause", "1");
    else await this.r.del("gpause");
  }
  async recordConversation(meta: ConvMeta): Promise<void> {
    await this.r.set(`meta:${meta.key}`, meta, { ex: HISTORY_TTL });
    await this.r.zadd("convindex", { score: meta.updated, member: meta.key });
  }
  async listConversations(limit: number): Promise<ConvMeta[]> {
    const keys = await this.r.zrange<string[]>("convindex", 0, limit - 1, { rev: true });
    if (!keys.length) return [];
    const metas = await Promise.all(keys.map((k) => this.r.get<ConvMeta>(`meta:${k}`)));
    return metas.filter((m): m is ConvMeta => !!m);
  }
  async getConversation(key: string) {
    const meta = (await this.r.get<ConvMeta>(`meta:${key}`)) ?? null;
    const history = await this.getHistory(key);
    return { meta, history };
  }
}

// ---------- מימוש בזיכרון (fallback לבדיקות) ----------
class MemoryStore implements Store {
  hist = new Map<string, ChatMsg[]>();
  dedupe = new Set<string>();
  paused = new Map<string, number>();
  info = new Set<string>();
  gpause = false;
  metas = new Map<string, ConvMeta>();

  async getHistory(key: string) { return this.hist.get(key) ?? []; }
  async pushHistory(key: string, user: ChatMsg, assistant: ChatMsg) {
    const h = this.hist.get(key) ?? [];
    h.push(user, assistant);
    this.hist.set(key, h.slice(-HISTORY_MAX));
  }
  async seenMessage(id: string) {
    if (this.dedupe.has(id)) return true;
    this.dedupe.add(id);
    return false;
  }
  async isPaused(key: string) {
    const until = this.paused.get(key) ?? 0;
    return until > Date.now();
  }
  async pause(key: string, hours: number) { this.paused.set(key, Date.now() + hours * 3600 * 1000); }
  async resume(key: string) { this.paused.delete(key); }
  async isInfoSent(key: string) { return this.info.has(key); }
  async markInfoSent(key: string) { this.info.add(key); }
  async isGloballyPaused() { return this.gpause; }
  async setGlobalPause(on: boolean) { this.gpause = on; }
  async recordConversation(meta: ConvMeta) { this.metas.set(meta.key, meta); }
  async listConversations(limit: number) {
    return [...this.metas.values()].sort((a, b) => b.updated - a.updated).slice(0, limit);
  }
  async getConversation(key: string) {
    return { meta: this.metas.get(key) ?? null, history: await this.getHistory(key) };
  }
}

function build(): Store {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) return new UpstashStore(new Redis({ url, token }));
  if (process.env.NODE_ENV === "production") {
    console.warn("[redis] אין משתני Upstash — משתמש בזיכרון זמני (לא מומלץ לפרודקשן)");
  }
  return new MemoryStore();
}

export const store: Store = build();
