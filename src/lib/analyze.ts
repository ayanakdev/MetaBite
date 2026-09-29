import { analyzeFoodImage, DEFAULT_MODEL } from "./gemini";
import { resolveMeal } from "./consensus";
import { cacheKey, getCached, putCached } from "./mealCache";
import type { ParsedMeal } from "./types";
import type { Shot } from "./imagePrep";

/**
 * The scan pipeline, extracted from the camera screen so the screen can render a
 * real progress page instead of a spinner over a live viewfinder.
 *
 * The stages reported here are the actual boundaries in the work, not decoration:
 * `identify` is the single vision call, `crosscheck` is the parallel database fan
 * out, and `finalise` is the local fold. The screen uses these to advance its
 * copy, and separately holds a slow auto-advance so a fast result never flickers
 * through four captions in half a second.
 */

export type AnalysisStage = "identify" | "crosscheck" | "finalise";

export interface AnalysisOutcome {
  meal: ParsedMeal;
  /** True when the result came from the local cache and cost no API call. */
  fromCache: boolean;
}

export async function runAnalysis(params: {
  top: Shot;
  side: Shot | null;
  quickSpecs: string;
  onStage: (stage: AnalysisStage) => void;
}): Promise<AnalysisOutcome> {
  const { top, side, quickSpecs, onStage } = params;

  // The cache exists because the free Gemini tier allows only ~20 calls per model
  // per day. Users re-scan the same plate constantly - after a rate limit, or to
  // check the numbers - and every one of those used to burn quota.
  const key = cacheKey({
    top: top.base64,
    side: side?.base64 ?? null,
    quickSpecs,
  });

  const cached = await getCached(key);
  if (cached) {
    onStage("finalise");
    return {
      fromCache: true,
      meal: {
        ...cached,
        notes: `${
          cached.notes ? `${cached.notes} ` : ""
        }Reused from a previous scan of this photo to save your free daily allowance.`,
      },
    };
  }

  onStage("identify");

  const parsed = await analyzeFoodImage({
    base64: top.base64,
    mimeType: top.mimeType,
    sideBase64: side?.base64,
    sideMimeType: side?.mimeType,
    quickSpecs,
  });

  onStage("crosscheck");

  // The vision model decides WHAT is on the plate; the databases price it.
  // Running the consensus here means the user always sees the best available
  // number rather than the raw model guess, and the sanity audit downstream can
  // still catch a physically impossible result.
  const { meal, matched, strong } = await resolveMeal(parsed);

  onStage("finalise");

  const result: ParsedMeal = {
    ...meal,
    notes: [
      parsed.notes,
      matched > 0
        ? `${matched}/${parsed.ingredients.length} items matched a food database` +
          (strong > 0 ? `, ${strong} corroborated by 2+ sources.` : ".")
        : "No database match; model estimate only.",
      parsed.model_used && parsed.model_used !== DEFAULT_MODEL
        ? `Daily Gemini quota was reached, so ${parsed.model_used} answered instead.`
        : null,
    ]
      .filter(Boolean)
      .join(" "),
  };

  await putCached(key, result);

  return { meal: result, fromCache: false };
}
