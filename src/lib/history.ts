import { supabase } from "./supabase";
import { recentDayKeys, summarise, totalsForDay, type DaySummary, type DayTotals } from "./dates";
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

export type { DaySummary, DayTotals } from "./dates";

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

/**
 * The full meal rows for one day, oldest first.
 *
 * This is deliberately a separate, on-demand query rather than widening
 * loadHistory. The 30-day chart needs four columns to draw 30 bars; pulling the
 * ingredients jsonb and the micros jsonb for every meal in the window would
 * multiply that payload by an order of magnitude for data the chart never
 * renders.
 *
 * Cost is one small indexed lookup per day the user actually opens. Row level
 * security narrows it to the caller's own rows and the composite index on
 * (user_id, eaten_on desc) turns it into a range scan over a handful of rows, so
 * it is far cheaper than the 30-day query the tab already runs.
 */
export async function loadDayMeals(day: string): Promise<LoggedMeal[]> {
  const { data, error } = await supabase
    .from("logged_meals")
    .select("*")
    .eq("eaten_on", day)
    .order("logged_at", { ascending: true })
    .limit(100);

  if (error) throw error;
  return (data ?? []) as LoggedMeal[];
}

/** One call for both the day's headline numbers and its meal list. */
export async function loadDay(
  day: string,
): Promise<{ totals: DayTotals; meals: LoggedMeal[] }> {
  const meals = await loadDayMeals(day);
  return { totals: totalsForDay(meals, day), meals };
}
