/**
 * CoBuy AI — Purchasing Requirements API Client (HIM-07)
 *
 * Implements all client-side calls for the Requirement Intake feature.
 * Endpoints are consistent with the SAH-01, SAH-02, and SAH-04 backend contracts.
 *
 * Backend base path: /api/requirements
 * Upload base path:  /api/uploads
 *
 * All functions return the response object from axiosClient.
 * Callers should handle thrown errors (4xx / 5xx / network).
 */

import axiosClient from '@/api/axiosClient';

// ─── Requirement Lifecycle Statuses (SAH-02 Requirement.model.js) ─────────────
export const REQUIREMENT_STATUS = {
  DRAFT: 'DRAFT',
  PROCESSING: 'PROCESSING',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  CONFIRMED: 'CONFIRMED',
  FAILED_EXTRACTION: 'FAILED_EXTRACTION',
  REJECTED: 'REJECTED',
  ARCHIVED: 'ARCHIVED',
};

// ─── Requirement Source Types (SAH-02 Requirement.model.js) ───────────────────
// Backend enum: ["FORM", "TEXT", "IMAGE", "PDF", "CSV"]
export const REQUIREMENT_SOURCE = {
  // Canonical backend source types
  FORM: 'FORM',
  TEXT: 'TEXT',
  IMAGE: 'IMAGE',
  PDF: 'PDF',
  CSV: 'CSV',
  // UI aliases for backwards compatibility
  NATURAL_LANGUAGE: 'NATURAL_LANGUAGE',
  DOCUMENT_UPLOAD: 'DOCUMENT_UPLOAD',
  STRUCTURED_FORM: 'STRUCTURED_FORM',
  CSV_IMPORT: 'CSV_IMPORT',
};

// ─── Allowed Upload MIME Types (SAH-01 upload.middleware.js) ──────────────────
export const ALLOWED_UPLOAD_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
];
export const ALLOWED_UPLOAD_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

// ─── List Requirements ────────────────────────────────────────────────────────
/**
 * Fetch the authenticated shop owner's requirements list.
 *
 * GET /api/requirements
 * Supported query params: shopId, status, category, deliveryArea, page, limit
 *
 * @param {object} params  Optional query params
 * @returns {Promise<{data: {statusCode: number, data: {requirements: object[], pagination: object}, message: string}}>}
 */
export async function listRequirements(params = {}) {
  return axiosClient.get('/requirements', { params });
}

// ─── Get One Requirement ──────────────────────────────────────────────────────
/**
 * GET /api/requirements/:id
 *
 * @param {string} requirementId
 * @returns {Promise<{data: {statusCode: number, data: object, message: string}}>}
 */
export async function getRequirement(requirementId) {
  return axiosClient.get(`/requirements/${requirementId}`);
}

// ─── Create Requirement (Natural Language) ────────────────────────────────────
/**
 * POST /api/requirements
 *
 * Creates a new requirement draft from natural-language text.
 * Backend expects: { sourceType: "TEXT", originalDescription: string, status: "DRAFT" }
 *
 * @param {object} payload  { naturalLanguageText: string, title?: string, originalDescription?: string }
 * @returns {Promise<{data: {statusCode: number, data: object, message: string}}>}
 */
export async function createRequirementFromText(payload) {
  const text = payload.naturalLanguageText || payload.text || payload.originalDescription || '';
  return axiosClient.post('/requirements', {
    sourceType: 'TEXT',
    source: payload.source || REQUIREMENT_SOURCE.NATURAL_LANGUAGE,
    originalDescription: text,
    naturalLanguageText: text,
    status: REQUIREMENT_STATUS.DRAFT,
    ...payload,
  });
}

// ─── Create Requirement (Structured Form) ────────────────────────────────────
/**
 * POST /api/requirements
 *
 * Creates a requirement from manually entered fields.
 * Backend expects: { sourceType: "FORM", confirmedFields: object, originalDescription?: string }
 *
 * @param {object} payload  Structured product/delivery fields
 * @returns {Promise<{data: {statusCode: number, data: object, message: string}}>}
 */
export async function createRequirementFromForm(payload) {
  const productName = payload.productName || '';
  const category = payload.category ? String(payload.category).toUpperCase() : null;
  const requestedQuantity = Number(payload.requestedQuantity || payload.quantity) || 1;
  const quantityUnit = (payload.quantityUnit || payload.unit || 'UNIT').toUpperCase();
  const deliveryArea = (payload.deliveryArea || payload.deliveryLocation || '').trim().toUpperCase() || null;
  const packSize = payload.packSize || null;
  const requiredBy = payload.requiredBy || payload.requiredByDate || null;

  const confirmedFields = {
    productName,
    category,
    requestedQuantity,
    quantityUnit,
    deliveryArea,
    packSize,
    requiredBy,
    ...(payload.notes ? { additionalSpecifications: { notes: payload.notes } } : {}),
    ...(payload.confirmedFields || {}),
  };

  return axiosClient.post('/requirements', {
    sourceType: 'FORM',
    source: payload.source || REQUIREMENT_SOURCE.STRUCTURED_FORM,
    originalDescription:
      payload.originalDescription ||
      payload.title ||
      `${productName} (${requestedQuantity} ${quantityUnit})`,
    confirmedFields,
    // Preserve top-level fields for tests and backward compatibility
    ...payload,
    confirmedFields,
  });
}

// ─── Update Requirement ───────────────────────────────────────────────────────
/**
 * PATCH /api/requirements/:id
 *
 * @param {string} requirementId
 * @param {object} updates  Partial requirement fields (status, confirmedFields, etc.)
 * @returns {Promise<{data: {statusCode: number, data: object, message: string}}>}
 */
export async function updateRequirement(requirementId, updates) {
  return axiosClient.patch(`/requirements/${requirementId}`, updates);
}

// ─── Confirm Requirement ──────────────────────────────────────────────────────
/**
 * PATCH /api/requirements/:id/confirm
 *
 * Marks requirement status as CONFIRMED with verified fields.
 *
 * @param {string} requirementId
 * @param {object} confirmedFields  Confirmed product & quantity specifications
 * @returns {Promise<{data: {statusCode: number, data: object, message: string}}>}
 */
export async function confirmRequirement(requirementId, confirmedFields = {}) {
  return axiosClient.patch(`/requirements/${requirementId}/confirm`, {
    confirmedFields,
  });
}

// ─── Reject Requirement ───────────────────────────────────────────────────────
/**
 * PATCH /api/requirements/:id/reject
 *
 * Rejects requirement (e.g. invalid document or user cancelled).
 *
 * @param {string} requirementId
 * @returns {Promise<{data: {statusCode: number, data: object, message: string}}>}
 */
export async function rejectRequirement(requirementId) {
  return axiosClient.patch(`/requirements/${requirementId}/reject`);
}

// ─── Get Compatible Supplier Offers ──────────────────────────────────────────
/**
 * GET /api/requirements/:id/matches
 *
 * Returns qualified and filtered-out supplier offers for this requirement.
 *
 * @param {string} requirementId
 * @returns {Promise<{data: {statusCode: number, data: {qualifiedMatches: object[], filteredOutOffers: object[]}, message: string}}>}
 */
export async function getRequirementMatches(requirementId) {
  return axiosClient.get(`/requirements/${requirementId}/matches`);
}

// ─── Upload Private Document ──────────────────────────────────────────────────
/**
 * POST /api/uploads
 *
 * Uploads a document (PDF, PNG, JPG, WEBP <= 10 MB) via multipart/form-data.
 *
 * @param {File}     file        File to upload
 * @param {Function} [onProgress] Progress callback (percent: number)
 * @returns {Promise<{data: {statusCode: number, data: {uploadedDocumentId: string, originalName: string, ...}, message: string}}>}
 */
export async function uploadDocument(file, onProgress) {
  validateUploadFile(file);

  const formData = new FormData();
  formData.append('document', file);

  return axiosClient.post('/uploads', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percent);
      }
    },
  });
}

// ─── Create Requirement from Uploaded Document ────────────────────────────────
/**
 * POST /api/requirements
 *
 * Links an uploaded document to a new requirement and initiates AI extraction.
 * Backend expects: { sourceType: "PDF"|"IMAGE", uploadedDocumentId: string, ... }
 *
 * @param {string} uploadId  The uploadedDocumentId from uploadDocument()
 * @param {string} title     Display title
 * @param {object} [options] Additional options (category, deliveryArea, etc.)
 * @returns {Promise<{data: {statusCode: number, data: object, message: string}}>}
 */
export async function createRequirementFromUpload(uploadId, title, options = {}) {
  return axiosClient.post('/requirements', {
    uploadedDocumentId: uploadId,
    sourceType: options.sourceType || 'PDF',
    source: REQUIREMENT_SOURCE.DOCUMENT_UPLOAD,
    originalDescription: title || 'Document Upload',
    title: title || 'Document Upload',
    status: REQUIREMENT_STATUS.PROCESSING,
    ...options,
  });
}

// ─── Trigger AI Extraction ────────────────────────────────────────────────────
/**
 * POST /api/requirements/:id/extract
 *
 * Retries or triggers AI extraction for a requirement with an attached document.
 *
 * @param {string} requirementId
 * @returns {Promise<{data: {statusCode: number, data: object, message: string}}>}
 */
export async function triggerExtraction(requirementId) {
  return axiosClient.post(`/requirements/${requirementId}/extract`);
}

// ─── Bulk Import from CSV ─────────────────────────────────────────────────────
/**
 * POST /api/requirements/csv-import
 *
 * Parses and validates CSV rows, creating draft requirements in bulk.
 *
 * @param {File} csvFile
 * @returns {Promise<{data: {statusCode: number, data: {created: object[], errors: object[]}, message: string}}>}
 */
export async function importRequirementsFromCsv(csvFile) {
  if (!csvFile) {
    throw new Error('A CSV file is required.');
  }

  const formData = new FormData();
  formData.append('csvFile', csvFile);

  return axiosClient.post('/requirements/csv-import', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
}

// ─── Client-side Validation Helper ────────────────────────────────────────────
/**
 * Validates a file before upload.
 * Throws an Error with a descriptive message if invalid.
 *
 * @param {File} file
 */
export function validateUploadFile(file) {
  if (!file) {
    throw new Error('No file provided.');
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `File size (${sizeMb} MB) exceeds the maximum allowed limit of 10 MB.`
    );
  }

  const isAllowedType = ALLOWED_UPLOAD_TYPES.includes(file.type);
  const fileName = file.name || '';
  const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
  const isAllowedExt = ALLOWED_UPLOAD_EXTENSIONS.includes(ext);

  if (!isAllowedType && !isAllowedExt) {
    throw new Error(
      `Unsupported file type "${file.type || ext}". Allowed types: PDF, PNG, JPG, WEBP.`
    );
  }
}

/**
 * Extract a readable error message from an API error object.
 * Checks backend response body (.response.data.message), validation errors (.errors), and standard error message.
 *
 * @param {unknown} err  Thrown error from axiosClient
 * @param {string}  fallback  Default message if none found
 * @returns {string}
 */
export function getApiErrorMessage(err, fallback = 'An unexpected error occurred.') {
  if (!err) return fallback;
  if (err.response?.data?.message) return err.response.data.message;
  if (Array.isArray(err.errors) && err.errors.length > 0) return err.errors.join(', ');
  if (typeof err.message === 'string' && err.message) return err.message;
  return fallback;
}

export const requirementsApi = {
  listRequirements,
  getRequirement,
  createRequirementFromText,
  createRequirementFromForm,
  updateRequirement,
  confirmRequirement,
  rejectRequirement,
  getRequirementMatches,
  uploadDocument,
  createRequirementFromUpload,
  triggerExtraction,
  importRequirementsFromCsv,
  validateUploadFile,
  getApiErrorMessage,
  REQUIREMENT_STATUS,
  REQUIREMENT_SOURCE,
  ALLOWED_UPLOAD_TYPES,
  ALLOWED_UPLOAD_EXTENSIONS,
  MAX_UPLOAD_BYTES,
};

export default requirementsApi;
