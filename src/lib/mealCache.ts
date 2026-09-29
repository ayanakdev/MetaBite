import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ParsedMeal } from "./types";

/**
 * Local result cache.
 *
 * The Gemini free tier allows only ~20 requests per model per DAY, so a
 * re-scan of the same plate must not cost another request. Users retry
 * constantly - same photo after a rate limit, or the identical dish on purpose
 * to check the numbers - and every one of those used to burn quota.
 *
 * Keyed on the image bytes plus the prompt-affecting settings, so a genuinely
 * different photo is always a fresh call.
 */

const STORE_KEY = "metabite.meal.cache.v1";
const MAX_ENTRIES = 25;

interface Entry {
  key: string;
  at: number;
  meal: ParsedMeal;
}

/** FNV-1a: fast, dependency-free, and good enough to key on image bytes. */
function hash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export function cacheKey(opts: {
  top: string;
  side?: string | null;
  quickSpecs?: string;
  model?: string;
}) {
  return hash(
    [
      opts.top,
      opts.side ?? "",
      (opts.quickSpecs ?? "").trim().toLowerCase(),
      opts.model ?? "",
    ].join("|"),
  );
}

async function readAll(): Promise<Entry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getCached(key: string): Promise<ParsedMeal | null> {
  const all = await readAll();
  const hit = all.find((e) => e.key === key);
  return hit?.meal ?? null;
}

export async function putCached(key: string, meal: ParsedMeal) {
  try {
    const all = await readAll();
    const next: Entry[] = [{ key, at: Date.now(), meal }, ...all.filter((e) => e.key !== key)];
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(next.slice(0, MAX_ENTRIES)));
  } catch {
    // caching is best-effort; never fail a scan because of it
  }
}

export async function clearCache() {
  try {
    await AsyncStorage.removeItem(STORE_KEY);
  } catch {
    // ignore
  }
}
