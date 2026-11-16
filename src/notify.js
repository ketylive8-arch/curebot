// התראות לקטי מהסוכנים (למשל מאיה): הודעה קצרה + הודעה קולית, מאחד החיבורים לוואטסאפ של קטי.
// הסוכן לא שולח לאף אחד אחר — רק ל-OWNER_NUMBER.
import { listTenants, getTenant } from "./tenants.js";
import { getSession } from "./session.js";

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const TTS_MODEL = process.env.TTS_MODEL || "gpt-4o-mini-tts";
const TTS_VOICE = process.env.TTS_VOICE || "nova";

export const ownerJid = () => {
  const d = String(process.env.OWNER_NUMBER || "972543032349").replace(/\D/g, "");
  return `${d.startsWith("972") ? d : "972" + d.replace(/^0/, "")}@s.whatsapp.net`;
};

/** הקראה בקול (OpenAI). מחזיר Buffer של ogg/opus, או null אם אין קרדיט/מפתח. */
export async function speak(text) {
  if (!OPENAI_KEY) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: TTS_MODEL, voice: TTS_VOICE, input: text.slice(0, 3500), response_format: "opus" })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.error("[notify] הקראה נכשלה:", e.message);
    return null;
  }
}

/** החיבור שממנו שולחים: NOTIFY_TENANT, אחרת החיבור המחובר הראשון שאינו מספר היעד. */
export function pickSession() {
  const target = ownerJid().split("@")[0];
  const ids = [process.env.NOTIFY_TENANT, ...listTenants().map(t => t.id)].filter(Boolean);
  for (const id of ids) {
    if (!getTenant(id)) continue;
    const s = getSession(id);
    if (s?.sock && s.state.status === "connected" && s.state.me !== target) return s;
  }
  return null;
}

/** שולח לקטי טקסט, ואם voice=true גם הודעה קולית (כשההקראה זמינה). */
export async function notifyOwner({ text, voice = true, speech }) {
  const s = pickSession();
  if (!s) throw new Error("אין חיבור וואטסאפ מחובר לשליחה");
  const to = ownerJid();
  let voiceSent = false;
  if (voice) {
    const audio = await speak(speech || text);
    if (audio) {
      await s.send(to, { audio, mimetype: "audio/ogg; codecs=opus", ptt: true });
      voiceSent = true;
    }
  }
  await s.send(to, { text });
  return { from: s.state.me, voiceSent };
}
