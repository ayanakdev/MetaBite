/**
 * Capture-size selection.
 *
 * Kept free of any native import so the ranking can be exercised with plain
 * node, independently of the device. The reasoning for why this is worth getting
 * right lives next to MAX_EDGE in ./imagePrep.
 */

const TARGET_LONG_EDGE = 1280;
const MIN_LONG_EDGE = 1024;
const MAX_LONG_EDGE = 2048;

/**
 * 4:3 is the shape of the sensor and the shape of a plate. Choosing a 16:9
 * capture instead would crop the top and bottom off a portrait photo of a round
 * dish, so aspect ratio is weighted far more heavily than the exact pixel count.
 */
const IDEAL_ASPECT = 4 / 3;
const ASPECT_WEIGHT = 2000;

interface Size {
  raw: string;
  score: number;
}

/**
 * Pick the best available capture size, or undefined to let the camera decide.
 *
 * Ranks the usable sizes on two things, in order: how close the frame is to 4:3,
 * then how close its long edge is to TARGET_LONG_EDGE. A size is only considered
 * if its long edge is between MIN and MAX - too small and the reference object
 * stops being legible, too large and we are paying the encode cost of pixels the
 * model will never look at.
 *
 * Returns undefined for a missing, empty or wholly unparseable list so the
 * camera keeps whatever default it would otherwise have used.
 */
export function pickPictureSize(
  sizes: readonly string[] | null | undefined,
): string | undefined {
  if (!sizes || sizes.length === 0) return undefined;

  const parsed: Size[] = [];
  for (const entry of sizes) {
    const m = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(entry.trim());
    if (!m) continue;
    const width = Number(m[1]);
    const height = Number(m[2]);
    if (!width || !height) continue;

    const longEdge = Math.max(width, height);
    if (longEdge < MIN_LONG_EDGE || longEdge > MAX_LONG_EDGE) continue;

    const aspect = longEdge / Math.min(width, height);
    const aspectDistance = Math.abs(Math.log(aspect / IDEAL_ASPECT));
    const edgeDistance = Math.abs(longEdge - TARGET_LONG_EDGE);

    parsed.push({
      raw: entry.trim(),
      score: aspectDistance * ASPECT_WEIGHT + edgeDistance,
    });
  }

  if (parsed.length === 0) return undefined;
  parsed.sort((a, b) => a.score - b.score);
  return parsed[0].raw;
}
