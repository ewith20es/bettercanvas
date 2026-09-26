import { dayKey } from "../../../packages/domain/src";

export const DEFAULT_TOKEN_EXPIRY = "2026-12-10";
export const TOKEN_EXPIRY_ZONE = "America/New_York";

export function validExpiryDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function tokenExpiry(date: string, now: Date) {
  const value = validExpiryDate(date) ? date : DEFAULT_TOKEN_EXPIRY;
  // Calendar days in the school timezone, independent of device timezone and DST.
  const days = Math.round(
    (Date.parse(`${value}T00:00:00Z`) -
      Date.parse(`${dayKey(now, TOKEN_EXPIRY_ZONE)}T00:00:00Z`)) / 86400000,
  );
  const label = days <= 0 ? "Replacement due" : days === 1 ? "1 day left" : `${days} days left`;
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC", month: "short", day: "numeric", year: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
  return { days, label, dateLabel, tone: days <= 0 ? "expired" : days <= 7 ? "soon" : "normal" };
}
