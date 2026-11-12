import { describe, expect, it } from "vitest";
import { parseIsraelTime } from "../lib/followups";
import { extractMarkers } from "../lib/markers";

describe("משפך המעקבים", () => {
  it("מתרגם מועד בשעון ישראל (חורף, UTC+2)", () => {
    expect(new Date(parseIsraelTime("2026-11-15 10:00")!).toISOString()).toBe("2026-11-15T08:00:00.000Z");
  });
  it("מתרגם מועד בשעון קיץ (UTC+3)", () => {
    expect(new Date(parseIsraelTime("2026-07-01 09:30")!).toISOString()).toBe("2026-07-01T06:30:00.000Z");
  });
  it("בלי שעה — 10:00", () => {
    expect(new Date(parseIsraelTime("2026-11-15")!).toISOString()).toBe("2026-11-15T08:00:00.000Z");
  });
  it("קלט לא תקין — null", () => {
    expect(parseIsraelTime("מחר")).toBeNull();
  });
  it("סמן CALLBACK נשלף ולא מגיע לפונה", () => {
    const { text, markers } = extractMarkers("סגור, קטי תחזור אלייך ביום ראשון בעשר 🙏\n[[CALLBACK:2026-11-15 10:00]]");
    expect(markers.callback).toBe("2026-11-15 10:00");
    expect(text).toBe("סגור, קטי תחזור אלייך ביום ראשון בעשר 🙏");
  });
});

describe("בקשת חזרה בשיחה", () => {
  it("נכנסת ליומן המעקבים והפונה מקבל/ת אישור בלי הסמן", async () => {
    const { handleIncoming } = await import("../lib/core");
    const { listFollowups } = await import("../lib/followups");
    const r = await handleIncoming(
      { channel: "whatsapp", userId: "972501234567", text: "תחזרו אליי ביום ראשון בעשר", messageId: "cb-1", name: "אסה" },
      async () => "תודה, קיבלנו 🙏 קטי תחזור אלייך ביום ראשון בעשר.\n[[CALLBACK:2026-11-15 10:00]]",
    );
    expect(r.replies[0]).toBe("תודה, קיבלנו 🙏 קטי תחזור אלייך ביום ראשון בעשר.");
    const f = (await listFollowups()).find((x) => x.key === "whatsapp:972501234567");
    expect(f?.kind).toBe("callback");
    expect(f?.phone).toBe("972501234567");
    expect(new Date(f!.due).toISOString()).toBe("2026-11-15T08:00:00.000Z");
  });
});
