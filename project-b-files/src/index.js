/**
 * SignalZero — Section 1 public API.
 *
 * Section 2 imports everything from this file:
 *
 *   import {
 *     detectSuspiciousTransactions,
 *     getInvestigation,
 *     listInvestigations,
 *     updateInvestigationStatus,
 *     INVESTIGATION_STATUSES,
 *   } from '<path-to>/src/index.js';
 *
 * A default singleton wires the engine + store together so Section 2 gets a
 * working whole with zero setup. Use createSignalZero(...) for isolated
 * instances (e.g. tests, or a persistence file of your own).
 */

import { createDetectionEngine } from './detection/engine.js';
import {
  createInvestigationStore,
  buildInvestigation,
  INVESTIGATION_STATUSES,
  DEFAULT_STATUS,
  isValidStatus,
} from './investigations/store.js';
import { DEFAULT_DETECTION_CONFIG } from './detection/config.js';
import { RULE_TYPES, SEVERITY_LEVELS } from './detection/util.js';
import { mockTransactions } from './detection/mockData.js';

/**
 * Create a fully wired detection + investigation instance.
 * @param {{config?: object, persistencePath?: string}} [options]
 */
export function createSignalZero({ config, persistencePath } = {}) {
  const engine = createDetectionEngine({ config });
  const store = createInvestigationStore({ persistencePath });

  /** Run detection, register investigations, return alerts + summary. */
  function detectSuspiciousTransactions(transactions, options) {
    const { alerts, summary } = engine.detectTransactions(transactions, options);
    const investigations = store.registerAlerts(alerts);
    return { alerts, investigations, summary };
  }

  return {
    detectSuspiciousTransactions,
    config: engine.config,
    getInvestigation: (alertId) => store.get(alertId),
    listInvestigations: (filter) => store.list(filter),
    updateInvestigationStatus: (alertId, status, meta) => store.updateStatus(alertId, status, meta),
    store,
  };
}

/** Default shared instance (in-memory status store). */
const defaultInstance = createSignalZero();

/**
 * Detect suspicious transactions in `transactions` (Nessie shape) and return
 * { alerts, investigations, summary }.
 */
export function detectSuspiciousTransactions(transactions, options) {
  return defaultInstance.detectSuspiciousTransactions(transactions, options);
}

/** Look up the investigation record for an alert id (or null). */
export function getInvestigation(alertId) {
  return defaultInstance.getInvestigation(alertId);
}

/** List investigations, optionally filtered by { status }. */
export function listInvestigations(filter) {
  return defaultInstance.listInvestigations(filter);
}

/** Update an investigation's status; returns the updated record. */
export function updateInvestigationStatus(alertId, status, meta) {
  return defaultInstance.updateInvestigationStatus(alertId, status, meta);
}

/** Reset the default instance's investigation store (handy for demos/tests). */
export function resetInvestigations() {
  defaultInstance.store.clear();
}

export {
  createDetectionEngine,
  createInvestigationStore,
  buildInvestigation,
  DEFAULT_DETECTION_CONFIG,
  INVESTIGATION_STATUSES,
  DEFAULT_STATUS,
  isValidStatus,
  RULE_TYPES,
  SEVERITY_LEVELS,
  mockTransactions,
};

export default {
  createSignalZero,
  detectSuspiciousTransactions,
  getInvestigation,
  listInvestigations,
  updateInvestigationStatus,
};
