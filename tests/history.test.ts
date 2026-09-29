import {
  recentDayKeys,
  summarise,
  labelFor,
  APP_TIMEZONE,
  type DaySummary,
} from "../src/lib/dates.ts";
import type { LoggedMeal } from "../src/lib/types.ts";

/**
 * The day-key maths decides which bucket a meal lands in, so an off-by-one
 * here would show a meal on the wrong day rather than fail loudly. These cases
 * pin the month rollover, leap day, and the PKT midnight boundary.
 */

let fails = 0;
function check(label: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  const ok = a === b;
  if (!ok) fails++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}`);
  if (!ok) console.log(`         got  ${a}\n         want ${b}`);
}

// A fixed instant so the suite is deterministic. 2026-03-15 06:00 UTC is
// 11:00 in Karachi, i.e. mid-morning on the 15th.
const NOW = new Date("2026-03-15T06:00:00Z");

console.log("recentDayKeys");
{
  const k = recentDayKeys(30, NOW);
  check("length", k.length, 30);
  check("oldest", k[0], "2026-02-14");
  check("newest is today", k[29], "2026-03-15");
  check("strictly ascending", k.every((d, i) => i === 0 || d > k[i - 1]), true);
  check("all YYYY-MM-DD", k.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)), true);
}

console.log("\nmonth + leap-year rollover");
{
  check("Mar 1 -> Feb 28 (2026, not a leap year)", recentDayKeys(2, new Date("2026-03-01T06:00:00Z")), [
    "2026-02-28",
    "2026-03-01",
  ]);
  check("Mar 1 -> Feb 29 (2028, leap year)", recentDayKeys(2, new Date("2028-03-01T06:00:00Z")), [
    "2028-02-29",
    "2028-03-01",
  ]);
  check("Jan 1 -> Dec 31 (year boundary)", recentDayKeys(2, new Date("2026-01-01T06:00:00Z")), [
    "2025-12-31",
    "2026-01-01",
  ]);
}

console.log("\nPKT midnight boundary (app day starts 00:00 UTC+5)");
{
  // 2026-03-14T19:00Z == 2026-03-15 00:00 in Karachi: already the 15th.
  check("19:00Z on the 14th is already the 15th in PKT", recentDayKeys(1, new Date("2026-03-14T19:00:00Z")), [
    "2026-03-15",
  ]);
  // 2026-03-14T18:59Z == 23:59 on the 14th in Karachi: still the 14th.
  check("18:59Z on the 14th is still the 14th in PKT", recentDayKeys(1, new Date("2026-03-14T18:59:00Z")), [
    "2026-03-14",
  ]);
  // 2026-03-14T00:30Z == 05:30 in Karachi: the 14th.
  check("00:30Z is same-day in PKT", recentDayKeys(1, new Date("2026-03-14T00:30:00Z")), [
    "2026-03-14",
  ]);
}

console.log("\nsummarise");
{
  const m = (o: Partial<LoggedMeal>): LoggedMeal =>
    ({ id: "x", eaten_on: "2026-03-15", calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, ...o }) as LoggedMeal;

  const rows = summarise(
    [
      m({ eaten_on: "2026-03-15", calories: 600, protein_g: 30, carbs_g: 70, fat_g: 18 }),
      m({ eaten_on: "2026-03-15", calories: 340, protein_g: 22.55, carbs_g: 30, fat_g: 9.4 }),
      m({ eaten_on: "2026-03-14", calories: 2000, protein_g: 100, carbs_g: 200, fat_g: 70 }),
    ],
    30,
    NOW,
  );

  check("one row per day", rows.length, 30);
  const today = rows[29];
  check("two meals summed", today.meal_count, 2);
  check("calories summed", today.calories, 940);
  check("protein summed and rounded to 0.1", today.protein_g, 52.6);
  check("fat rounded to 0.1", today.fat_g, 27.4);
  check("yesterday kept separate", rows[28].calories, 2000);
  check("empty day is zeroed, not missing", rows[0].meal_count, 0);
  check("empty day calories zero", rows[0].calories, 0);
  check("total days with meals = 2", rows.filter((d) => d.meal_count > 0).length, 2);
  check("oldest first", rows[0].day < rows[29].day, true);
}

console.log("\nout-of-range meals are ignored, not crashed on");
{
  const rows = summarise(
    [{ eaten_on: "1999-01-01", calories: 999, protein_g: 1, carbs_g: 1, fat_g: 1 } as LoggedMeal],
    30,
    NOW,
  );
  check("still 30 rows", rows.length, 30);
  check("stale meal counted nowhere", rows.reduce((a, d) => a + d.meal_count, 0), 0);
}

console.log("\nlabels");
{
  check("Mar 14", labelFor("2026-03-14").label, "Mar 14");
  check("Mar 14 weekday", labelFor("2026-03-14").weekday, "Sat");
  check("Dec 31", labelFor("2026-12-31").label, "Dec 31");
  check("single day", recentDayKeys(1, NOW).length, 1);
  check("window is 30 days", recentDayKeys(30, NOW).length, 30);
  check("timezone", APP_TIMEZONE, "Asia/Karachi");
}

console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILURES`}`);
process.exit(fails === 0 ? 0 : 1);
