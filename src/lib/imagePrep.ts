import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/**
 * Client-side image preparation for the vision model.
 *
 * A modern phone camera produces a 12 MP frame. Shipping one of those to Gemini
 * costs a multi-megabyte upload and a proportionally slower inference, and buys
 * nothing: the prompt asks the model to size the food against a coin, a card or
 * a thumb, all of which stay legible at 1280 px. Gemini tiles at 768 px
 * internally, so everything above that is paid for and then discarded.
 *
 * This runs at CAPTURE time rather than at upload time, so the image held in
 * memory, the base64 we build, the cache key, and the payload on the wire are
 * all the same small image. Nothing is ever encoded twice.
 */

/** Longest edge, in pixels, of the image we send to the model. */
export const MAX_EDGE = 1280;

/**
 * JPEG quality for the prepared frame. 0.82 keeps visible detail in a textured
 * food surface (which is what the model reads for portion) while cutting the
 * payload to roughly a fifth of the camera's own encode.
 */
const COMPRESS = 0.82;

export interface Shot {
  base64: string;
  mimeType: string;
  /** Local file URI. Kept so the review screen can show the photo it will send. */
  uri: string;
  width: number;
  height: number;
}

export interface RawShot {
  uri: string;
  base64?: string | null;
  width?: number | null;
  height?: number | null;
  mimeType?: string | null;
}

/**
 * How far past MAX_EDGE an output may land before we assume the resize was
 * applied to the wrong axis. One render step rounds, so a little slack is
 * expected; a large overshoot means the portrait/landscape guess was wrong.
 */
const AXIS_TOLERANCE = 1.15;

/**
 * Normalise a captured frame: downscale to MAX_EDGE on the long side and
 * re-encode as JPEG.
 *
 * The axis is chosen from the source dimensions, but that guess is verified
 * against the rendered result rather than trusted. expo-camera reports
 * dimensions from EXIF, and whether the pixel data behind those dimensions is
 * already upright depends on the capture path; ImageManipulator does not apply
 * EXIF orientation itself, so a wrong guess would silently ship a sideways
 * photo. Rendering is cheap at this size, so a second attempt costs far less
 * than a rotated meal.
 *
 * Never throws. A failure here degrades to the original bytes rather than
 * failing the scan, because an un-downscaled photo is slow but still correct.
 */
export async function prepareShot(src: RawShot): Promise<Shot> {
  const width = src.width ?? 0;
  const height = src.height ?? 0;

  // Portrait frames are resized by height so the long side is what gets capped.
  const byHeight: { width?: number; height?: number } = { height: MAX_EDGE };
  const byWidth: { width?: number; height?: number } = { width: MAX_EDGE };
  const axes = height >= width ? [byHeight, byWidth] : [byWidth, byHeight];

  for (const axis of axes) {
    try {
      const ref = await ImageManipulator.manipulate(src.uri).resize(axis).renderAsync();
      if (Math.max(ref.width, ref.height) > MAX_EDGE * AXIS_TOLERANCE) {
        continue;
      }
      const out = await ref.saveAsync({
        base64: true,
        compress: COMPRESS,
        format: SaveFormat.JPEG,
      });
      if (out.base64) {
        return {
          base64: out.base64,
          mimeType: "image/jpeg",
          uri: out.uri,
          width: out.width,
          height: out.height,
        };
      }
    } catch {
      // fall through and try the other axis, then the untouched capture
    }
  }

  return {
    base64: src.base64 ?? "",
    mimeType: src.mimeType ?? "image/jpeg",
    uri: src.uri,
    width,
    height,
  };
}

/* ---------------------------------------------------------------------------
 * Capture resolution
 *
 * The capture size is the single biggest lever on scan latency, because it
 * decides how long the phone spends encoding the JPEG before we even start
 * downscaling it. Asking the camera for ~1.3 MP instead of its default 12 MP
 * turns a slow full-resolution encode into a cheap one, and costs no accuracy
 * at the resolution the model actually reads.
 *
 * The ranking itself lives in ./pictureSize so it can be tested without a
 * device.
 * ------------------------------------------------------------------------ */

export { pickPictureSize } from "./pictureSize";
