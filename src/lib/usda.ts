/**
 * USDA FoodData Central — background verification of AI-estimated macros
 * against an authoritative nutrient database. Free API key required.
 * https://fdc.nal.usda.gov/api-guide.html
 */
const KEY = process.env.EXPO_PUBLIC_USDA_API_KEY ?? "DEMO_KEY";
const BASE = "https://api.nal.usda.gov/fdc/v1";

const NUTRIENT_MAP: Record<string, string> = {
  Energy: "calories",
  "Protein": "protein_g",
  "Carbohydrate, by difference": "carbs_g",
  "Total lipid (fat)": "fat_g",
  "Fiber, total dietary": "fiber_g",
  "Sugars, total including NLEA": "sugar_g",
  Sodium: "sodium_mg",
};

/** Only kcal counts; the kJ row is the same energy in different units. */
function isKcal(n: any) {
  const u = String(n?.unitName ?? n?.unit ?? "").toLowerCase();
  return u === "" || u.includes("kcal");
}

/** Look up one ingredient by name and return per-100g macros. */
export async function verifyIngredient(name: string) {
  const url = `${BASE}/foods/search?query=${encodeURIComponent(
    name,
  )}&pageSize=1&dataType=Foundation,SR%20Legacy&api_key=${KEY}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json: any = await res.json();
    const food = json?.foods?.[0];
    if (!food) return null;

    const out: Record<string, number> = {};
    // USDA returns several rows per nutrient (e.g. Energy in kcal AND in kJ).
    // Taking the last one silently picked up kJ and inflated calories ~2.5x,
    // so keep the FIRST kcal row and ignore the rest.
    for (const n of food.foodNutrients ?? []) {
      const key = NUTRIENT_MAP[n.nutrientName];
      if (!key) continue;
      if (n.nutrientName === "Energy" && !isKcal(n)) continue;
      if (out[key] !== undefined) continue;
      const v = Number(n.value);
      if (Number.isFinite(v) && v >= 0) out[key] = v;
    }

    return {
      fdcId: food.fdcId as number,
      description: (food.description ?? name) as string,
      per100g: out,
    };
  } catch {
    return null;
  }
}

/**
 * Same lookup, but returns several candidates so the caller can disambiguate
 * by name instead of blindly taking foods[0]. "white rice cooked" matches
 * sticky rice, congee and noodles too, and those differ hugely in calories.
 */
export async function usdaSearch(name: string) {
  const url = `${BASE}/foods/search?query=${encodeURIComponent(
    name,
  )}&pageSize=8&dataType=Foundation,SR%20Legacy&api_key=${KEY}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json: any = await res.json();
    const foods: any[] = json?.foods ?? [];
    if (!foods.length) return null;

    // Return the best plausible candidate; the caller still name-checks it.
    let best: { description: string; per100g: Record<string, number> } | null = null;
    for (const food of foods) {
      const out: Record<string, number> = {};
      for (const n of food.foodNutrients ?? []) {
        const key = NUTRIENT_MAP[n.nutrientName];
        if (!key) continue;
        if (n.nutrientName === "Energy" && !isKcal(n)) continue;
        if (out[key] !== undefined) continue;
        const v = Number(n.value);
        if (Number.isFinite(v) && v >= 0) out[key] = v;
      }
      // Require a usable, non-absurd calorie figure.
      if (!(out.calories > 0 && out.calories < 1000)) continue;
      if (!best) best = { description: food.description ?? name, per100g: out };
    }

    return best;
  } catch {
    return null;
  }
}

/** Re-scale a verified per-100g profile to the logged gram weight. */
export function scaleToGrams(
  per100g: Record<string, number>,
  quantityG: number,
): Record<string, number> {
  const f = quantityG / 100;
  return Object.fromEntries(
    Object.entries(per100g).map(([k, v]) => [k, Math.round(v * f * 100) / 100]),
  );
}
