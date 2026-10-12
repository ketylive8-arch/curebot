import { describe, it, expect } from "vitest";
import { findPhone, findEmail, prettyPhone } from "../lib/leads";

describe("lead contact extraction", () => {
  it("finds Israeli mobile numbers in common formats", () => {
    expect(findPhone("מיכל, 052-7654321")).toBe("972527654321");
    expect(findPhone("הטלפון שלי 0501234567 תודה")).toBe("972501234567");
    expect(findPhone("+972 54 303 2349")).toBe("972543032349");
    expect(findPhone("972-52-765-4321")).toBe("972527654321");
  });
  it("ignores text without a phone", () => {
    expect(findPhone("הבת שלי בת 14 וזה כבר שנה")).toBeUndefined();
  });
  it("finds email and formats phone for display", () => {
    expect(findEmail("אפשר גם במייל dana.k@gmail.com")).toBe("dana.k@gmail.com");
    expect(prettyPhone("972527654321")).toBe("052-765-4321");
  });
});
