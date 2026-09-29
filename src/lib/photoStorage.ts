import { supabase } from "./supabase";

/**
 * Meal photo storage.
 *
 * Photos live in a PRIVATE Supabase Storage bucket scoped to the owner's user id
 * by path prefix, so reads go through the authenticated API rather than a
 * guessable public URL. A food diary should not be world-readable.
 *
 * Every object is written as "<user_id>/<uuid>.jpg" and the bucket's RLS
 * policies key off that first path segment, so a client cannot write into
 * someone else's folder even by guessing a name.
 */

const BUCKET = "meal-photos";

/** Long enough to cover a browse session without leaking a long-lived URL. */
const SIGNED_URL_TTL_S = 60 * 60;

/**
 * Signed URLs are cached for most of their lifetime. A list of meals would
 * otherwise re-sign every thumbnail on every re-render, and signing is a network
 * round trip each time.
 */
const urlCache = new Map<string, { url: string; expiresAt: number }>();

/** Drop a little early so a URL cannot expire mid-render. */
const CACHE_MARGIN_MS = 60_000;

const B64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Base64 -> bytes, with no dependency on a global `atob`.
 *
 * `atob` type-checks because the DOM lib is in the TS config, but that is a type
 * guarantee and not a runtime one: React Native does not install it everywhere,
 * and Hermes has no built-in. Relying on it would have been invisible - a
 * ReferenceError here is caught, `uploadMealPhoto` returns null, and the meal
 * saves with no photo and no error anywhere. The photo is a nice-to-have, but a
 * silent failure is worse than a slow loop.
 *
 * This runs once per save on a ~300 KB frame, so a few milliseconds of plain JS
 * is a good trade for certainty.
 */
function decodeBase64(input: string): ArrayBuffer {
  // Tolerate a data-uri prefix and any line wrapping.
  const cleaned = input
    .replace(/^data:[^,]*,/, "")
    .replace(/\s+/g, "")
    .replace(/=+$/, "");

  const bytes = new Uint8Array(Math.floor((cleaned.length * 3) / 4));
  let written = 0;
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < cleaned.length; i++) {
    const value = B64_ALPHABET.indexOf(cleaned[i]);
    // Anything outside the alphabet is padding or junk; skip it rather than
    // folding a -1 into the bit buffer and corrupting every byte after it.
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[written++] = (buffer >> bits) & 0xff;
    }
  }

  return bytes.buffer;
}

/**
 * Upload one captured frame and return the storage path to record on the meal.
 *
 * Returns null rather than throwing. A missing photo is a cosmetic loss; failing
 * the save would lose the whole meal, and the numbers are what the user came for.
 */
export async function uploadMealPhoto(params: {
  userId: string;
  base64: string;
  mimeType?: string;
}): Promise<string | null> {
  const { userId, base64, mimeType = "image/jpeg" } = params;
  if (!base64) return null;

  // crypto.randomUUID is not guaranteed on every Hermes build, and a random
  // component only needs to be unique within the user's own folder.
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${userId}/${Date.now().toString(36)}-${rand}.jpg`;

  try {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, decodeBase64(base64), {
        contentType: mimeType,
        upsert: false,
        cacheControl: "3600",
      });
    if (error) return null;
    return path;
  } catch {
    return null;
  }
}

/** Cached single-path signing. */
export async function photoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const hit = urlCache.get(path);
  if (hit && hit.expiresAt - CACHE_MARGIN_MS > Date.now()) return hit.url;

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_S);
    if (error || !data?.signedUrl) return null;
    urlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_URL_TTL_S * 1000 });
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * Batch variant for lists, where signing one path at a time would be a round
 * trip per row. Cached paths are served without touching the network at all.
 */
export async function photoUrls(
  paths: readonly (string | null | undefined)[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const missing: string[] = [];

  for (const p of paths) {
    if (!p) continue;
    const hit = urlCache.get(p);
    if (hit && hit.expiresAt - CACHE_MARGIN_MS > Date.now()) out[p] = hit.url;
    else if (!missing.includes(p)) missing.push(p);
  }
  if (missing.length === 0) return out;

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(missing, SIGNED_URL_TTL_S);
    if (error || !data) return out;
    const expiresAt = Date.now() + SIGNED_URL_TTL_S * 1000;
    for (const row of data) {
      if (!row?.path || !row?.signedUrl) continue;
      out[row.path] = row.signedUrl;
      urlCache.set(row.path, { url: row.signedUrl, expiresAt });
    }
  } catch {
    // best effort - a missing thumbnail must not break the list
  }
  return out;
}
