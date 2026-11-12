// אחסון כללי וקטן (JSON, רשימות ממוינות, קבוצות, מונים) למערכת הלקוחות.
// נפרד מ-lib/redis.ts כדי שלקוחות לא יופיעו בלוח הבקרה של קטי. Redis דרך REDIS_URL,
// ובלעדיו — זיכרון בתהליך (לבדיקות).
import { createClient } from "redis";

export interface KV {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSec?: number): Promise<void>;
  del(key: string): Promise<void>;
  zadd(key: string, score: number, member: string): Promise<void>;
  zrevrange(key: string, limit: number): Promise<string[]>;
  sadd(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  srem(key: string, member: string): Promise<void>;
  incr(key: string, windowSec: number): Promise<number>;
}

class RedisKV implements KV {
  private ready: Promise<ReturnType<typeof createClient>>;
  constructor(url: string) {
    const c = createClient({ url });
    c.on("error", (e) => console.error("[kv] שגיאת חיבור:", e.message));
    this.ready = c.connect().then(() => c);
  }
  async get<T>(key: string) {
    const v = await (await this.ready).get(key);
    return v ? (JSON.parse(v) as T) : null;
  }
  async set(key: string, value: unknown, ttlSec?: number) {
    await (await this.ready).set(key, JSON.stringify(value), ttlSec ? { EX: ttlSec } : undefined);
  }
  async del(key: string) { await (await this.ready).del(key); }
  async zadd(key: string, score: number, member: string) { await (await this.ready).zAdd(key, { score, value: member }); }
  async zrevrange(key: string, limit: number) { return (await this.ready).zRange(key, 0, limit - 1, { REV: true }); }
  async sadd(key: string, member: string) { await (await this.ready).sAdd(key, member); }
  async smembers(key: string) { return (await this.ready).sMembers(key); }
  async srem(key: string, member: string) { await (await this.ready).sRem(key, member); }
  async incr(key: string, windowSec: number) {
    const r = await this.ready;
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, windowSec);
    return n;
  }
}

export class MemoryKV implements KV {
  private m = new Map<string, { v: string; until: number }>();
  private z = new Map<string, Map<string, number>>();
  private s = new Map<string, Set<string>>();
  async get<T>(key: string) {
    const e = this.m.get(key);
    if (!e || (e.until && e.until < Date.now())) return null;
    return JSON.parse(e.v) as T;
  }
  async set(key: string, value: unknown, ttlSec?: number) {
    this.m.set(key, { v: JSON.stringify(value), until: ttlSec ? Date.now() + ttlSec * 1000 : 0 });
  }
  async del(key: string) { this.m.delete(key); }
  async zadd(key: string, score: number, member: string) {
    if (!this.z.has(key)) this.z.set(key, new Map());
    this.z.get(key)!.set(member, score);
  }
  async zrevrange(key: string, limit: number) {
    return [...(this.z.get(key) || new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map((e) => e[0]);
  }
  async sadd(key: string, member: string) {
    if (!this.s.has(key)) this.s.set(key, new Set());
    this.s.get(key)!.add(member);
  }
  async smembers(key: string) { return [...(this.s.get(key) || [])]; }
  async srem(key: string, member: string) { this.s.get(key)?.delete(member); }
  async incr(key: string, windowSec: number) {
    const e = this.m.get(key);
    const live = e && (!e.until || e.until > Date.now());
    const n = (live ? (JSON.parse(e!.v) as number) : 0) + 1;
    this.m.set(key, { v: JSON.stringify(n), until: live ? e!.until : Date.now() + windowSec * 1000 });
    return n;
  }
}

export const kv: KV = process.env.REDIS_URL ? new RedisKV(process.env.REDIS_URL) : new MemoryKV();
