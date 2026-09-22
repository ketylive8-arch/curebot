import { describe, it, expect } from "vitest";
import { handleIncoming, type AskFn } from "../lib/core";
import { extractMarkers } from "../lib/markers";
import { CLOSING_CARD, FALLBACK_MESSAGE } from "../lib/prompt";

// מוחות מדומים שמוזרקים לליבה — בלי לקרוא ל-Claude האמיתי.
const constAsk = (out: string): AskFn => async () => out;
const throwAsk: AskFn = async () => {
  throw new Error("529 overloaded");
};

let n = 0;
const freshUser = () => `u${Date.now()}_${n++}`;

describe("extractMarkers", () => {
  it("מסיר את כל הסמנים ולא מחזיר אותם בטקסט", () => {
    const { text, markers } = extractMarkers("שלום\n[[END]]");
    expect(text).toBe("שלום");
    expect(markers.ended).toBe(true);
    expect(markers.human).toBe(false);
  });
  it("מזהה ALERT ו-HUMAN", () => {
    expect(extractMarkers("טקסט\n[[ALERT]]").markers.alert).toBe(true);
    expect(extractMarkers("טקסט\n[[HUMAN]]").markers.human).toBe(true);
  });
});

describe("handleIncoming — ליבה", () => {
  it("מחזיר תשובה נקייה בלי סמנים", async () => {
    const r = await handleIncoming(
      { channel: "whatsapp", userId: freshUser(), text: "היי", messageId: freshUser() },
      constAsk("שמחה שכתבת, ספרי לי עוד 💛"),
    );
    expect(r.replies).toEqual(["שמחה שכתבת, ספרי לי עוד 💛"]);
    expect(r.alert).toBe(false);
  });

  it("dedupe — הודעה עם אותו messageId מטופלת פעם אחת", async () => {
    const uid = freshUser();
    const mid = "same-id-" + freshUser();
    const r1 = await handleIncoming({ channel: "whatsapp", userId: uid, text: "היי", messageId: mid }, constAsk("תשובה"));
    const r2 = await handleIncoming({ channel: "whatsapp", userId: uid, text: "היי", messageId: mid }, constAsk("תשובה"));
    expect(r1.replies.length).toBe(1);
    expect(r2.skipped).toBe("duplicate");
    expect(r2.replies.length).toBe(0);
  });

  it("כרטיס סיום נשלח פעם אחת בלבד", async () => {
    const uid = freshUser();
    const r1 = await handleIncoming(
      { channel: "whatsapp", userId: uid, text: "ביי", messageId: freshUser() },
      constAsk("נשמח לראותך\n[[END]]"),
    );
    expect(r1.replies).toContain(CLOSING_CARD);
    const r2 = await handleIncoming(
      { channel: "whatsapp", userId: uid, text: "תודה", messageId: freshUser() },
      constAsk("בכיף\n[[END]]"),
    );
    expect(r2.replies).not.toContain(CLOSING_CARD);
  });

  it("HUMAN משהה את הבוט לשיחה — ההודעה הבאה מדולגת", async () => {
    const uid = freshUser();
    const r1 = await handleIncoming(
      { channel: "whatsapp", userId: uid, text: "רוצה לדבר עם קטי", messageId: freshUser() },
      constAsk("מעבירה לקטי\n[[HUMAN]]"),
    );
    expect(r1.human).toBe(true);
    const r2 = await handleIncoming(
      { channel: "whatsapp", userId: uid, text: "עוד משהו", messageId: freshUser() },
      constAsk("לא אמור להישלח"),
    );
    expect(r2.skipped).toBe("paused");
  });

  it("ALERT מסמן מצוקה, מסיר את הסמן ומשהה את השיחה", async () => {
    const uid = freshUser();
    const r = await handleIncoming(
      { channel: "whatsapp", userId: uid, text: "אני לא רוצה לחיות", messageId: freshUser() },
      constAsk('את לא לבד, ער"ן 1201\n[[ALERT]]'),
    );
    expect(r.alert).toBe(true);
    expect(r.replies[0]).not.toContain("[[ALERT]]");
  });

  it("הודעת גיבוי כשה-AI נכשל", async () => {
    const r = await handleIncoming(
      { channel: "whatsapp", userId: freshUser(), text: "היי", messageId: freshUser() },
      throwAsk,
    );
    expect(r.replies).toEqual([FALLBACK_MESSAGE]);
  });

  it("הודעה ריקה לא מטופלת", async () => {
    const r = await handleIncoming(
      { channel: "whatsapp", userId: freshUser(), text: "   ", messageId: freshUser() },
      constAsk("לא אמור לרוץ"),
    );
    expect(r.skipped).toBe("empty");
  });
});
