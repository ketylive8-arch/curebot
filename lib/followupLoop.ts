// לולאת המעקבים — רצה בשרת (instrumentation) ובודקת כל דקה מה הגיע זמנו.
import { askClaude } from "./anthropic";
import { runDueFollowups } from "./followups";
import { queueWaMessage } from "./wa";

export function startFollowupLoop() {
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try { await runDueFollowups(askClaude, queueWaMessage); }
    catch (e) { console.error("[followup]", (e as Error).message); }
    busy = false;
  }, 60_000);
}
