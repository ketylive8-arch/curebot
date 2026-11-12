// חילוץ הסמנים שהסוכן מוסיף בשורה נפרדת, והסרתם מהטקסט שנשלח לפונה.
// הסמנים לעולם לא מגיעים לפונה.

export type Markers = { ended: boolean; human: boolean; alert: boolean; callback?: string };

export function extractMarkers(raw: string): { text: string; markers: Markers } {
  const markers: Markers = {
    ended: raw.includes("[[END]]"),
    human: raw.includes("[[HUMAN]]"),
    alert: raw.includes("[[ALERT]]"),
  };
  // [[CALLBACK:2026-11-14 10:00]] — הפונה ביקש/ה שיחזרו אליו/ה במועד מסוים
  const cb = raw.match(/\[\[CALLBACK:([^\]]{1,40})\]\]/);
  if (cb) markers.callback = cb[1].trim();

  const text = raw
    .replace(/\[\[END\]\]/g, "")
    .replace(/\[\[HUMAN\]\]/g, "")
    .replace(/\[\[ALERT\]\]/g, "")
    .replace(/\[\[CALLBACK:[^\]]*\]\]/g, "")
    // מנקים שורות ריקות מיותרות שנשארו אחרי הסרת הסמן
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text, markers };
}
