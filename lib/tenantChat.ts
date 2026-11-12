// שיחה עם הבוט של לקוח: אותו זרם כמו הליבה של קטי (היסטוריה, סמנים, כרטיס סיום,
// כרטיס ליד, התראה לטלפון), אבל עם הפרומפט של הלקוח ובאחסון נפרד לכל לקוח.
import { askWithSystem } from "./anthropic";
import { extractMarkers } from "./markers";
import { extractLead, prettyPhone, type Lead } from "./leads";
import { kv } from "./kv";
import { pushTo } from "./push";
import { buildTenantPrompt, closingCard, type Tenant } from "./tenants";
import type { ChatMsg } from "./redis";

export type TConv = {
  session: string;
  channel: string; // "chat" (צ'אט/אתר) | "test" (בדיקה מלוח הבקרה)
  last: string;
  flag: "" | "hot" | "human" | "alert" | "ended";
  created: number;
  updated: number;
  source?: string;
  cardSent?: boolean;
  lead?: Lead;
};

const TTL = 30 * 24 * 3600;
const hKey = (t: Tenant, s: string) => `studio:hist:${t.id}:${s}`;
const mKey = (t: Tenant, s: string) => `studio:meta:${t.id}:${s}`;

export type Ask = (system: string, messages: ChatMsg[]) => Promise<string>;

export async function tenantReply(
  t: Tenant, session: string, text: string, opts: { channel?: string; source?: string } = {}, ask: Ask = askWithSystem,
): Promise<{ replies: string[]; alert: boolean; human: boolean; ended: boolean }> {
  const channel = opts.channel || "chat";
  const history = (await kv.get<ChatMsg[]>(hKey(t, session))) || [];
  const messages = [...history, { role: "user" as const, content: text }];
  let raw: string;
  try {
    raw = await ask(buildTenantPrompt(t), messages);
  } catch (e) {
    console.error("[studio] Claude נכשל:", (e as Error).message);
    raw = `תודה שכתבת 🙏 קיבלנו את ההודעה ונחזור אלייך בהקדם${t.phone ? `. אפשר גם להתקשר: ${t.phone}` : "."}`;
  }
  const { text: reply, markers } = extractMarkers(raw);
  await kv.set(hKey(t, session), [...messages, { role: "assistant", content: reply }].slice(-20), TTL);

  const replies = [reply];
  const prev = await kv.get<TConv>(mKey(t, session));
  let cardSent = !!prev?.cardSent;
  if (markers.ended && !cardSent) {
    const card = closingCard(t);
    if (card) replies.push(card);
    cardSent = true;
  }
  const flag: TConv["flag"] = markers.alert ? "alert" : markers.human ? "human" : markers.ended ? "ended" : "hot";
  const meta: TConv = {
    session, channel, last: text.slice(0, 120), flag, cardSent,
    created: prev?.created || Date.now(), updated: Date.now(),
    source: prev?.source || opts.source, lead: prev?.lead,
  };
  await kv.set(mKey(t, session), meta, TTL);
  await kv.zadd(`studio:convs:${t.id}`, meta.updated, session);

  if (channel !== "test") {
    const title = markers.alert ? "🔴 מצוקה, כדאי לחזור עכשיו" : markers.human ? "🙋 ביקשו לדבר איתך" : markers.ended ? "📅 שיחה הסתיימה" : "";
    if (title) notifyTenant(t, title, text, session).catch(() => {});
  }
  updateTenantLead(t, session, history.length === 0, channel).catch((e) => console.error("[studio-lead]", (e as Error).message));
  return { replies, alert: markers.alert, human: markers.human, ended: markers.ended };
}

async function updateTenantLead(t: Tenant, session: string, isNew: boolean, channel: string) {
  const history = (await kv.get<ChatMsg[]>(hKey(t, session))) || [];
  const meta = await kv.get<TConv>(mKey(t, session));
  if (!meta) return;
  const prevPhone = meta.lead?.phone;
  const lead = await extractLead(history, meta.lead || {}, { name: t.owner || "בעל/ת העסק", business: t.business || "העסק" });
  const latest = (await kv.get<TConv>(mKey(t, session))) || meta;
  await kv.set(mKey(t, session), { ...latest, lead: { ...latest.lead, ...lead } }, TTL);
  if (channel === "test") return;
  if (isNew) notifyTenant(t, `✨ פנייה חדשה${lead.topic ? ": " + lead.topic : ""}`, lead.summary || latest.last, session).catch(() => {});
  if (lead.phone && lead.phone !== prevPhone) {
    notifyTenant(t, `📞 ליד עם טלפון: ${[lead.name, prettyPhone(lead.phone)].filter(Boolean).join(" · ")}`, lead.summary || "", session).catch(() => {});
  }
}

export async function notifyTenant(t: Tenant, title: string, body: string, session = "") {
  const key = `studio:push:${t.id}`;
  const subs = await kv.smembers(key);
  console.log(`[studio-push] ${t.id} → ${title} (${subs.length} מכשירים)`);
  await pushTo(subs, { title, body, conversation: session, url: `/c/${t.id}${session ? "?c=" + encodeURIComponent(session) : ""}` }, (raw) => kv.srem(key, raw));
}

export async function listTenantConvs(t: Tenant, limit = 100): Promise<TConv[]> {
  const ids = await kv.zrevrange(`studio:convs:${t.id}`, limit);
  const metas = await Promise.all(ids.map((s) => kv.get<TConv>(mKey(t, s))));
  return metas.filter((m): m is TConv => !!m);
}

export async function getTenantConv(t: Tenant, session: string) {
  return { meta: await kv.get<TConv>(mKey(t, session)), history: (await kv.get<ChatMsg[]>(hKey(t, session))) || [] };
}
