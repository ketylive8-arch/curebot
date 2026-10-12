// קריאה ל-Claude (Anthropic SDK) עם 3 ניסיונות ו-backoff.
// אם הכול נכשל — זורק, וה-core עונה בהודעת הגיבוי.

import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./knowledge";
import type { ChatMsg } from "./redis";

// הפרומפט + ספריית התוכן — קבוע בין בקשות, לכן מסומן ל-cache (פחות עלות ופחות זמן תגובה).
const SYSTEM_BLOCKS: Anthropic.TextBlockParam[] = [
  { type: "text", text: buildSystemPrompt(), cache_control: { type: "ephemeral" } },
];

const MODEL = process.env.MODEL || "claude-sonnet-4-6";

// לקוח יחיד (קורא ANTHROPIC_API_KEY מהסביבה).
const client = new Anthropic();
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * שולח את היסטוריית השיחה + ההודעה החדשה ל-Claude ומחזיר טקסט גולמי
 * (כולל הסמנים, אם יש). זורק אם כל הניסיונות נכשלו.
 */
export async function askClaude(messages: ChatMsg[], extraSystem?: string): Promise<string> {
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: extraSystem ? [...SYSTEM_BLOCKS, { type: "text", text: extraSystem }] : SYSTEM_BLOCKS,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });

      const text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();

      if (text) return text;
      throw new Error("empty response");
    } catch (err) {
      lastErr = err;
      // 400/401/404 — שגיאת בקשה או מפתח, אין טעם לנסות שוב
      if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError || err instanceof Anthropic.AuthenticationError) {
        console.error("[anthropic] שגיאה קבועה:", (err as Error)?.message);
        break;
      }
      console.error(`[anthropic] ניסיון ${attempt} נכשל:`, (err as Error)?.message);
      if (attempt < 3) await sleep(attempt * 700); // 700ms, 1400ms
    }
  }

  // גיבוי: אם יש מפתח OpenAI — אותו פרומפט, אותה שיחה, דרך GPT.
  if (process.env.OPENAI_API_KEY) {
    try {
      return await askOpenAI(messages, extraSystem);
    } catch (e) {
      console.error("[openai] גיבוי נכשל:", (e as Error)?.message);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("anthropic failed");
}

async function askOpenAI(messages: ChatMsg[], extraSystem?: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 1024,
      messages: [{ role: "system", content: buildSystemPrompt() + (extraSystem ? "\n\n" + extraSystem : "") }, ...messages.map((m) => ({ role: m.role, content: m.content }))],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = (data.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new Error("empty response");
  console.log("[openai] ענה כגיבוי ל-Claude");
  return text;
}
