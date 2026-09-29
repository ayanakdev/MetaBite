export type MealSource = "gemini" | "usda" | "openfoodfacts" | "manual";

export interface Ingredient {
  name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
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
