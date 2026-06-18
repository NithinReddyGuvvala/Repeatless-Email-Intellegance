// Shared in-memory state tracking Gemini API quota limits (circuit breaker)
let aiQuotaExceeded = false;
let nextRetryAt: number | null = null;

export function getQuotaStatus() {
  // Automatically reset if the next retry timestamp has passed
  if (aiQuotaExceeded && nextRetryAt && Date.now() > nextRetryAt) {
    aiQuotaExceeded = false;
    nextRetryAt = null;
    console.log("[AI Quota Status] Quota retry cooldown finished. Re-enabling Gemini calls.");
  }
  return { aiQuotaExceeded, nextRetryAt };
}

export function setQuotaExceeded(retryAfterMs: number = 5 * 60 * 1000) { // Default to 5 minutes
  aiQuotaExceeded = true;
  nextRetryAt = Date.now() + retryAfterMs;
  console.warn(`[AI Quota Status] Circuit breaker tripped! Gemini API calls disabled until ${new Date(nextRetryAt).toLocaleTimeString()}`);
}

export function resetQuota() {
  aiQuotaExceeded = false;
  nextRetryAt = null;
  console.log("[AI Quota Status] Quota circuit breaker manually reset.");
}
