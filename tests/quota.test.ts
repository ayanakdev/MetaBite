import { parseQuota, quotaMessage, dailyResetHint } from "../src/lib/quota.ts";

// Verbatim payload captured from a live 429 while the free tier was exhausted.
const REAL_429 = `{
  "error": {
    "code": 429,
    "message": "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.8-flash\\nPlease retry in 25.904293532s.",
    "status": "RESOURCE_EXHAUSTED",
    "details": [
      { "@type": "type.googleapis.com/google.rpc.Help", "links": [{ "description": "Learn about Gemini API quotas" }] },
      { "@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": [{
          "quotaMetric": "generativelanguage.googleapis.com/generate_content_free_tier_requests",
          "quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
          "quotaDimensions": { "location": "global", "model": "gemini-3.8-flash" },
          "quotaValue": "20" }] },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "25s" }
    ]
  }
}`;

const PER_MINUTE_429 = `{"error":{"code":429,"message":"Resource has been exhausted (e.g. check quota).","status":"RESOURCE_EXHAUSTED"}}`;

let fails = 0;
function check(label: string, cond: boolean, extra = "") {
  if (!cond) fails++;
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
}

console.log("parseQuota: real daily-exhaustion payload");
const q = parseQuota(429, REAL_429);
console.log(`    -> ${JSON.stringify(q)}`);
check("detected as DAILY", q?.daily === true);
check("limit parsed as 20", q?.limit === 20);
check("model parsed", q?.model === "gemini-3.8-flash", String(q?.model));
check("retryAfter parsed as 26", q?.retryAfterSec === 26, String(q?.retryAfterSec));

console.log("\nparseQuota: per-minute payload must NOT be daily");
const q2 = parseQuota(429, PER_MINUTE_429);
check("detected as per-minute", q2?.daily === false, `daily=${q2?.daily}`);

console.log("\nparseQuota: non-quota statuses are ignored");
check("200 -> null", parseQuota(200, "{}") === null);
check("500 -> null", parseQuota(500, "{}") === null);

console.log("\nquotaMessage wording");
const msg = quotaMessage(q!, "gemini-3.8-flash");
console.log(`    "${msg}"`);
check("says today, not a minute", /today/i.test(msg) && !/wait about a minute/i.test(msg));
check("mentions the real limit of 20", /\b20\b/.test(msg));
check("offers the model switch", /switch to another model/i.test(msg));

const msg2 = quotaMessage(q2!, "gemini-2.5-flash");
console.log(`    "${msg2}"`);
check("per-minute message does say minute", /minute/i.test(msg2));

console.log("\ndailyResetHint sanity");
const h = dailyResetHint(new Date("2026-09-27T12:00:00Z"));
console.log(`    12:00 UTC -> "${h}"`);
check("returns a duration, not 'resets shortly'", /resets in/.test(h), h);

console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILURES`}`);
process.exit(fails === 0 ? 0 : 1);
