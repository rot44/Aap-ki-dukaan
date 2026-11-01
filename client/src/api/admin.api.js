/**
 * CoBuy AI — Administrator & Moderation API Client (SUJ-09 / SRU-10)
 *
 * Implements client-side calls for:
 *  - GET  /api/admin/reconciliation              (Reconciliation dashboard)
 *  - POST /api/admin/reconciliation/:id/annotate (Append notes without overwriting facts)
 *  - GET  /api/admin/audit-logs                  (Immutable audit logs)
 *  - POST /api/admin/jobs/run-lifecycle-check    (Fast-forward 72h/24h scheduler check)
 *  - POST /api/admin/suppliers                   (Create/verify supplier)
 *  - PATCH /api/admin/suppliers/:id              (Update supplier status/provenance)
 *  - POST /api/admin/offers                      (Create catalogue offer)
 *  - PATCH /api/admin/offers/:id                 (Update offer pricing/validity)
 */

import axiosClient from './axiosClient';

function unwrap(res, fallback = null) {
  if (!res) return fallback;
  const body = res.data;
  if (body && typeof body === 'object' && 'data' in body) {
    return body.data ?? fallback;
  }
  return body ?? fallback;
}

/**
 * Fetch platform reconciliation dashboard metrics and exceptions.
 *
 * @returns {Promise<object>}
 */
export async function getReconciliationDashboard() {
  const res = await axiosClient.get('/admin/reconciliation');
  return unwrap(res, {
    stalledPools: [],
    expiredQuotes: [],
    attentionPayments: [],
    failedRefunds: [],
    failedAILogs: [],
  });
}

/**
 * Append an immutable reconciliation note to a payment record (FR-ADMIN-005).
 *
 * @param {string} paymentId
 * @param {object} payload
 * @param {string} payload.note
 * @param {boolean} [payload.triggerProviderSync=false]
 * @returns {Promise<object>}
 */
export async function annotatePayment(paymentId, payload) {
  if (!paymentId) throw new Error('Payment ID is required.');
  const res = await axiosClient.post(`/admin/reconciliation/${paymentId}/annotate`, payload);
  return unwrap(res, null);
}

/**
 * Fetch immutable audit logs and AI execution traces.
 *
 * @param {object} [params={}]
 * @returns {Promise<object>}
 */
export async function getAuditLogs(params = {}) {
  const res = await axiosClient.get('/admin/audit-logs', { params });
  return unwrap(res, { auditLogs: [], total: 0 });
}

/**
 * Trigger server-side 72h/24h lifecycle check evaluation.
 * Supports test clock offset hours for hackathon demonstrations.
 *
 * @param {number} [offsetHours=0]
 * @returns {Promise<object>}
 */
export async function runLifecycleCheck(offsetHours = 0) {
  const res = await axiosClient.post('/admin/jobs/run-lifecycle-check', {
    offsetHours: Number(offsetHours) || 0,
  });
  return unwrap(res, null);
}

/**
 * Create a new supplier with verification and provenance status.
 *
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function createSupplier(payload) {
  const res = await axiosClient.post('/admin/suppliers', payload);
  return unwrap(res, null);
}

/**
 * Update an existing supplier profile and provenance.
 *
 * @param {string} supplierId
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function updateSupplier(supplierId, payload) {
  if (!supplierId) throw new Error('Supplier ID is required.');
  const res = await axiosClient.patch(`/admin/suppliers/${supplierId}`, payload);
  return unwrap(res, null);
}

/**
 * Create a wholesale catalogue offer.
 *
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function createOffer(payload) {
  const res = await axiosClient.post('/admin/offers', payload);
  return unwrap(res, null);
}

/**
 * Update an existing wholesale catalogue offer.
 *
 * @param {string} offerId
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function updateOffer(offerId, payload) {
  if (!offerId) throw new Error('Offer ID is required.');
  const res = await axiosClient.patch(`/admin/offers/${offerId}`, payload);
  return unwrap(res, null);
}

export const adminApi = {
  getReconciliationDashboard,
  annotatePayment,
  getAuditLogs,
  runLifecycleCheck,
  createSupplier,
  updateSupplier,
  createOffer,
  updateOffer,
};

export default adminApi;
