import { downloadMediaMessage } from "@whiskeysockets/baileys";

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const STT_MODEL = process.env.STT_MODEL || "whisper-1";

/**
 * מוריד הודעה קולית מוואטסאפ ומתמלל אותה לעברית.
 * מחזיר את הטקסט, או null אם נכשל.
 */
export async function transcribe(msg, logger) {
  if (!OPENAI_KEY) {
    console.error("[stt] אין OPENAI_API_KEY — תמלול מושבת");
    return null;
  }

  try {
    // Baileys מחזיר Buffer של קובץ ogg/opus
    const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger });

    const form = new FormData();
    form.append("file", new Blob([buffer], { type: "audio/ogg" }), "voice.ogg");
    form.append("model", STT_MODEL);
    form.append("language", "he");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      body: form
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = (data.text || "").trim();
    console.log(`[stt] תומלל: "${text.slice(0, 60)}..."`);
    return text || null;
  } catch (e) {
    console.error("[stt] תמלול נכשל:", e.message);
    return null;
  }
}
