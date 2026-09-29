import type { Ingredient, ParsedMeal } from "./types";
import { edibleWeight } from "./types";

/**
 * Post-scan sanity audit.
 *
 * The vision model is good at naming foods and bad at weights, and a single
 * implausible gram figure poisons every total downstream. Rather than trusting
 * it, the finished result is checked against physical limits for what was
 * actually identified, and anything that fails is surfaced to the user instead
 * of being shown as fact.
 *
 * Observed failure this guards against: a cup of tea ~1/3 full reported as
 * ~10 g protein, because the drink was weighed like a solid portion.
 */

export interface SanityIssue {
  ingredient?: string;
  severity: "warn" | "error";
  message: string;
}

/** Plausible maximum single-portion weight in grams, by food identity. */
const MAX_WEIGHT: { test: (t: string) => boolean; max: number; what: string }[] = [
  { test: (t) => /\b(tea|coffee|juice|water|soda|broth|stock|smoothie|drink)\b/.test(t), max: 700, what: "a single drink" },
  { test: (t) => /\b(milk|yogurt|cream|butter)\b/.test(t), max: 1000, what: "a single glass or carton" },
  { test: (t) => /\b(egg)\b/.test(t), max: 250, what: "a few eggs" },
  { test: (t) => /\b(chicken|beef|pork|steak|fish|salmon|turkey|lamb)\b/.test(t), max: 800, what: "a large portion of meat" },
  { test: (t) => /\b(rice|pasta|noodle|oat|quinoa|bread|potato)\b/.test(t), max: 900, what: "a large bowl of starch" },
  { test: (t) => /\b(salad|lettuce|spinach|broccoli|vegetable)\b/.test(t), max: 800, what: "a large salad" },
];

/** Protein density ceiling in g per 100 g for low-protein foods. */
const MAX_PROTEIN_PER_100G: { test: (t: string) => boolean; max: number; what: string }[] = [
  {
    test: (t) => /\b(tea|coffee|broth|stock)\b/.test(t) && !/\b(milk|cream|powder|sugar|syrup)\b/.test(t),
    max: 1.5,
    what: "unsweetened tea or coffee (about 0 g protein per 100 ml)",
  },
  {
    // Real milk tea / chai is around 1.0-1.5 g protein per 100 ml. A ceiling of
    // 3.0 catches the mis-scaled cup (which produced ~3.3) without flagging a
    // correct estimate.
    test: (t) => /\b(milk tea|tea|latte|cappuccino|coffee)\b/.test(t),
    max: 3,
    what: "a milk-based drink",
  },
  {
    test: (t) => /\b(juice|smoothie|drink|soda)\b/.test(t),
    max: 3,
    what: "a fruit drink",
  },
];

function grams(v: number) {
  return Math.round(v);
}

/** Audit one ingredient row. */
export function checkIngredient(ing: Ingredient): SanityIssue | null {
  const name = (ing.name ?? "").toLowerCase();
  if (!name) return null;

  // The weight ceilings below are about the piece the user can SEE, so they stay
  // on the gross weight - a genuinely large bone-in cut really is that heavy.
  for (const rule of MAX_WEIGHT) {
    if (rule.test(name) && ing.quantity_g > rule.max) {
      return {
        ingredient: ing.name,
        severity: "error",
        message: `${ing.name}: ${grams(ing.quantity_g)} g is more than ${rule.max} g (${rule.what}). The scale reference is probably missing, so the weight looks too high.`,
      };
    }
  }

  // Protein density, on the other hand, is a property of the meat, so it has to
  // be measured against edible weight. Dividing by the gross weight of a
  // bone-in piece dilutes the density and would hide a real error rather than
  // catch one.
  const meat = edibleWeight(ing);
  for (const rule of MAX_PROTEIN_PER_100G) {
    if (!rule.test(name)) continue;
    const per100 = meat > 0 ? (ing.protein_g / meat) * 100 : 0;
    if (per100 > rule.max) {
      return {
        ingredient: ing.name,
        severity: "error",
        message: `${ing.name}: ${ing.protein_g} g protein in ${grams(meat)} g of meat works out to ${per100.toFixed(1)} g per 100 g, which is too high for ${rule.what}. This is probably not what is in the cup.`,
      };
    }
  }

  // Atwater check: macros cannot account for wildly more energy than stated.
  const derived = ing.protein_g * 4 + ing.carbs_g * 4 + ing.fat_g * 9;
  if (ing.calories > 0 && derived > ing.calories * 1.4) {
    return {
      ingredient: ing.name,
      severity: "warn",
      message: `${ing.name}: the macros add up to more energy than the stated ${grams(ing.calories)} kcal.`,
    };
  }
  return null;
}

/** Audit a whole parsed meal. */
export function auditMeal(meal: ParsedMeal): SanityIssue[] {
  const issues: SanityIssue[] = [];
  for (const ing of meal.ingredients ?? []) {
    const issue = checkIngredient(ing);
    if (issue) issues.push(issue);
  }

  const totalGrams = (meal.ingredients ?? []).reduce((a, i) => a + (i.quantity_g || 0), 0);
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    issues.push({
      severity: "error",
      message:
        "These numbers are probably wrong. Put a coin, card or thumb next to the " +
        "food so there is a scale reference, or correct the weights by hand.",
    });
  }

  // A whole meal over 4 kg is physically not a single sitting.
  if (totalGrams > 4000) {
    issues.push({
      severity: "warn",
      message: `Total weight comes to ${Math.round(totalGrams)} g, which is more than one meal.`,
    });
  }

  // Whole-meal ceilings. These catch a *systematically* wrong total that no
  // per-row check can see, because every individual row was individually
  // plausible while all of them were priced against the wrong food.
  //
  // Carbs are the one to watch: cooked white rice is ~28 g per 100 g, so 200 g
  // in a large plate is already generous. Reading far past that means the rice
  // was priced as DRY (80 g per 100 g), which is the bug this guards - a plate
  // of biryani came back as 360 g carbs, implying 1.3 kg of rice.
  const carbs = (meal.ingredients ?? []).reduce((a, i) => a + (i.carbs_g || 0), 0);
  if (carbs > 200) {
    issues.push({
      severity: "error",
      message: `This meal adds up to ${Math.round(carbs)} g of carbohydrate. That is more than a large plate of rice, and usually means a dry (uncooked) food was priced as if it were cooked. Check the weights, or add the food as separate items.`,
    });
  }

  const protein = (meal.ingredients ?? []).reduce((a, i) => a + (i.protein_g || 0), 0);
  if (protein > 120) {
    issues.push({
      severity: "error",
      message: `${Math.round(protein)} g of protein is more than a large meat portion (about 500 g of chicken). Check the weights.`,
    });
  }

  const kcalTotal = (meal.ingredients ?? []).reduce((a, i) => a + (i.calories || 0), 0);
  if (kcalTotal > 3500) {
    issues.push({
      severity: "error",
      message: `${Math.round(kcalTotal)} kcal is larger than any normal single meal. Check the weights.`,
    });
  }

  return issues;
}
