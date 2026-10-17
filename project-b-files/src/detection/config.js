/**
 * Default detection configuration (all amounts in USD).
 * Section 2 / callers can override any of these via createSignalZero({ config })
 * or createDetector({ config }); invalid overrides fall back to the defaults.
 */
export const DEFAULT_DETECTION_CONFIG = Object.freeze({
  largeTransaction: Object.freeze({
    // Flag transactions at or above this absolute amount.
    absoluteThreshold: 1000,
    // amount >= threshold * highMultiplier  -> high severity
    highMultiplier: 5,
    // amount >= threshold * criticalMultiplier -> critical severity
    criticalMultiplier: 10,
    // Minimum number of prior transactions on the account before we trust a baseline.
    historyMinTransactions: 5,
    // Flag when amount >= deviationMultiplier * median(prior amounts).
    deviationMultiplier: 5,
    // Deviation ratio at which the flag becomes high severity.
    deviationHighRatio: 10,
  }),
  repeatedPayment: Object.freeze({
    // Similar payments to the same merchant within this window.
    windowMinutes: 60,
    // Minimum number of similar payments needed to flag.
    minCount: 3,
    // Amounts are "similar" when within this percentage of each other...
    similarityPercent: 0.05,
    // ...or within this absolute floor (whichever is larger).
    similarityFloor: 2,
    // Group total at or above this amount escalates severity to high.
    totalAmountHigh: 1000,
  }),
  rapidTransactions: Object.freeze({
    // N transactions within this window triggers the rule.
    windowMinutes: 10,
    minCount: 4,
    // count >= ceil(minCount * highCountMultiplier) escalates severity to high.
    highCountMultiplier: 1.5,
  }),
});

function mergeSection(defaults, overrides) {
  const result = { ...defaults };
  if (!overrides || typeof overrides !== 'object') return result;
  for (const key of Object.keys(defaults)) {
    const value = overrides[key];
    if (Number.isFinite(value) && value > 0) result[key] = value;
  }
  return result;
}

/** Merge caller overrides over the defaults, ignoring invalid values. */
export function mergeConfig(overrides = {}) {
  if (!overrides || typeof overrides !== 'object') {
    return {
      largeTransaction: { ...DEFAULT_DETECTION_CONFIG.largeTransaction },
      repeatedPayment: { ...DEFAULT_DETECTION_CONFIG.repeatedPayment },
      rapidTransactions: { ...DEFAULT_DETECTION_CONFIG.rapidTransactions },
    };
  }
  return {
    largeTransaction: mergeSection(DEFAULT_DETECTION_CONFIG.largeTransaction, overrides.largeTransaction),
    repeatedPayment: mergeSection(DEFAULT_DETECTION_CONFIG.repeatedPayment, overrides.repeatedPayment),
    rapidTransactions: mergeSection(DEFAULT_DETECTION_CONFIG.rapidTransactions, overrides.rapidTransactions),
  };
}
