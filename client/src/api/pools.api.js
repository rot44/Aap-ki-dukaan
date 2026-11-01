/**
 * CoBuy AI — Pools & Marketplace API Client (SUJ-02 / SUJ-03 / SUJ-04 / SUJ-05)
 *
 * Implements client-side calls for:
 *  - GET  /api/pools                   (Marketplace pool discovery with filters)
 *  - GET  /api/pools/:id               (Detailed pool specs, snapshot, contributions)
 *  - POST /api/pools                   (Publish 72h recruiting group-buy pool)
 *  - POST /api/pools/:id/contributions (Join pool with initial commitment)
 *  - PATCH /api/pools/:id/contributions/:cid (Edit quantity pre-lock)
 *  - POST /api/pools/:id/contributions/:cid/withdraw (Withdraw pre-lock)
 *  - POST /api/pools/:id/approve       (Explicit versioned PriceSnapshot approval)
 *  - POST /api/pools/:id/decision      (24h Under-MOQ buyer decision)
 *  - POST /api/pools/:id/supplier-feasibility (Supplier under-MOQ response)
 *  - GET  /api/requirements?status=CONFIRMED (Retrieve eligible confirmed requirements)
 *  - GET  /api/requirements/:id/matches (Authoritative AI Two-Stage offer matching)
 *  - GET  /api/offers/search           (Supplier wholesale catalogue search)
 *  - GET  /api/products/search         (Catalogue product reference with auto-pagination)
 */

import axiosClient from './axiosClient';

/**
 * Normalizes API response defensively, extracting the payload from standard
 * APIResponse wrappers ({ statusCode, success, data }) or direct response objects.
 *
 * @param {object} res - Axios-compatible response object
 * @param {any} fallback - Default fallback if data is missing
 * @returns {any}
 */
function unwrap(res, fallback = null) {
  if (!res) return fallback;
  const body = res.data;
  if (body && typeof body === 'object' && 'data' in body) {
    return body.data ?? fallback;
  }
  return body ?? fallback;
}

/**
 * Fetch marketplace pools with optional query filters.
 *
 * @param {object} [filters={}]
 * @param {string} [filters.state] - RECRUITING, MOQ_REACHED, etc.
 * @param {string} [filters.deliveryArea] - Regional delivery area
 * @param {string} [filters.productId] - Canonical product ID
 * @returns {Promise<Array<object>>}
 */
export async function fetchPools(filters = {}) {
  const params = {};
  if (filters.state && filters.state !== 'ALL') params.state = filters.state;
  if (filters.deliveryArea && filters.deliveryArea !== 'ALL') params.deliveryArea = filters.deliveryArea;
  if (filters.productId && filters.productId !== 'ALL') params.productId = filters.productId;

  const res = await axiosClient.get('/pools', { params });
  const data = unwrap(res, []);
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch detailed pool by ID including populated product, snapshot, and member contributions.
 *
 * @param {string} poolId
 * @returns {Promise<{ pool: object, contributions: Array<object> }>}
 */
export async function fetchPoolById(poolId) {
  if (!poolId) throw new Error('Pool ID is required.');
  const res = await axiosClient.get(`/pools/${poolId}`);
  const data = unwrap(res, {});
  return {
    pool: data.pool || null,
    contributions: Array.isArray(data.contributions) ? data.contributions : [],
  };
}

/**
 * Fetch confirmed procurement requirements for the authenticated shop.
 * Strictly filters by status=CONFIRMED (satisfying Business Rule BR-001).
 *
 * @param {object} [params={}]
 * @returns {Promise<Array<object>>}
 */
export async function fetchConfirmedRequirements(params = {}) {
  const query = {
    status: 'CONFIRMED',
    limit: params.limit || 50,
    page: params.page || 1,
    ...params,
  };

  const res = await axiosClient.get('/requirements', { params: query });
  const data = unwrap(res, {});
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.requirements)) return data.requirements;
  return [];
}

/**
 * Fetch candidate offers evaluated by the backend Two-Stage AI Matching Engine.
 * This is the AUTHORITATIVE source for offer compatibility.
 *
 * @param {string} requirementId
 * @returns {Promise<{
 *   qualifiedMatches: Array<object>,
 *   filteredOutOffers: Array<object>,
 *   totalEvaluated: number,
 *   totalQualified: number
 * }>}
 */
export async function fetchRequirementMatches(requirementId) {
  if (!requirementId) throw new Error('Requirement ID is required to fetch matches.');
  const res = await axiosClient.get(`/requirements/${requirementId}/matches`);
  const data = unwrap(res, {});
  return {
    qualifiedMatches: Array.isArray(data.qualifiedMatches) ? data.qualifiedMatches : [],
    filteredOutOffers: Array.isArray(data.filteredOutOffers) ? data.filteredOutOffers : [],
    totalEvaluated: data.totalEvaluated || 0,
    totalQualified: data.totalQualified || 0,
  };
}

/**
 * Search active supplier wholesale catalogue offers.
 *
 * @param {object} [params={}]
 * @returns {Promise<Array<object>>}
 */
export async function searchSupplierOffers(params = {}) {
  const query = {
    includeExpired: false,
    limit: params.limit || 50,
    page: params.page || 1,
    ...params,
  };

  const res = await axiosClient.get('/offers/search', { params: query });
  const data = unwrap(res, {});
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.offers)) return data.offers;
  return [];
}

/**
 * Fetch complete product catalogue reference with automatic pagination.
 * Ensures category filtering never omits products when catalogue exceeds 100 items.
 *
 * @returns {Promise<{
 *   productList: Array<object>,
 *   productMap: Record<string, { canonicalName: string, category: string, specifications: object }>
 * }>}
 */
export async function fetchProductCatalogue() {
  const productList = [];
  let page = 1;
  let totalPages = 1;
  const limit = 100;

  do {
    try {
      const res = await axiosClient.get('/products/search', {
        params: { limit, page },
      });
      const data = unwrap(res, {});
      const items = Array.isArray(data)
        ? data
        : Array.isArray(data.products)
        ? data.products
        : [];

      productList.push(...items);

      if (data.pagination && typeof data.pagination.totalPages === 'number') {
        totalPages = data.pagination.totalPages;
      } else {
        totalPages = 1;
      }
      page += 1;
    } catch {
      // If error on page > 1, break gracefully with what we have
      break;
    }
  } while (page <= totalPages && page <= 10); // Safe guard: max 1000 products

  const productMap = {};
  productList.forEach((prod) => {
    if (prod && prod._id) {
      productMap[prod._id] = {
        canonicalName: prod.canonicalName || 'Product',
        category: prod.category ? prod.category.toUpperCase().trim() : 'GENERAL',
        specifications: prod.specifications || {},
        packSizeDescription: prod.packSizeDescription || '',
        baseUnit: prod.baseUnit || 'UNIT',
      };
    }
  });

  return { productList, productMap };
}

/**
 * Publish a new 72-hour group-buy pool.
 *
 * @param {object} payload
 * @returns {Promise<object>} Created GroupBuyPool
 */
export async function createPool(payload) {
  const res = await axiosClient.post('/pools', payload);
  return unwrap(res, null);
}

/**
 * Commit a retailer's contribution to join a group-buy pool.
 *
 * @param {string} poolId
 * @param {object} payload
 * @returns {Promise<object>} Created Contribution
 */
export async function joinPool(poolId, payload) {
  if (!poolId) throw new Error('Pool ID is required to join pool.');
  const res = await axiosClient.post(`/pools/${poolId}/contributions`, payload);
  return unwrap(res, null);
}

/**
 * Update contribution quantity during open recruitment window.
 *
 * @param {string} poolId
 * @param {string} contributionId
 * @param {number} quantity
 * @returns {Promise<object>}
 */
export async function updateContributionQuantity(poolId, contributionId, quantity) {
  if (!poolId || !contributionId) throw new Error('Pool ID and Contribution ID are required.');
  const res = await axiosClient.patch(`/pools/${poolId}/contributions/${contributionId}`, { quantity });
  return unwrap(res, null);
}

/**
 * Withdraw contribution during open recruitment window.
 *
 * @param {string} poolId
 * @param {string} contributionId
 * @param {string} [reason='BUYER_WITHDRAWAL']
 * @returns {Promise<object>}
 */
export async function withdrawContribution(poolId, contributionId, reason = 'BUYER_WITHDRAWAL') {
  if (!poolId || !contributionId) throw new Error('Pool ID and Contribution ID are required.');
  const res = await axiosClient.post(`/pools/${poolId}/contributions/${contributionId}/withdraw`, { reason });
  return unwrap(res, null);
}

/**
 * Submit explicit approval for a versioned PriceSnapshot.
 *
 * @param {string} poolId
 * @param {string} priceSnapshotId
 * @returns {Promise<object>}
 */
export async function approvePriceSnapshot(poolId, priceSnapshotId) {
  if (!poolId) throw new Error('Pool ID is required.');
  const res = await axiosClient.post(`/pools/${poolId}/approve`, { priceSnapshotId });
  return unwrap(res, null);
}

/**
 * Submit buyer decision in 24h Under-MOQ window (PROCEED / CANCEL).
 *
 * @param {string} poolId
 * @param {'PROCEED'|'CANCEL'} decision
 * @returns {Promise<object>}
 */
export async function submitUnderMoqDecision(poolId, decision) {
  if (!poolId) throw new Error('Pool ID is required.');
  const res = await axiosClient.post(`/pools/${poolId}/decision`, { decision });
  return unwrap(res, null);
}

/**
 * Submit supplier feasibility response for an under-MOQ pool.
 *
 * @param {string} poolId
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function submitSupplierFeasibility(poolId, payload) {
  if (!poolId) throw new Error('Pool ID is required.');
  const res = await axiosClient.post(`/pools/${poolId}/supplier-feasibility`, payload);
  return unwrap(res, null);
}

export const poolsApi = {
  fetchPools,
  fetchPoolById,
  fetchConfirmedRequirements,
  fetchRequirementMatches,
  searchSupplierOffers,
  fetchProductCatalogue,
  createPool,
  joinPool,
  updateContributionQuantity,
  withdrawContribution,
  approvePriceSnapshot,
  submitUnderMoqDecision,
  submitSupplierFeasibility,
};

export default poolsApi;
