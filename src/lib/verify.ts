import type { Ingredient } from "./types";
import { edibleWeight } from "./types";
import { verifyIngredient, scaleToGrams } from "./usda";
import { searchFood } from "./openfoodfacts";

export type VerifySource = "openfoodfacts" | "usda" | null;

export interface Verification {
  source: VerifySource;
  per100g: Record<string, number>;
  label: string;
}

/**
 * Cross-check one ingredient against the free nutrition databases.
 * Open Food Facts is tried first because it needs no API key and is fast;
 * USDA is the authoritative fallback and needs the free key.
 */
export async function verifyIngredientRow(
  ing: Ingredient,
): Promise<Verification | null> {
  const term = ing.name.trim();
  if (!term) return null;

  try {
    const off = await searchFood(term);
    if (off.length) {
      const hit = off[0];
      const per100g = hit.per100g;
      const hasData = per100g.calories > 0 || per100g.protein_g > 0;
      if (hasData) {
        return { source: "openfoodfacts", per100g, label: hit.name };
      }
    }
  } catch {
    // fall through to USDA
  }

  try {
    const usda = await verifyIngredient(term);
    if (usda && usda.per100g && Object.keys(usda.per100g).length) {
      return { source: "usda", per100g: usda.per100g, label: usda.description };
    }
  } catch {
    // verification is best-effort
  }

  return null;
}

/**
 * Apply a verified per-100g profile to the row's current weight. Rows without a
 * credible profile (everything zero) are left untouched rather than zeroed.
 */
export function applyVerification(
  ing: Ingredient,
  v: Verification,
): Ingredient {
  // Scaled by edible weight, matching resolveIngredient, so the manual verify
  // button cannot quietly disagree with the automatic cross-check.
  const scaled = scaleToGrams(v.per100g, edibleWeight(ing) || 100);
  const use = (key: string, current: number) => {
    const n = scaled[key];
    return typeof n === "number" && n > 0 ? Math.round(n * 10) / 10 : current;
  };
  return {
    ...ing,
    calories: use("calories", ing.calories),
    protein_g: use("protein_g", ing.protein_g),
    carbs_g: use("carbs_g", ing.carbs_g),
    fat_g: use("fat_g", ing.fat_g),
  };
}

/** Fire-and-forget background pass over the whole list. */
export async function verifyAll(
  ingredients: Ingredient[],
): Promise<{ index: number; verification: Verification }[]> {
  const results: { index: number; verification: Verification }[] = [];
  for (let i = 0; i < ingredients.length; i++) {
    const v = await verifyIngredientRow(ingredients[i]);
    if (v) results.push({ index: i, verification: v });
  }
  return results;
}
