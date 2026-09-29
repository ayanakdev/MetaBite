/**
 * Gemini free-tier quota handling.
 *
 * The 429 is misleading if taken at face value: the response says "retry in
 * 25s" but the actual quota is `GenerateRequestsPerDayPerProjectPerModel-FreeTier`
 * with a value of 20. Retrying after 25s can never succeed - the counter
 * resets at midnight Pacific, not after a minute.
 *
 * Because the bucket is per-model, a different model is a different bucket.
 * That is the only real way to get more scans out of a free tier, so an
 * exhausted model is treated as a signal to fall through to the next one.
 */

export interface QuotaInfo {
  /** True when the daily allowance is gone, as opposed to a per-minute burst. */
  daily: boolean;
  limit?: number;
  model?: string;
  retryAfterSec?: number;
}

const DAILY_MARKERS = ["perday", "per_day", "per-day"];

export function parseQuota(status: number, body: string): QuotaInfo | null {
  if (status !== 429 && status !== 403) return null;
  let json: any;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }

  const details = json?.error?.details ?? [];
  let quotaId = "";
  let quotaValue: number | undefined;
  for (const d of details) {
    if (d?.["@type"]?.includes("QuotaFailure")) {
      const v = d?.violations?.[0];
      quotaId = String(v?.quotaId ?? "");
      if (v?.quotaValue !== undefined) quotaValue = Number(v.quotaValue);
    }
  }

  const message = String(json?.error?.message ?? "");
  const daily =
    DAILY_MARKERS.some((m) => quotaId.toLowerCase().includes(m)) ||
    /per\s*day/i.test(quotaId) ||
    /quota exceeded for metric/i.test(message);

  const retryMatch = message.match(/retry in ([0-9.]+)s/i);

  return {
    daily,
    limit: quotaValue,
    model: /\bmodel:\s*([\w.-]+)/.exec(message)?.[1],
    retryAfterSec: retryMatch ? Math.round(Number(retryMatch[1])) : undefined,
  };
}

/**
 * Models tried in order. Each has its own per-day free-tier bucket, so
 * exhausting one still leaves the others available. Ordered best-first for
 * image calorie estimation; `gemini-flash-latest` is the safety net because
 * Google keeps it pointed at a currently-served model.
 */
export const MODEL_CHAIN = [
  "gemini-3.8-flash",
  "gemini-2.5-flash",
  "gemini-flash-latest",
] as const;

export function isQuotaError(e: unknown): e is GeminiQuotaError {
  return e instanceof GeminiQuotaError;
}

export class GeminiQuotaError extends Error {
  readonly quota: QuotaInfo;
  constructor(quota: QuotaInfo) {
    super(quota.daily ? "daily" : "per-minute");
    this.name = "GeminiQuotaError";
    this.quota = quota;
  }
}

/** Midnight Pacific, which is when the per-day counter rolls over. */
export function dailyResetHint(now = new Date()): string {
  // Pacific is UTC-8 (PST); Google does not observe DST for quota resets.
  const pacificNowMs = now.getTime() - 8 * 3600 * 1000;
  const pacific = new Date(pacificNowMs);
  const hoursToMidnight = 24 - pacific.getUTCHours();
  const h = Math.floor(hoursToMidnight);
  const m = Math.round((hoursToMidnight - h) * 60);
  if (h <= 0) return "resets shortly";
  return `resets in ${h}h ${m}m`;
}

export function quotaMessage(q: QuotaInfo, model: string): string {
  if (!q.daily) {
    return (
      `Gemini's per-minute limit was hit on ${model}. ` +
      "Wait about a minute and scan again."
    );
  }
  return (
    `You've used all ${q.limit ?? 20} free Gemini scans for today on ${model} ` +
    `(the free tier allows ${q.limit ?? 20} per day). It ${dailyResetHint()}. ` +
    "You can still scan - the app will switch to another model."
  );
}
