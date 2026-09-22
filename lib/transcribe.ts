// תמלול הודעות קוליות עם Whisper — רק אם OPENAI_API_KEY מוגדר.
// אם לא מוגדר או נכשל — מחזיר null, וה-route עונה בבקשה מנומסת לכתוב.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

export function transcriptionEnabled(): boolean {
  return Boolean(OPENAI_API_KEY);
}

export async function transcribe(buffer: Buffer, mime: string): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;
  try {
    const ext = mime.includes("mp4") ? "mp4" : mime.includes("mpeg") ? "mp3" : "ogg";
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buffer)], { type: mime }), `audio.${ext}`);
    form.append("model", "whisper-1");
    form.append("language", "he");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
    });
    if (!res.ok) {
      console.error("[transcribe] נכשל:", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const data = (await res.json()) as { text?: string };
    return data.text?.trim() || null;
  } catch (e) {
    console.error("[transcribe] שגיאה:", (e as Error).message);
    return null;
  }
}
