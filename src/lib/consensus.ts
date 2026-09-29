import type { Ingredient, Micros, ParsedMeal } from "./types";
import { edibleWeight } from "./types";
import { nameMatch, MATCH_FLOOR } from "./nameMatch";
import { usdaSearch, scaleToGrams } from "./usda";
import { searchFood as offSearch } from "./openfoodfacts";
import { searchFood as spoonSearch, isConfigured as spoonConfigured } from "./spoonacular";

export { nameMatch, MATCH_FLOOR };

export type Source = "openfoodfacts" | "usda" | "spoonacular";

export interface Evidence {
  source: Source;
  label: string;
  per100g: Record<string, number>;
  /** 0..1 - base reliability of the source. */
  trust: number;
  /** 0..1 - how well the returned food matches what the model identified. */
  match: number;
}

/**
 * Multi-source consensus.
 *
 * The vision model is good at *what* is on the plate and bad at exact gram
 * weights. The food databases are the reverse: authoritative per-100g values,
 * but they need a name to look up and cannot see the portion. So the strategy
 * is: let the model propose the identity, then price that identity against
 * every database that recognises it, and average the ones that agree.
 *
 * Averaging (rather than first-source-wins) matters because it damps the
 * run-to-run spread the model has on gram weights.
 */

const TRUST: Record<Source, number> = {
  spoonacular: 0.95,
  usda: 0.9,
  openfoodfacts: 0.7,
};

/* ---------------------------------------------------------------------------
 * Gathering evidence
 *
 * Name disambiguation lives in ./nameMatch - see the comment there for why
 * blindly taking a database's first result is wrong (it is how plain cooked
 * rice came back as 97 kcal instead of ~130). This function fans out to every
 * configured source in parallel, name-checks each result, and drops anything
 * that is not actually the food the vision model identified.
 * ------------------------------------------------------------------------ */
async function gather(term: string): Promise<Evidence[]> {
  const out: Evidence[] = [];

  const [off, spoon, usda] = await Promise.all([
    offSearch(term).catch(() => []),
    spoonConfigured() ? spoonSearch(term).catch(() => []) : Promise.resolve([]),
    usdaSearch(term).catch(() => null),
  ]);

  const offBest = pickBest(
    term,
    off.map((h) => ({ label: h.name, per100g: h.per100g })),
  );
  if (offBest) out.push({ source: "openfoodfacts", ...offBest, trust: TRUST.openfoodfacts });

  if (spoon.length) {
    const spBest = pickBest(
      term,
      spoon.map((h) => ({ label: h.name, per100g: h.per100g })),
    );
    if (spBest) out.push({ source: "spoonacular", ...spBest, trust: TRUST.spoonacular });
  }

  if (usda && usda.per100g && Object.keys(usda.per100g).length) {
    const score = nameMatch(term, usda.description);
    if (score >= MATCH_FLOOR) {
      out.push({
        source: "usda",
        label: usda.description,
        per100g: usda.per100g,
        trust: TRUST.usda,
        match: score,
      });
    }
  }

  return out;
}

/** Choose the candidate that best matches the identified name, not the first. */
function pickBest(
  modelName: string,
  candidates: { label: string; per100g: Record<string, number> }[],
): { label: string; per100g: Record<string, number>; match: number } | null {
  let best: { label: string; per100g: Record<string, number>; match: number } | null = null;
  for (const c of candidates) {
    const m = nameMatch(modelName, c.label);
    if (m >= MATCH_FLOOR && (!best || m > best.match)) {
      best = { label: c.label, per100g: c.per100g, match: m };
    }
  }
  return best;
}

/** True when two sources broadly agree on calories. */
function agrees(a: number, b: number, tol = 0.45) {
  if (a <= 0 || b <= 0) return false;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi - lo) / hi <= tol;
}

export interface Consensus {
  ingredient: Ingredient;
  sources: Source[];
  /** Sources whose calorie values were mutually consistent. */
  agreement: "strong" | "partial" | "single";
  micros?: Micros;
}

/**
 * Resolve one ingredient against the databases and return a consensus estimate.
 * Falls back to the model's own numbers when no source recognises the item.
 */
export async function resolveIngredient(
  modelRow: Ingredient,
): Promise<Consensus> {
  const evidence = await gather(modelRow.name.trim());
  if (evidence.length === 0) {
    return {
      ingredient: modelRow,
      sources: [],
      agreement: "single",
    };
  }

  // Nutrition databases quote per-100 g against EDIBLE weight, so a bone-in
  // piece must be scaled by the meat, not by the piece. This is the single most
  // consequential use of edibleWeight: it is what stops a 250 g leg quarter
  // being priced as 250 g of meat.
  const grams = edibleWeight(modelRow) || 100;

  // Group the sources into calorie-consistent clusters and keep the heaviest
  // one, so one wildly wrong source cannot drag the estimate.
  const per100Cals = evidence.map((e) => e.per100g.calories ?? 0);
  let best: Evidence[] = [evidence[0]];
  for (const e of evidence) {
    if (agrees(e.per100g.calories ?? 0, best[0].per100g.calories ?? 0)) {
      best.push(e);
    }
  }
  // Trust is base reliability multiplied by how well the returned food actually
  // matched what the model identified. A perfect name match from Open Food
  // Facts can still be worth less than a decent match from USDA, because OFF is
  // crowd-entered and its rows are more often wrong.
  const weight = (e: Evidence) => e.trust * (0.35 + 0.65 * e.match);

  const totalTrust = best.reduce((a, e) => a + weight(e), 0) || 1;

  const merged: Record<string, number> = {};
  for (const key of new Set(best.flatMap((e) => Object.keys(e.per100g)))) {
    let acc = 0;
    let used = 0;
    for (const e of best) {
      const v = e.per100g[key];
      if (typeof v !== "number" || v <= 0) continue;

      // Per-macro credibility gate. For the energy macros, a value below ~1.5%
      // of that source's own calories is a stub row rather than a real zero, so
      // it is excluded from the average. Vitamins/minerals have no such bound
      // (a food can genuinely have ~0 iron) and are always taken.
      if (key === "calories" || key === "protein_g" || key === "carbs_g" || key === "fat_g") {
        const cals = e.per100g.calories ?? 0;
        if (cals > 0 && key !== "calories" && v < cals * 0.015) continue;
      }

      acc += (v * weight(e)) / totalTrust;
      used++;
    }
    // Only publish an averaged macro if at least one source actually had it.
    if (acc > 0 && used > 0) merged[key] = acc;
  }

  const scaled = scaleToGrams(merged, grams);

  const micros: Micros = {
    "Vitamin A": scaled["Vitamin A"] ?? 0,
    "Vitamin C": scaled["Vitamin C"] ?? 0,
    "Vitamin D": scaled["Vitamin D"] ?? 0,
    Calcium: scaled["Calcium"] ?? 0,
    Iron: scaled["Iron"] ?? 0,
    Potassium: scaled["Potassium"] ?? 0,
    Zinc: scaled["Zinc"] ?? 0,
  };
  const hasMicros = Object.values(micros).some((v) => v > 0);

  const row: Ingredient = {
    ...modelRow,
    calories: Math.round(scaled.calories ?? modelRow.calories),
    protein_g: Math.round((scaled.protein_g ?? modelRow.protein_g) * 10) / 10,
    carbs_g: Math.round((scaled.carbs_g ?? modelRow.carbs_g) * 10) / 10,
    fat_g: Math.round((scaled.fat_g ?? modelRow.fat_g) * 10) / 10,
  };

  return {
    ingredient: row,
    sources: best.map((e) => e.source),
    agreement: best.length >= 2 ? (best.length >= 3 ? "strong" : "partial") : "single",
    micros: hasMicros ? micros : undefined,
  };
}

/** Resolve the whole list and fold measured micros back into the meal. */
export async function resolveMeal(
  meal: ParsedMeal,
): Promise<{ meal: ParsedMeal; matched: number; strong: number }> {
  const results = await Promise.all(meal.ingredients.map((i) => resolveIngredient(i)));

  const ingredients = results.map((r) => r.ingredient);
  const micros: Record<string, number> = { ...(meal.micros ?? {}) };

  for (const r of results) {
    if (!r.micros) continue;
    for (const [k, v] of Object.entries(r.micros)) {
      if (v > 0) micros[k] = (micros[k] ?? 0) + v;
    }
  }

  const matched = results.filter((r) => r.sources.length > 0).length;
  const strong = results.filter((r) => r.agreement === "strong").length;

  return {
    meal: {
      ...meal,
      ingredients,
      micros: Object.fromEntries(
        Object.entries(micros).filter(([, v]) => v > 0),
      ) as Micros,
    },
    matched,
    strong,
  };
}
