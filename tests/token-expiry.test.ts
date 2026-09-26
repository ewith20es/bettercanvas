import { describe, expect, it } from "vitest";
import { tokenExpiry, validExpiryDate } from "../apps/web/src/token-expiry";

describe("Canvas key expiration reminder", () => {
  it("expires at midnight Eastern, rather than midnight UTC", () => {
    expect(tokenExpiry("2026-12-10", new Date("2026-12-10T04:59:59Z")).label).toBe("1 day left");
    expect(tokenExpiry("2026-12-10", new Date("2026-12-10T05:00:00Z")).label).toBe("Replacement due");
  });
  it("counts calendar days across daylight saving changes", () => {
    expect(tokenExpiry("2026-11-02", new Date("2026-11-01T04:00:00Z")).days).toBe(1);
    expect(tokenExpiry("2027-03-15", new Date("2027-03-14T05:00:00Z")).days).toBe(1);
  });
  it("warns at seven days and keeps expired reminders actionable", () => {
    expect(tokenExpiry("2026-12-10", new Date("2026-12-03T12:00:00Z")).tone).toBe("soon");
    expect(tokenExpiry("2026-12-10", new Date("2026-12-02T12:00:00Z")).tone).toBe("normal");
    expect(tokenExpiry("2026-12-10", new Date("2026-12-11T12:00:00Z")).tone).toBe("expired");
  });
  it("rejects missing or impossible dates and accepts leap dates", () => {
    expect(validExpiryDate("")).toBe(false);
    expect(validExpiryDate("2026-02-30")).toBe(false);
    expect(validExpiryDate("2026-02-29")).toBe(false);
    expect(validExpiryDate("2028-02-29")).toBe(true);
  });
});
