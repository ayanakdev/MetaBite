import type { LoggedMeal } from "./types";

/**
 * Pure day-key and aggregation helpers.
 *
 * Deliberately free of any Supabase or React import so the date maths - where
 * off-by-one errors would silently misfile a whole day's meals - can be tested
 * directly with plain node.
 */

export const APP_TIMEZONE = "Asia/Karachi";

/**
 * Intl formatters are cached at module scope on purpose.
 *
 * On Hermes every `new Intl.DateTimeFormat(...)` is expensive - the first one
 * pulls in ICU data, and each subsequent construction allocates again. The
 * History screen formats 30 days, so building a formatter per day added up to a
 * visible stall on open. These are built once for the life of the module.
 */
const KEY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const LABEL_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});
const WEEKDAY_FMT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" });

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * The last `days` app-local days, oldest first, always ending today.
 *
 * Keys must match the `eaten_on` values the database writes. Arithmetic runs in
 * UTC on a fixed noon so it cannot be shifted by the host machine's own
 * timezone or by a DST boundary.
 */
export function recentDayKeys(days: number, from = new Date()): string[] {
  const todayKey = KEY_FMT.format(from);
  const [y, m, d] = todayKey.split("-").map(Number);

  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    dt.setUTCDate(dt.getUTCDate() - i);
    keys.push(`${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`);
  }
  return keys;
}

/** Today in the app timezone, as the YYYY-MM-DD key the database uses. */
export function todayKey(): string {
  return KEY_FMT.format(new Date());
}

/** "Mar 14" plus a short weekday, for the chart axis and the day rows. */
export function labelFor(key: string) {
  const dt = new Date(`${key}T12:00:00Z`);
  return { label: LABEL_FMT.format(dt), weekday: WEEKDAY_FMT.format(dt) };
}

export interface DaySummary {
  /** YYYY-MM-DD, app-local. */
  day: string;
  label: string;
  weekday: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meal_count: number;
}

/** Collapse a flat meal list into one row per day, including empty days. */
export function summarise(meals: LoggedMeal[], days: number, from = new Date()): DaySummary[] {
  const keys = recentDayKeys(days, from);
  const byDay = new Map<string, DaySummary>();
  for (const key of keys) {
    const { label, weekday } = labelFor(key);
    byDay.set(key, {
      day: key,
      label,
      weekday,
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      meal_count: 0,
    });
  }

  for (const m of meals) {
    const row = byDay.get(m.eaten_on);
    if (!row) continue;
    row.calories += m.calories ?? 0;
    row.protein_g += m.protein_g ?? 0;
    row.carbs_g += m.carbs_g ?? 0;
    row.fat_g += m.fat_g ?? 0;
    row.meal_count += 1;
  }

  return keys.map((k) => {
    const r = byDay.get(k)!;
    return {
      ...r,
      calories: Math.round(r.calories),
      protein_g: Math.round(r.protein_g * 10) / 10,
      carbs_g: Math.round(r.carbs_g * 10) / 10,
      fat_g: Math.round(r.fat_g * 10) / 10,
    };
  });
}
