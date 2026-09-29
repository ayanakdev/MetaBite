import { auditMeal } from "../src/lib/sanity.ts";
import { nameMatch } from "../src/lib/nameMatch.ts";
import type { ParsedMeal } from "../src/lib/types.ts";

/**
 * Replays the reported failure through the new sanity audit to confirm the
 * bad result is now caught instead of being displayed as fact.
 */

const m = (o: Partial<ParsedMeal>): ParsedMeal => ({
  title: "Tea",
  ingredients: [],
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  fiber_g: 0,
  sugar_g: 0,
  sodium_mg: 0,
  ...o,
});

const CASES: [string, ParsedMeal, boolean][] = [
  [
    "BUG: chai weighed like a solid (the reported failure)",
    m({
      title: "Milk tea",
      ingredients: [
        { name: "milk tea", quantity_g: 300, calories: 180, protein_g: 10, carbs_g: 30, fat_g: 3 },
      ],
      calories: 180,
      protein_g: 10,
      carbs_g: 30,
      fat_g: 3,
    }),
    true,
  ],
  [
    "BUG: tea tagged with dairy protein density",
    m({
      title: "Tea",
      ingredients: [
        { name: "tea with milk", quantity_g: 120, calories: 70, protein_g: 8, carbs_g: 10, fat_g: 2 },
      ],
      calories: 70,
      protein_g: 8,
      carbs_g: 10,
      fat_g: 2,
    }),
    true,
  ],
  [
    "CORRECT: a third-full cup of chai",
    m({
      title: "Masala chai",
      ingredients: [
        { name: "milk tea", quantity_g: 90, calories: 48, protein_g: 1.4, carbs_g: 7.5, fat_g: 1.2 },
      ],
      calories: 48,
      protein_g: 1.4,
      carbs_g: 7.5,
      fat_g: 1.2,
    }),
    false,
  ],
  [
    "BUG: biryani rice priced as DRY rice (81 g protein, 360 g carbs)",
    m({
      title: "Chicken biryani",
      ingredients: [
        { name: "biryani rice", quantity_g: 450, calories: 1640, protein_g: 38, carbs_g: 360, fat_g: 4 },
        { name: "chicken", quantity_g: 150, calories: 248, protein_g: 43, carbs_g: 0, fat_g: 7 },
      ],
      calories: 1888,
      protein_g: 81,
      carbs_g: 360,
      fat_g: 11,
    }),
    true,
  ],
  [
    "CORRECT: same biryani, rice priced COOKED (450 g -> 127 g carbs)",
    m({
      title: "Chicken biryani",
      ingredients: [
        { name: "biryani rice", quantity_g: 450, calories: 585, protein_g: 12, carbs_g: 127, fat_g: 1 },
        { name: "chicken", quantity_g: 150, calories: 248, protein_g: 43, carbs_g: 0, fat_g: 7 },
        { name: "cooking oil", quantity_g: 30, calories: 270, protein_g: 0, carbs_g: 0, fat_g: 30 },
      ],
      calories: 1103,
      protein_g: 55,
      carbs_g: 127,
      fat_g: 38,
    }),
    false,
  ],
  [
    "CORRECT: a normal lunch",
    m({
      title: "Chicken biryani",
      ingredients: [
        { name: "chicken", quantity_g: 150, calories: 248, protein_g: 46, carbs_g: 0, fat_g: 7 },
        { name: "rice", quantity_g: 250, calories: 325, protein_g: 5, carbs_g: 68, fat_g: 1 },
      ],
      calories: 573,
      protein_g: 51,
      carbs_g: 68,
      fat_g: 8,
    }),
    false,
  ],
  [
    "CORRECT: large but legitimate portion",
    m({
      title: "Big plate of pasta",
      ingredients: [
        { name: "pasta", quantity_g: 500, calories: 780, protein_g: 30, carbs_g: 130, fat_g: 16 },
      ],
      calories: 780,
      protein_g: 30,
      carbs_g: 130,
      fat_g: 16,
    }),
    false,
  ],
];

let fails = 0;
for (const [label, meal, shouldFlag] of CASES) {
  const issues = auditMeal(meal);
  const flagged = issues.some((i) => i.severity === "error");
  const ok = flagged === shouldFlag;
  if (!ok) fails++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}`);
  console.log(`         flagged=${flagged} expected=${shouldFlag}`);
  for (const i of issues) console.log(`         [${i.severity}] ${i.message}`);
}

console.log("\ndisambiguation after the fix:");
for (const [a, b] of [
  ["milk", "Milk tea, prepared"],
  ["greek yogurt", "Milk, yogurt, plain"],
  ["salmon", "Fish, salmon, Atlantic, cooked"],
] as [string, string][]) {
  console.log(`  ${nameMatch(a, b).toFixed(3)}  ${a} vs ${b}`);
}

console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILURES`}`);
process.exit(fails === 0 ? 0 : 1);
