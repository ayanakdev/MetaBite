import { supabase } from "./supabase";
import { recentDayKeys, summarise, type DaySummary } from "./dates";
import type { LoggedMeal } from "./types";

/**
 * 30-day history loading.
 *
 * Aggregated on the client rather than in SQL. `logged_meals.eaten_on` is
 * already stored as the app-local day (Asia/Karachi, see the `app_day()`
 * helper behind `daily_totals`), so no timezone maths is needed here -
 * grouping by that column is enough, and it avoids adding a database function
 * purely to sum four columns.
 *
 * The date maths and aggregation live in ./dates so they can be tested without
 * a Supabase connection; see tests/history.test.ts.
 */

export const HISTORY_DAYS = 30;

export type { DaySummary } from "./dates";

/** Load and aggregate the last `days` days, oldest first. */
export async function loadHistory(days: number = HISTORY_DAYS): Promise<DaySummary[]> {
  const keys = recentDayKeys(days);
  const last = keys[keys.length - 1];

  const { data, error } = await supabase
    .from("logged_meals")
    .select("eaten_on, calories, protein_g, carbs_g, fat_g")
    .gte("eaten_on", keys[0])
    .lte("eaten_on", last)
    .limit(2000);

  if (error) throw error;
  return summarise((data ?? []) as LoggedMeal[], days);
}
