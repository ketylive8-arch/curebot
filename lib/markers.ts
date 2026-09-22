// חילוץ הסמנים שהסוכן מוסיף בשורה נפרדת, והסרתם מהטקסט שנשלח לפונה.
// הסמנים לעולם לא מגיעים לפונה.

export type Markers = { ended: boolean; human: boolean; alert: boolean };

export function extractMarkers(raw: string): { text: string; markers: Markers } {
  const markers: Markers = {
    ended: raw.includes("[[END]]"),
    human: raw.includes("[[HUMAN]]"),
    alert: raw.includes("[[ALERT]]"),
  };

  const text = raw
    .replace(/\[\[END\]\]/g, "")
    .replace(/\[\[HUMAN\]\]/g, "")
    .replace(/\[\[ALERT\]\]/g, "")
    // מנקים שורות ריקות מיותרות שנשארו אחרי הסרת הסמן
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text, markers };
}
