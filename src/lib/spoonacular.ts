/**
 * Spoonacular — free Food API, 1500 req/day. Rich micronutrient data
 * (vitamins and minerals per ingredient), which is exactly what the vision
 * model cannot determine from a photo.
 *
 * The key is optional: if it is missing or rejected, every other source still
 * works and the app degrades gracefully.
 *
 * NOTE: as of this build the configured key returns 401 "not authorized", so
 * this source self-disables at runtime until a working key is supplied.
 */
const KEY = process.env.EXPO_PUBLIC_SPOONACULAR_API_KEY;
const BASE = "https://api.spoonacular.com";

/**
 * Set once a request comes back 401/403, so the rest of the session stops
 * calling this source at all.
 *
 * The consensus fan-out runs per ingredient, so a key the API rejects used to
 * cost one guaranteed-to-fail round trip for every item on the plate. Those
 * requests sit inside a `Promise.all`, so each one held up the whole cross-check
 * for a result that could only ever be an empty array. Latching the failure
 * turns a rejected key from a per-ingredient tax into a single wasted call.
 */
let unavailable = false;

export function isConfigured() {
  return !!KEY && !unavailable;
}

/** Clear the latch, e.g. after the user replaces the key. */
export function resetAvailability() {
  unavailable = false;
}

function latch(status: number) {
  if (status === 401 || status === 403) unavailable = true;
}

export interface SpoonHit {
  id: number;
  name: string;
  /** Nutrition per 100 g, as Spoonacular reports it. */
  per100g: Record<string, number>;
}

const NUTRIENT_KEYS: Record<string, string> = {
  calories: "calories",
  protein: "protein_g",
  carbohydrates: "carbs_g",
  fat: "fat_g",
  fiber: "fiber_g",
  sugar: "sugar_g",
  sodium: "sodium_mg",
  vitaminA: "Vitamin A",
  vitaminC: "Vitamin C",
  vitaminD: "Vitamin D",
  calcium: "Calcium",
  iron: "Iron",
  potassium: "Potassium",
  zinc: "Zinc",
};

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/** Search packaged foods with full nutrition. Returns [] on any failure. */
export async function searchFood(term: string): Promise<SpoonHit[]> {
  if (!KEY || unavailable) return [];
  const url = `${BASE}/food/search?query=${encodeURIComponent(
    term,
  )}&number=3&api_key=${KEY}`;

  try {
    const res = await fetch(url);
    latch(res.status);
    if (!res.ok) return [];
    const json: any = await res.json();

    return (json?.spoonacularId ? [json] : (json?.data ?? []))
      .filter((x: any) => x?.name)
      .map((x: any) => {
        const per100g: Record<string, number> = {};
        const nutr = x.nutrition ?? x.nutritionData ?? {};
        for (const [k, label] of Object.entries(NUTRIENT_KEYS)) {
          const raw = nutr[k];
          if (raw === undefined || raw === null) continue;
          // Spoonacular nutrition objects are {value, unit, modifiers}
          const v = typeof raw === "object" ? n(raw.value) : n(raw);
          if (v > 0) per100g[label] = v;
        }
        return { id: x.id ?? x.spoonacularId, name: x.name, per100g };
      });
  } catch {
    return [];
  }
}

/**
 * Parse a free-text ingredient line like "150g grilled chicken breast" using
 * Spoonacular's ingredient parser. Returns normalised per-item nutrition.
 */
export async function analyzeIngredientsLine(
  line: string,
): Promise<{ name: string; grams: number; per100g: Record<string, number> }[]> {
  if (!KEY || unavailable) return [];
  const url = `${BASE}/food/ingredients/analyze?language=en&api_key=${KEY}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `ingredients=${encodeURIComponent(line)}`,
    });
    latch(res.status);
    if (!res.ok) return [];
    const json: any = await res.json();

    return (Array.isArray(json) ? json : []).map((x: any) => {
      const per100g: Record<string, number> = {};
      for (const [k, label] of Object.entries(NUTRIENT_KEYS)) {
        const raw = x?.nutrition?.[k];
        if (raw === undefined || raw === null) continue;
        const v = typeof raw === "object" ? n(raw.value) : n(raw);
        if (v > 0) per100g[label] = v;
      }
      return {
        name: String(x?.name ?? "Unknown"),
        grams: n(x?.grams) || 100,
        per100g,
      };
    });
  } catch {
    return [];
  }
}
