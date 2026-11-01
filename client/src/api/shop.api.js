/**
 * CoBuy AI — Shop Profile API Client (PRK-04 / HIM-06)
 *
 * Implements client-side calls for:
 *  - GET   /api/shops/me     (Retrieve authenticated shop profile)
 *  - PATCH /api/shops/me     (Update shop profile)
 *  - GET   /api/shops/:id    (Retrieve shop by ID with ownership guard)
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
 * Get authenticated retailer's own shop profile.
 *
 * @returns {Promise<object>}
 */
export async function getMyShop() {
  const res = await axiosClient.get('/shops/me');
  return unwrap(res, null);
}

/**
 * Update authenticated retailer's own shop profile.
 *
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function updateMyShop(payload) {
  const res = await axiosClient.patch('/shops/me', payload);
  return unwrap(res, null);
}

/**
 * Get shop profile by ID.
 *
 * @param {string} shopId
 * @returns {Promise<object>}
 */
export async function getShopById(shopId) {
  if (!shopId) throw new Error('Shop ID is required.');
  const res = await axiosClient.get(`/shops/${shopId}`);
  return unwrap(res, null);
}

export const shopApi = {
  getMyShop,
  updateMyShop,
  getShopById,
};

export default shopApi;
