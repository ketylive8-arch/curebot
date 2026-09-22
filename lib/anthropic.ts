// קריאה ל-Claude (Anthropic SDK) עם 3 ניסיונות ו-backoff.
// אם הכול נכשל — זורק, וה-core עונה בהודעת הגיבוי.

import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./prompt";
import type { ChatMsg } from "./redis";

const MODEL = process.env.MODEL || "claude-sonnet-4-6";

// לקוח יחיד (קורא ANTHROPIC_API_KEY מהסביבה).
const client = new Anthropic();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * שולח את היסטוריית השיחה + ההודעה החדשה ל-Claude ומחזיר טקסט גולמי
 * (כולל הסמנים, אם יש). זורק אם כל הניסיונות נכשלו.
 */
export async function askClaude(messages: ChatMsg[]): Promise<string> {
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
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
      // 400/404 — שגיאת בקשה, אין טעם לנסות שוב
      if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError) {
        break;
      }
      console.error(`[anthropic] ניסיון ${attempt} נכשל:`, (err as Error)?.message);
      if (attempt < 3) await sleep(attempt * 700); // 700ms, 1400ms
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("anthropic failed");
}
