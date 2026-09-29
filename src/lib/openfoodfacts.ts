/**
 * Open Food Facts — free, open, no API key. Used to cross-check packaged goods
 * (where a barcode/label beats a visual estimate).
 * https://world.openfoodfacts.org/data
 */
const BASE = "https://world.openfoodfacts.org";

export interface OffHit {
  code: string;
  name: string;
  per100g: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    sugar_g: number;
    sodium_mg: number;
  };
}

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Open Food Facts is crowd-sourced, so a fair number of products carry
 * placeholder or near-zero nutrition rows (observed: a "cooked white rice"
 * entry with 138 kcal but protein 1.4e-14 and carbs 1.6e-13). Merging those
 * would silently delete the macros they disagree about, so reject anything
 * whose macro profile is physically impossible for its stated calories.
 */
function isPlausible(p: {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}) {
  const { calories, protein_g, carbs_g, fat_g } = p;
  if (calories <= 0) return false;
  if (protein_g < 0 || carbs_g < 0 || fat_g < 0) return false;

  // Atwater check: macros cannot account for wildly more than the calories.
  const derived = protein_g * 4 + carbs_g * 4 + fat_g * 9;
  if (derived > calories * 1.35) return false;

  // A real food always has some macro mass. Near-zero across the board with
  // non-zero calories means the row is a stub, not a measurement.
  if (protein_g + carbs_g + fat_g < 0.5) return false;

  return true;
}

export async function searchFood(term: string): Promise<OffHit[]> {
  const url = `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(
    term,
  )}&search_simple=1&action=process&json=1&page_size=5&fields=code,product_name,nutriments`;

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const json: any = await res.json();
    const products: any[] = json?.products ?? [];

    return products
      .filter((p) => p?.product_name)
      .map((p) => ({
        code: String(p.code),
        name: String(p.product_name),
        per100g: {
          calories: n(p.nutriments?.["energy-kcal_100g"]),
          protein_g: n(p.nutriments?.proteins_100g),
          carbs_g: n(p.nutriments?.carbohydrates_100g),
          fat_g: n(p.nutriments?.fat_100g),
          fiber_g: n(p.nutriments?.fiber_100g),
          sugar_g: n(p.nutriments?.sugars_100g),
          sodium_mg: n(p.nutriments?.sodium_100g),
        },
      }))
      .filter((h) => isPlausible(h.per100g));
  } catch {
    return [];
  }
}
