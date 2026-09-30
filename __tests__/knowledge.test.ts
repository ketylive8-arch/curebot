import { describe, it, expect } from "vitest";
import { KNOWLEDGE, buildSystemPrompt } from "../lib/knowledge";
import { SYSTEM_PROMPT } from "../lib/prompt";

describe("ספריית התוכן", () => {
  it("הפרומפט המלא מכיל את הפרומפט המקורי כמות שהוא, לפני הידע", () => {
    const full = buildSystemPrompt();
    expect(full.startsWith(SYSTEM_PROMPT)).toBe(true);
    expect(full.endsWith(KNOWLEDGE)).toBe(true);
  });

  it("אין placeholders פתוחים שעלולים לדלוף לפונה", () => {
    expect(KNOWLEDGE).not.toMatch(/\[\[(?!END\]\]|HUMAN\]\]|ALERT\]\])/);
    expect(KNOWLEDGE).not.toContain("escalate_to_human");
  });

  it("לא ממציא מחיר, ולא מציג את הסוכן כבן אדם", () => {
    expect(KNOWLEDGE).toContain("אין לך מחיר ליווי");
    expect(KNOWLEDGE).toContain('לעולם לא אומרים "אני בן אדם"');
  });

  it("'לא, תודה' לא מפעיל כרטיס סיום עם קישורים", () => {
    expect(KNOWLEDGE).toMatch(/לא מוסיפים \[\[END\]\]/);
  });
});
