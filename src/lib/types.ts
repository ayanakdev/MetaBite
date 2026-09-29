export type MealSource = "gemini" | "usda" | "openfoodfacts" | "manual";

export interface Ingredient {
  name: string;
  /**
   * The weight of the portion as it appears in the photo - what a scale would
   * read if the user weighed the whole piece. For a bone-in cut this INCLUDES
   * the bone.
   */
  quantity_g: number;
  /**
   * The weight the user actually eats: the same portion with bone, cartilage,
   * shell or inedible skin removed.
   *
   * Omitted, or equal to quantity_g, when there is nothing to remove. Nutrition
   * databases quote their per-100 g figures against EDIBLE weight, so this is
   * the number every macro must be derived from. A chicken leg quarter weighing
   * 250 g with a 70 g bone is 180 g of meat - pricing the 250 g inflates protein
   * by around a third, which is the single largest source of error on a
   * bone-in dish such as biryani, pulao or karahi.
   */
  edible_g?: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/**
 * The weight nutrition figures should be derived from.
 *
 * This is the single place the deduction is clamped, and every caller goes
 * through it - the consensus pass, the manual verify button, the sanity audit
 * and both screens that display the split. Keeping the invariant here rather
 * than in one consumer means a legacy row, a hand-edited value or a bad model
 * response cannot slip past it.
 *
 * Anything not a plausible deduction is treated as "nothing to remove": a value
 * above the gross weight, a zero or negative, a non-number, or an absurd 95%
 * inedible. Silently under-reporting a plate is worse than over-reporting it
 * slightly, and the alternative failure - a row of bone with no meat - would
 * zero out every macro.
 */
export function edibleWeight(row: {
  quantity_g: number;
  edible_g?: number | null;
}): number {
  const gross = Number(row?.quantity_g) || 0;
  const net = Number(row?.edible_g);
  if (!Number.isFinite(net) || net <= 0) return gross;
  if (net >= gross) return gross;
  if (net < gross * 0.05) return gross;
  return net;
}

/**
 * True when enough was deducted to be worth telling the user about.
 *
 * The half-gram floor keeps a rounding artefact from rendering a "bone deducted"
 * note on a boneless portion.
 */
export function hasBone(row: { quantity_g: number; edible_g?: number | null }): boolean {
  return edibleWeight(row) < (Number(row?.quantity_g) || 0) - 0.5;
}

export interface LoggedMeal {
  id: string;
  user_id: string;
  eaten_on: string;
  logged_at: string;
  title: string;
  source: MealSource;
  photo_path: string | null;
  ingredients: Ingredient[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  /** Vitamin/mineral values, keyed by display label. */
  micros?: Micros;
  ai_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  nickname: string;
  avatar_key: string;
  daily_calorie_goal: number;
  daily_protein_goal: number;
  daily_carb_goal: number;
  daily_fat_goal: number;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyTotals {
  eaten_on: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  meal_count: number;
}

/**
 * Vitamin/mineral estimates keyed by display label. These are inherently
 * low-confidence from a photo - see the note in the review screen - so they are
 * stored as a loose map, not one column per nutrient.
 */
export type Micros = Record<
  | "Vitamin A"
  | "Vitamin C"
  | "Vitamin D"
  | "Calcium"
  | "Iron"
  | "Potassium"
  | "Zinc",
  number
>;

export interface ParsedMeal {
  title: string;
  ingredients: Ingredient[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  micros?: Micros;
  notes?: string;
  /** Model's own confidence in the portion weights it inferred, 0..1. */
  portion_confidence?: number;
  /** Which Gemini model actually answered, after any quota fallback. */
  model_used?: string;
  /** Plain-language read of how full the container looked, e.g. "about half full". */
  fill_assessment?: string;
}
