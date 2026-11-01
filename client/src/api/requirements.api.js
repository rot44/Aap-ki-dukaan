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

// ─── Confirm Requirement (Rule BR-001) ────────────────────────────────────────
/**
 * PATCH /api/requirements/:id
 *
 * Confirms requirement with buyer-reviewed confirmedFields.
 * Backend enforces Rule BR-001 (productName, category, requestedQuantity, quantityUnit, deliveryArea).
 *
 * @param {string} requirementId
 * @param {object} confirmedFields
 * @returns {Promise<{data: {statusCode: number, data: object, message: string}}>}
 */
export async function confirmRequirement(requirementId, confirmedFields) {
  return updateRequirement(requirementId, {
    status: REQUIREMENT_STATUS.CONFIRMED,
    confirmedFields,
  });
}

// ─── Reject Requirement ───────────────────────────────────────────────────────
/**
 * PATCH /api/requirements/:id
 *
 * Rejects requirement with explicit user confirmation.
 *
 * @param {string} requirementId
 * @returns {Promise<{data: {statusCode: number, data: object, message: string}}>}
 */
export async function rejectRequirement(requirementId) {
  return updateRequirement(requirementId, {
    status: REQUIREMENT_STATUS.REJECTED,
  });
}

// ─── Get Candidate Matching Offers (SAH-06) ───────────────────────────────────
/**
 * GET /api/requirements/:id/matches
 *
 * Fetches qualified and evaluated wholesaler supplier offers for a CONFIRMED requirement.
 *
 * @param {string} requirementId
 * @returns {Promise<{data: {statusCode: number, data: {qualifiedMatches: object[], filteredOutOffers: object[], totalEvaluated: number, totalQualified: number}}}>}
 */
export async function getRequirementMatches(requirementId) {
  return axiosClient.get(`/requirements/${requirementId}/matches`);
}

// ─── Upload Document ──────────────────────────────────────────────────────────
/**
 * POST /api/uploads
 *
 * Uploads a single document file (PDF / PNG / JPG / WEBP ≤ 10 MB).
 * Backend route: router.post("/", documentUploadMiddleware("document"), uploadDocument)
 * Expected multipart field name: "document"
 *
 * @param {File} file  Browser File object
 * @param {function} onProgress  Optional progress callback
 * @returns {Promise<{data: {statusCode: number, data: {_id: string, originalFilename: string, mimeType: string, sizeBytes: number}}}>}
 */
export async function uploadDocument(file, onProgress) {
  validateUploadFile(file); // throws descriptive Error on invalid file

  const formData = new FormData();
  formData.append('document', file); // Matches backend multer field "document"

  return axiosClient.post('/uploads', formData);
}

// ─── Create Requirement from Upload ──────────────────────────────────────────
/**
 * POST /api/requirements
 *
 * After uploading a document, create a requirement linked to the upload.
 * Backend expects: { sourceType: "PDF"|"IMAGE", uploadedDocumentId: string, originalDescription: string }
 *
 * @param {string} uploadId  ID returned by uploadDocument() (document._id)
 * @param {string} [title]   Optional human-readable title or originalFilename
 * @param {object} [options] Optional { mimeType: string }
 * @returns {Promise<{data: {statusCode: number, data: object, message: string}}>}
 */
export async function createRequirementFromUpload(uploadId, title, options = {}) {
  const mimeType = options.mimeType || '';
  const isImage = mimeType.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(title || '');
  const sourceType = isImage ? 'IMAGE' : 'PDF';

  return axiosClient.post('/requirements', {
    sourceType,
    source: isImage ? 'IMAGE' : 'PDF',
    uploadedDocumentId: uploadId,
    uploadId, // backward compat
    originalDescription: title || (isImage ? 'Uploaded receipt/image' : 'Uploaded document/invoice'),
    status: REQUIREMENT_STATUS.DRAFT,
    ...(title ? { title } : {}),
  });
}

// ─── Trigger AI Extraction ────────────────────────────────────────────────────
/**
 * POST /api/requirements/:id/extract
 *
 * Triggers AI attribute extraction on an existing requirement (SAH-04).
 * Backend updates extractedFields and transitions status to NEEDS_REVIEW (or FAILED_EXTRACTION).
 *
 * @param {string} requirementId
 * @returns {Promise<{data: {statusCode: number, data: object, message: string}}>}
 */
export async function triggerExtraction(requirementId) {
  return axiosClient.post(`/requirements/${requirementId}/extract`);
}

// ─── CSV Bulk Import ──────────────────────────────────────────────────────────
/**
 * POST /api/requirements/import-csv
 *
 * Sends a CSV file for bulk requirement creation (SAH-02).
 * Backend route: router.post("/import-csv", conditionalCsvUpload, importCsvRequirements)
 * Expected multipart field name: "file"
 *
 * @param {File} csvFile  Browser File object (text/csv or .csv extension)
 * @returns {Promise<{data: {statusCode: number, data: {totalImported: number, requirements: object[]}}}>}
 */
export async function importRequirementsFromCsv(csvFile) {
  const formData = new FormData();
  formData.append('file', csvFile); // Matches backend conditionalCsvUpload field "file"
  return axiosClient.post('/requirements/import-csv', formData);
}

// ─── Client-Side Upload Validation ───────────────────────────────────────────
/**
 * Validates a File object before uploading.
 * Throws a descriptive Error if the file is invalid.
 *
 * @param {File} file
 * @throws {Error}
 */
export function validateUploadFile(file) {
  if (!file) {
    throw new Error('No file selected.');
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `File is too large (${sizeMB} MB). Maximum allowed size is 10 MB.`
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
