import Dexie, { type Table } from "dexie";
import type { Snapshot } from "../../../packages/domain/src";
import { DEFAULT_TOKEN_EXPIRY } from "./token-expiry";
export type Preferences = {
  hidden: string[];
  hiddenAssignments: string[];
  submittedInPerson: string[];
  nicknames: Record<string, string>;
  colors: Record<string, string>;
  zone: string;
  theme: "light" | "dark" | "system";
  offline: boolean;
  courseView: "list" | "gallery";
  coursePeriods: Record<string, number>;
  canvasTokenExpiry: string;
};
export const defaults: Preferences = {
  hidden: [],
  hiddenAssignments: [],
  submittedInPerson: [],
  nicknames: {},
  colors: {},
  zone: "America/New_York",
  theme: "light",
  offline: false,
  courseView: "gallery",
  coursePeriods: {},
  canvasTokenExpiry: DEFAULT_TOKEN_EXPIRY,
};
const db = new Dexie("bettercanvas-v1") as Dexie & {
  snapshots: Table<{ key: string; value: Snapshot }>;
};
db.version(1).stores({ snapshots: "key" });
export function accountKey(s: Snapshot) {
  return `${s.account.origin}:${s.account.id}`;
}
export function readPrefs(key: string): Preferences {
  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem(`bc:prefs:${key}`) ?? "{}"),
    };
  } catch {
    return { ...defaults };
  }
}
export function savePrefs(key: string, prefs: Preferences) {
  localStorage.setItem(`bc:prefs:${key}`, JSON.stringify(prefs));
}
export async function saveCache(value: Snapshot) {
  await db.transaction("rw", db.snapshots, async () => {
    await db.snapshots.clear();
    await db.snapshots.put({ key: accountKey(value), value });
  });
}
export async function readCache() {
  return (await db.snapshots.toArray())[0]?.value ?? null;
}
export async function clearCache() {
  await db.snapshots.clear();
}
export async function clearLocalData() {
  await clearCache();
  for (const key of Object.keys(localStorage))
    if (key.startsWith("bc:")) localStorage.removeItem(key);
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    ...(method !== "GET"
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body ?? {}),
        }
      : {}),
  });
  if (!response.ok) {
    const value = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      value.error ?? "Unable to update. Please try again.",
    );
  }
  return response.json();
}
