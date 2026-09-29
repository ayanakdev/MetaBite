import { nameMatch, MATCH_FLOOR } from "../src/lib/nameMatch.ts";

const FLOOR = MATCH_FLOOR;

const MUST_REJECT: [string, string][] = [
  ["white rice cooked", "Rice noodles, cooked"],
  ["white rice cooked", "Rice congee, prepared"],
  ["white rice cooked", "Rice pudding"],
  ["grilled chicken breast", "Chicken broth"],
  ["grilled chicken breast", "Chicken noodle soup"],
  ["steamed broccoli", "Broccoli soup, canned"],
  ["scrambled eggs", "Egg substitute, liquid"],
  ["grilled salmon", "Beef steak, grilled"],
  ["apple slices", "Apple juice"],
  ["greek yogurt", "Yogurt drink, strawberry"],
  // Dry staples. USDA lists these raw AND cooked under near-identical names,
  // and the dry row is ~3x the calories and carbs (white rice: 80 g carbs
  // dry vs 28 g cooked per 100 g). Matching the raw row inflated a plate of
  // biryani to 360 g carbs.
  ["biryani rice", "Rice, white, raw, long-grain"],
  ["biryani rice", "Rice, white, raw"],
  ["biryani rice", "Rice, white, dry"],
  ["biryani rice", "Rice, white, uncooked"],
  ["cooked white rice", "Rice, white, dry, long-grain"],
  ["cooked pasta", "Pasta, white, dry"],
  ["oatmeal", "Oats, raw, dry"],
  ["cooked quinoa", "Quinoa, dry"],
  ["cooked lentils", "Lentils, dry"],
  // Raw chicken stays reachable - preparation state must not break meat.
];

const MUST_ACCEPT: [string, string][] = [
  ["white rice cooked", "Rice, white, cooked"],
  ["white rice cooked", "White rice, long grain, cooked"],
  ["grilled chicken breast", "Chicken breast, roasted, skinless, boneless"],
  ["grilled chicken breast", "Chicken breast, grilled"],
  ["steamed broccoli", "Broccoli, raw"],
  ["oatmeal", "Oats, rolled, cooked"],
  ["scrambled eggs", "Egg, whole, cooked"],
  ["greek yogurt", "Milk, yogurt, plain"],
  ["red apple", "Apple, raw, with skin"],
  ["grilled salmon fillet", "Fish, salmon, Atlantic, cooked, dry heat"],
  // The cooked rows must still win now that the raw ones are rejected.
  ["biryani rice", "Rice, white, cooked, enriched"],
  ["biryani rice", "Rice, white, cooked, long-grain"],
  ["cooked pasta", "Pasta, white, cooked"],
  ["chicken breast", "Chicken, raw, boneless skinless"],
  ["chicken breast", "Chicken breast, raw, skinless"],
  // A scan of genuinely uncooked food still resolves to the raw entry.
  ["raw rice", "Rice, white, raw, long-grain"],
  ["dry rice", "Rice, white, raw"],
];

let fails = 0;

console.log(`MUST REJECT (score < ${FLOOR})`);
for (const [a, b] of MUST_REJECT) {
  const s = nameMatch(a, b);
  const ok = s < FLOOR;
  if (!ok) fails++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"}  ${a.padEnd(26)} vs ${b.padEnd(44)} = ${s.toFixed(3)}`,
  );
}

console.log(`\nMUST ACCEPT (score >= ${FLOOR})`);
for (const [a, b] of MUST_ACCEPT) {
  const s = nameMatch(a, b);
  const ok = s >= FLOOR;
  if (!ok) fails++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"}  ${a.padEnd(26)} vs ${b.padEnd(44)} = ${s.toFixed(3)}`,
  );
}

console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILURES`}`);
process.exit(fails === 0 ? 0 : 1);
