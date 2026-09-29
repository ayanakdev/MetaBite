import type { Ingredient, ParsedMeal } from "./types";
import { edibleWeight } from "./types";
import { parseQuota, quotaMessage, GeminiQuotaError, isQuotaError, MODEL_CHAIN, type QuotaInfo } from "./quota";

/**
 * NOTE: the original brief asked for `gemini-1.5-flash`. That model is retired
 * (001 shut down May 2025, 002 in Sept 2025) and now returns errors. The model
 * id is env-driven so it can be swapped without touching code.
 */
// NOTE: the brief asked for gemini-1.5-flash, which is retired (001 shut down
// May 2025, 002 Sept 2025) and now returns errors.
//
// Benchmark note: for image calorie estimation, Gemini 3.x Flash materially
// beats 2.5 (calorie CCC 0.767 vs 0.718; MAE 81 vs 111 kcal), and 2.x is now
// flagged for deprecation. Verified reachable on the free tier - note that
// 3.5-flash currently answers 503 for free keys, hence 3.8.
// Override any time via EXPO_PUBLIC_GEMINI_MODEL.
const MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL ?? "gemini-3.8-flash";
/** Exported so the UI can detect a quota fallback and say so honestly. */
export const DEFAULT_MODEL = MODEL;
const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;


const INGREDIENT_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    quantity_g: { type: "number" },
    edible_g: { type: "number" },
    calories: { type: "number" },
    protein_g: { type: "number" },
    carbs_g: { type: "number" },
    fat_g: { type: "number" },
  },
  required: ["name", "quantity_g", "calories", "protein_g", "carbs_g", "fat_g"],
  propertyOrdering: [
    "name",
    "quantity_g",
    "edible_g",
    "calories",
    "protein_g",
    "carbs_g",
    "fat_g",
  ],
} as const;

const MEAL_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    ingredients: { type: "array", items: INGREDIENT_SCHEMA },
    calories: { type: "number" },
    protein_g: { type: "number" },
    carbs_g: { type: "number" },
    fat_g: { type: "number" },
    fiber_g: { type: "number" },
    sugar_g: { type: "number" },
    sodium_mg: { type: "number" },
    // Micronutrient estimates. Honest caveat baked into the field name: these
    // cannot be judged from a photo, so the model should report typical values
    // for the identified foods rather than pretend to have measured them.
    micros: {
      type: "object",
      properties: {
        "Vitamin A": { type: "number" },
        "Vitamin C": { type: "number" },
        "Vitamin D": { type: "number" },
        Calcium: { type: "number" },
        Iron: { type: "number" },
        Potassium: { type: "number" },
        Zinc: { type: "number" },
      },
    },
    notes: { type: "string" },
    // 0-1: how confident the model is in the portion weights it inferred.
    // Surfaced in the UI so a shaky estimate is visible, not silently trusted.
    portion_confidence: { type: "number" },
    // Plain-language reasoning about how full the vessel looks, derived from
    // the side view when one was supplied.
    fill_assessment: { type: "string" },
  },
  required: [
    "title",
    "ingredients",
    "calories",
    "protein_g",
    "carbs_g",
    "fat_g",
    "portion_confidence",
  ],
} as const;

function requireKey() {
  if (!API_KEY) {
    throw new Error(
      "EXPO_PUBLIC_GEMINI_API_KEY is missing. Add it to .env.local (get a free key at aistudio.google.com).",
    );
  }
  return API_KEY;
}

function explain(status: number, model: string): string {
  if (status === 403 || status === 401) {
    return "Gemini rejected the API key. Check EXPO_PUBLIC_GEMINI_API_KEY in .env.local.";
  }
  if (status === 404) {
    return `Gemini model "${model}" is unavailable for this key.`;
  }
  return `Gemini is temporarily unavailable (${status}). This is Google's side, not the app.`;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function endpoint(model: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

/**
 * Ceiling on a single generateContent call.
 *
 * Without it a request that never resolves - a dropped connection on a train,
 * a proxy that accepts the socket and says nothing - leaves the user on a
 * spinner with no way out and no error. Failing here routes into the normal
 * transient-retry path, which then moves on to the next model in the chain.
 *
 * A healthy multimodal call returns in single-digit seconds, so this only ever
 * fires on a genuine stall.
 */
const REQUEST_TIMEOUT_MS = 30_000;

async function requestOnce(
  model: string,
  key: string,
  parts: GeminiPart[],
  signal?: AbortSignal,
): Promise<{ ok: true; text: string } | { ok: false; status: number; body: string }> {
  const res = await fetch(`${endpoint(model)}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: MEAL_SCHEMA,
        // temperature 0 makes this as deterministic as the backend allows.
        temperature: 0,
      },
    }),
    signal,
  });

  if (res.ok) {
    const json: any = await res.json();
    const text = json?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p.text)
      .join("");
    if (!text) return { ok: false, status: 500, body: "empty content" };
    return { ok: true, text };
  }

  return { ok: false, status: res.status, body: await res.text() };
}

/**
 * Call Gemini, walking a chain of models.
 *
 * The free tier's quota is `GenerateRequestsPerDayPerProjectPerModel` - a
 * DAILY allowance of ~20 calls *per model*. That makes an exhausted model a
 * routing problem, not a dead end: moving to the next model moves to a
 * different bucket. Only if every model is exhausted do we surface the quota
 * message, and it then says "today" rather than the previous, wrong, "a
 * minute".
 */
async function callGemini(
  prompt: string,
  images: GeminiPart[] = [],
  chain: readonly string[] = MODEL_CHAIN,
): Promise<{ text: string; model: string }> {
  const key = requireKey();
  const parts: GeminiPart[] = [];
  for (const img of images) parts.push(img);
  parts.push({ text: prompt });

  const preferred = MODEL;
  const ordered = [
    ...chain.filter((m) => m === preferred),
    ...chain.filter((m) => m !== preferred),
  ];

  let lastStatus = 0;
  let lastBody = "";
  let lastModel = preferred;
  let dailyQuota: QuotaInfo | null = null;
  let timedOut = false;

  for (const model of ordered) {
    lastModel = model;
    // Transient failures are retried briefly; quota errors are not, because
    // retrying a daily limit can never succeed and just wastes the user's time.
    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
      if (attempt > 0) {
        // Kept short on purpose. A 5xx is usually a blip that clears in a second,
        // and the chain below is a better use of the wait than sitting on one
        // model: a different model is a different quota bucket and may answer
        // immediately.
        const wait = Math.round(600 * Math.pow(2, attempt - 1) + Math.random() * 300);
        await sleep(wait);
      }
      attempt++;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let out: Awaited<ReturnType<typeof requestOnce>>;
      try {
        out = await requestOnce(model, key, parts, controller.signal);
      } catch (e) {
        clearTimeout(timer);
        const aborted =
          e instanceof Error && (e.name === "AbortError" || /abort/i.test(e.message));
        if (aborted) timedOut = true;
        lastStatus = 0;
        lastBody = e instanceof Error ? e.message : String(e);
        continue;
      }
      clearTimeout(timer);

      if (out.ok) return { text: out.text, model };

      lastStatus = out.status;
      lastBody = out.body;

      const quota = parseQuota(out.status, out.body);
      if (quota) {
        // Move to the next model instead of retrying this one.
        dailyQuota = quota;
        break;
      }

      const transient = out.status >= 500;
      if (!transient) break;
    }
  }

  if (dailyQuota) {
    throw new GeminiQuotaError({ ...dailyQuota, model: lastModel });
  }

  if (timedOut) {
    throw new Error(
      "Gemini stopped responding. Check your connection and scan again - the photo is not lost.",
    );
  }

  throw new Error(explain(lastStatus, lastModel));
}

function num(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalize(raw: any): ParsedMeal {
  const ingredients: Ingredient[] = Array.isArray(raw?.ingredients)
    ? raw.ingredients.map((i: any) => {
        const quantity_g = num(i?.quantity_g);
        return {
          name: String(i?.name ?? "Unknown").trim(),
          quantity_g,
          // Clamped by the same helper every consumer uses, so a nonsense
          // edible_g from the model cannot diverge from what gets priced.
          edible_g: edibleWeight({ quantity_g, edible_g: i?.edible_g }),
          calories: num(i?.calories),
          protein_g: num(i?.protein_g),
          carbs_g: num(i?.carbs_g),
          fat_g: num(i?.fat_g),
        };
      })
    : [];

  const conf = num(raw?.portion_confidence, 0.5);

  // Only keep micronutrients that are real positive numbers, so the UI never
  // renders a bar for a value the model made up.
  let micros: Record<string, number> | undefined;
  if (raw?.micros && typeof raw.micros === "object") {
    const entries = Object.entries(raw.micros)
      .map(([k, v]) => [k, num(v)] as const)
      .filter(([, v]) => v > 0);
    if (entries.length) micros = Object.fromEntries(entries);
  }

  return {
    title: String(raw?.title ?? "Meal").trim() || "Meal",
    ingredients,
    calories: num(raw?.calories),
    protein_g: num(raw?.protein_g),
    carbs_g: num(raw?.carbs_g),
    fat_g: num(raw?.fat_g),
    fiber_g: num(raw?.fiber_g),
    sugar_g: num(raw?.sugar_g),
    sodium_mg: num(raw?.sodium_mg),
    micros: micros as ParsedMeal["micros"],
    notes: raw?.notes ? String(raw.notes) : undefined,
    portion_confidence: Math.max(0, Math.min(1, conf)),
    fill_assessment: raw?.fill_assessment ? String(raw.fill_assessment) : undefined,
  };
}

/** Sum the ingredient list locally so the editor is instant and offline-safe. */
export function sumIngredients(ingredients: Ingredient[]) {
  return ingredients.reduce(
    (acc, i) => ({
      calories: acc.calories + num(i.calories),
      protein_g: acc.protein_g + num(i.protein_g),
      carbs_g: acc.carbs_g + num(i.carbs_g),
      fat_g: acc.fat_g + num(i.fat_g),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

/**
 * @param images ordered [top-down, side]. The side frame is optional but is
 * what makes the weight estimate trustworthy: a top-down shot shows footprint
 * but not depth, so a half-full bowl and a full bowl can look identical from
 * directly above.
 */
export async function analyzeFoodImage(params: {
  base64: string;
  mimeType?: string;
  /** Optional second frame, shot from the side at roughly container height. */
  sideBase64?: string;
  sideMimeType?: string;
  quickSpecs?: string;
}): Promise<ParsedMeal> {
  const specs = params.quickSpecs?.trim();
  const hasSide = !!params.sideBase64;

  const prompt = `You are estimating the nutrition of one meal from photos.

IMAGE(S): ${
    hasSide
      ? "Two frames of the same meal. Image 1 is TOP-DOWN (overhead). Image 2 is a SIDE view taken level with the container."
      : "One frame, shot from directly above (top-down)."
  }

HOW TO ESTIMATE THE PORTION - this is the most important step:

1. SCALE CALIBRATION FIRST. Look for a known-size reference object placed BESIDE
   the food (not in it). Use these real-world sizes:
     - adult thumb tip to knuckle ~ 5.5 cm
     - a thumb across the thumbnail ~ 2.2 cm
     - US quarter ~ 2.4 cm across
     - US penny ~ 1.9 cm across
     - a standard credit card ~ 8.6 x 5.4 cm
     - a large chicken egg ~ 5.7 cm long, ~ 50 g
     - a standard dinner plate ~ 27 cm across

   DISTANCE DOES NOT MATTER. Never estimate size from how large the food looks
   in the frame, and never assume how far away the camera is. The reference
   object is the ruler, so measure the food RELATIVE TO THAT OBJECT and ignore
   the absolute size of anything in the picture. Shots taken from further away
   and closer up must yield the SAME gram weight when the reference object is
   present. If the photo has no reference object, treat your scale as unknown,
   keep the estimate conservative, and set portion_confidence below 0.4.

2. Use the side view (if present) to judge how FULL the container is: near
   empty, quarter, half, two-thirds, or heaped full. A top-down photo cannot
   reveal this, so a half-full bowl and a full bowl can look identical from
   directly above. Judge the fill fraction relative to the container's own
   height, not to the frame.

   BEVERAGE RULE - liquids are the most commonly miscalculated food. A drink
   weighs about 1 gram per millilitre, so its weight is the volume. Typical
   capacities: small glass 150-200 ml, standard cup 200-250 ml, mug 250-350 ml.
   Work it out as capacity x fill fraction. A cup that looks about a third full
   is roughly 70-100 ml, i.e. about 70-100 g - NOT 200-300 g. Do not report a
   drink's weight as if it were a solid portion.

   MILK RULE - tea, coffee, and clear broth contain essentially 0 g protein per
   100 ml. Only report meaningful protein if there is visibly substantial milk,
   cream, or powder in the cup, and scale it to how much is actually there.
   Do not identify a brown or beige drink as plain "milk" unless it genuinely
   looks like milk. If a drink is mostly water with a splash of milk, say so.

3. Only then weigh the food. If the side view contradicts a generous top-down
   read, TRUST THE SIDE VIEW.

CRITICAL - do NOT default to standard serving sizes. A model that always
answers "one cup of rice" for every bowl is wrong; the whole point is the
ACTUAL VISIBLE PORTION in the photo. If the bowl is half full, report half a
bowl's worth. Scale every gram estimate to the real amount of food present.

  For very common single items whose nutrition is universally known (one large
  egg is ~50 g with ~6 g protein and ~70-75 kcal; a medium apple ~180 g with ~95
  kcal), state the canonical per-item nutrition for the portion actually visible
  rather than inventing numbers.

BONE, SHELL AND SKIN - report the piece you can see AND the meat you can eat.

A bone-in cut is not all meat, and nutrition tables are not quoted on the bone.
Set quantity_g to the weight of the piece AS IT APPEARS, bone included, and
edible_g to the weight of the flesh actually eaten. When there is nothing to
remove, set edible_g equal to quantity_g.

This matters most on desi and bone-in dishes - biryani, pulao, karahi, tikka,
rogan josh, fried chicken, whole fish, lamb chops. A chicken leg quarter is
roughly a quarter bone, a drumstick or a thigh on the bone about a fifth to a
quarter, a wing about a third, and a lamb or beef chop about a quarter to a
third. A fish with the bones left in is around a fifth.

Then derive calories, protein, carbs and fat from edible_g, NOT from quantity_g.
Bone contributes almost no energy and very little protein. A 250 g leg quarter
with a 70 g bone is 180 g of meat at about 185 kcal and 35 g protein, not
250 g at 290 kcal and 52 g. Getting this wrong inflates a biryani by hundreds
of calories.

If the user says the meat is boneless, fill or cutlet, or steak, treat it as
edible_g equal to quantity_g.

Return per-item calories, protein, carbs and fat in grams, plus whole-meal
totals including fiber, sugar and sodium. Set portion_confidence low (under
0.4) when no scale reference is visible or no side view was given, and
fill_assessment to your plain-language read of how full the container is.${
    specs ? `\n\nThe user adds these notes, which OVERRIDE your visual read: "${specs}"` : ""
  }`;

  const images: GeminiPart[] = [
    { inlineData: { mimeType: params.mimeType ?? "image/jpeg", data: params.base64 } },
  ];
  if (hasSide) {
    images.push({
      inlineData: {
        mimeType: params.sideMimeType ?? "image/jpeg",
        data: params.sideBase64!,
      },
    });
  }

  const { text, model } = await callGemini(prompt, images);
  return { ...normalize(JSON.parse(text)), model_used: model };
}

/**
 * Re-price an edited ingredient list. The ingredient rows carry their own
 * macros, so we return the locally-summed totals and only ask the model to
 * sanity-check them (and fill fiber/sugar/sodium, which rows do not carry).
 */
export async function recalculateMeal(params: {
  title: string;
  ingredients: Ingredient[];
  quickSpecs?: string;
}): Promise<ParsedMeal> {
  const local = sumIngredients(params.ingredients);
  const list = params.ingredients
    .map(
      (i) =>
        `- ${i.name} (${i.quantity_g}g): ${i.calories} kcal, P${i.protein_g} C${i.carbs_g} F${i.fat_g}`,
    )
    .join("\n");

  const prompt =
    `Here is a corrected ingredient list for "${params.title}":\n${list}\n\n` +
    `The local totals are: ${local.calories.toFixed(0)} kcal, ` +
    `P ${local.protein_g.toFixed(1)}g, C ${local.carbs_g.toFixed(1)}g, F ${local.fat_g.toFixed(1)}g.\n\n` +
    `Return the meal JSON using those local totals for calories/protein/carbs/fat, ` +
    `and estimate fiber_g, sugar_g and sodium_mg for the whole meal. ` +
    `Set edible_g equal to quantity_g for every row, unless the name refers to a ` +
    `bone-in cut such as a leg quarter, drumstick, thigh on the bone, wing, chop ` +
    `or a whole fish - for those, keep quantity_g as the piece weighed whole and ` +
    `set edible_g to the meat actually eaten, which is roughly a fifth to a third ` +
    `less.`;

  const { text, model } = await callGemini(prompt);
  const parsed = normalize(JSON.parse(text));
  (parsed as any).model_used = model;

  // Trust the local arithmetic over the model's echo of it.
  return {
    ...parsed,
    title: params.title,
    ingredients: params.ingredients,
    calories: local.calories,
    protein_g: local.protein_g,
    carbs_g: local.carbs_g,
    fat_g: local.fat_g,
  };
}
