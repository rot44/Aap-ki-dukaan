/**
 * CoBuy AI — Requirement Create Page (HIM-07)
 *
 * Route: /requirements/new  (SHOP_OWNER only)
 *
 * 4-tab intake UI:
 *  1. Natural Language  — textarea + "Extract with AI" button
 *  2. Document Upload   — drag-and-drop PDF/PNG/JPG/WEBP ≤ 10 MB
 *  3. Structured Form   — manual field entry (conforming to SAH-02 schema & BR-001)
 *  4. CSV Bulk Import   — CSV file picker → /api/requirements/import-csv
 *
 * On success the user is redirected to /requirements.
 */

import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Upload,
  FileText,
  FileSpreadsheet,
  Sparkles,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  FileUp,
} from 'lucide-react';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
import {
  createRequirementFromText,
  createRequirementFromForm,
  createRequirementFromUpload,
  importRequirementsFromCsv,
  uploadDocument,
  triggerExtraction,
  validateUploadFile,
  getApiErrorMessage,
  ALLOWED_UPLOAD_EXTENSIONS,
  MAX_UPLOAD_BYTES,
} from '@/api/requirements.api';

// ─── Constants ───────────────────────────────────────────────────────────────

const UNIT_OPTIONS = [
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'g', label: 'Grams (g)' },
  { value: 'l', label: 'Litres (l)' },
  { value: 'ml', label: 'Millilitres (ml)' },
  { value: 'pcs', label: 'Pieces (pcs)' },
  { value: 'box', label: 'Box' },
  { value: 'carton', label: 'Carton' },
  { value: 'dozen', label: 'Dozen' },
];

const CATEGORY_OPTIONS = [
  { value: 'groceries', label: 'Groceries & Staples' },
  { value: 'beverages', label: 'Beverages' },
  { value: 'dairy', label: 'Dairy & Eggs' },
  { value: 'snacks', label: 'Snacks & Confectionery' },
  { value: 'cleaning', label: 'Cleaning & Hygiene' },
  { value: 'packaging', label: 'Packaging Materials' },
  { value: 'bakery', label: 'Bakery Ingredients' },
  { value: 'other', label: 'Other' },
];

const NL_EXAMPLES = [
  'I need 25 boxes of 12-oz disposable paper cups for our cafe in Lucknow by Friday.',
  'Order 50 kg basmati rice, 20 L sunflower oil, and 100 packets of Maggi noodles for our shop in Delhi NCR.',
  'Monthly stock: 25 L full-cream milk, 10 dozen eggs, and 15 cartons of detergent bar delivered to Lucknow.',
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SuccessBanner({ message }) {
  return (
    <Alert variant="success" data-testid="success-banner">
      <AlertTitle>Success</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function ErrorBanner({ message, onDismiss }) {
  return (
    <Alert variant="error" data-testid="error-banner">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-rose-300 hover:text-rose-100 mt-0.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-400 rounded"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </Alert>
  );
}

// ─── Tab 1: Natural Language ──────────────────────────────────────────────────

function NaturalLanguageTab() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) {
      setError('Please describe your purchasing requirement before extracting.');
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await createRequirementFromText({
        naturalLanguageText: text.trim(),
        originalDescription: text.trim(),
        ...(title.trim() ? { title: title.trim() } : {}),
      });

      // Trigger AI extraction on the created requirement (SAH-04)
      const reqData = res?.data?.data || res?.data?.requirement || res?.data;
      const reqId = reqData?._id || reqData?.id;
      if (reqId) {
        try {
          await triggerExtraction(reqId);
        } catch {
          // AI extraction error will be handled on detail/review page (HIM-08)
        }
      }

      setSuccess(true);
      setTimeout(() => navigate('/requirements'), 1500);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to submit requirement. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const fillExample = (example) => {
    setText(example);
    setError(null);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {success && (
        <SuccessBanner message="Requirement submitted! AI extraction is in progress. Redirecting…" />
      )}
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Optional title */}
      <div>
        <Input
          label="Requirement Title (optional)"
          id="nl-title"
          placeholder="e.g. Weekly grocery restock — November"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={submitting || success}
        />
      </div>

      {/* Natural language textarea */}
      <div className="space-y-1.5">
        <label
          htmlFor="nl-text"
          className="block text-xs font-medium uppercase tracking-wide text-midnight-muted"
        >
          Describe your requirement
          <span className="ml-1 text-midnight-rose" aria-hidden="true">*</span>
        </label>
        <textarea
          id="nl-text"
          data-testid="nl-textarea"
          rows={6}
          placeholder="Tell us what you need to buy — products, quantities, brands, delivery deadline, budget…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          disabled={submitting || success}
          aria-required="true"
          aria-describedby="nl-help"
          className="w-full rounded-md border border-midnight-border bg-midnight-surface px-3 py-2.5 text-sm text-midnight-text placeholder:text-midnight-muted/60 focus:outline-none focus:ring-2 focus:ring-midnight-red focus:border-midnight-red disabled:opacity-50 disabled:cursor-not-allowed resize-y min-h-[120px]"
        />
        <p id="nl-help" className="text-xs text-midnight-muted">
          Write naturally — include product names, quantities, units, preferred brands, delivery location and budget.
        </p>
      </div>

      {/* Example prompts */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-midnight-muted">
          Example prompts
        </p>
        <div className="space-y-2">
          {NL_EXAMPLES.map((ex, i) => (
            <button
              key={i}
              type="button"
              onClick={() => fillExample(ex)}
              disabled={submitting || success}
              className="w-full text-left text-xs text-midnight-muted border border-midnight-border rounded-md px-3 py-2 bg-midnight-surface hover:border-slate-500 hover:text-midnight-text transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Submit */}
      <Button
        type="submit"
        variant="primary"
        disabled={submitting || success || !text.trim()}
        data-testid="nl-submit-button"
        className="w-full sm:w-auto"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
            Submitting…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" aria-hidden="true" />
            Extract with AI
          </>
        )}
      </Button>
    </form>
  );
}

// ─── Tab 2: Document Upload ───────────────────────────────────────────────────

function DocumentUploadTab() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFileSelect = useCallback((selectedFile) => {
    setError(null);
    setFileError(null);
    setFile(null);
    setUploadDone(false);

    try {
      validateUploadFile(selectedFile);
      setFile(selectedFile);
    } catch (err) {
      setFileError(err.message);
    }
  }, []);

  const onInputChange = (e) => {
    const f = e.target.files?.[0];
    if (f) handleFileSelect(f);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelect(f);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = () => setDragOver(false);

  const clearFile = () => {
    setFile(null);
    setFileError(null);
    setUploadDone(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUploadAndCreate = async () => {
    if (!file || uploading || success) return;

    setUploading(true);
    setError(null);

    try {
      // Step 1: upload document (SAH-01 /api/uploads)
      const uploadRes = await uploadDocument(file);
      const uploadData = uploadRes?.data?.data || uploadRes?.data;
      const uploadId = uploadData?._id || uploadData?.uploadId || uploadRes?.data?.uploadId;
      setUploadDone(true);

      // Step 2: create requirement linked to upload (SAH-02 /api/requirements)
      const createRes = await createRequirementFromUpload(
        uploadId,
        file.name.replace(/\.[^.]+$/, '')
      );

      // Step 3: trigger AI extraction on document (SAH-04 /api/requirements/:id/extract)
      const reqData = createRes?.data?.data || createRes?.data?.requirement || createRes?.data;
      const reqId = reqData?._id || reqData?.id;
      if (reqId) {
        try {
          await triggerExtraction(reqId);
        } catch {
          // Extraction will be reflected as NEEDS_REVIEW or FAILED_EXTRACTION on list
        }
      }

      setSuccess(true);
      setTimeout(() => navigate('/requirements'), 1500);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Upload failed. Please try again.'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-5">
      {success && (
        <SuccessBanner message="Document uploaded and requirement created! AI extraction is running. Redirecting…" />
      )}
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {fileError && (
        <Alert variant="error" data-testid="file-error-banner">
          <AlertTitle>Invalid file</AlertTitle>
          <AlertDescription>{fileError}</AlertDescription>
        </Alert>
      )}

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop zone for document upload"
        data-testid="drop-zone"
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer select-none ${
          dragOver
            ? 'border-midnight-red bg-red-950/20'
            : 'border-midnight-border bg-midnight-surface hover:border-slate-500 hover:bg-midnight-elevated'
        } ${uploading || success ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <FileUp
          className={`h-10 w-10 ${dragOver ? 'text-midnight-red' : 'text-midnight-muted'}`}
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-medium text-midnight-text">
            Drop your invoice or document here
          </p>
          <p className="text-xs text-midnight-muted mt-1">
            or click to browse — PDF, PNG, JPG, WEBP · max {formatFileSize(MAX_UPLOAD_BYTES)}
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          id="doc-upload-input"
          data-testid="file-input"
          accept={ALLOWED_UPLOAD_EXTENSIONS.join(',')}
          onChange={onInputChange}
          className="sr-only"
          aria-label="Upload document file"
          tabIndex={-1}
        />
      </div>

      {/* Selected file preview */}
      {file && !success && (
        <div
          className="flex items-center gap-3 rounded-lg border border-midnight-border bg-midnight-card px-4 py-3"
          data-testid="selected-file"
        >
          <FileUp className="h-5 w-5 text-midnight-muted flex-shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-midnight-text truncate">{file.name}</p>
            <p className="text-xs text-midnight-muted">{formatFileSize(file.size)}</p>
          </div>
          {uploadDone && (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" aria-hidden="true" />
          )}
          <button
            type="button"
            onClick={clearFile}
            disabled={uploading}
            aria-label="Remove selected file"
            className="text-midnight-muted hover:text-midnight-text disabled:opacity-40 focus:outline-none focus-visible:ring-1 focus-visible:ring-midnight-red rounded"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Upload button */}
      <Button
        type="button"
        variant="primary"
        disabled={!file || !!fileError || uploading || success}
        onClick={handleUploadAndCreate}
        data-testid="upload-submit-button"
        className="w-full sm:w-auto"
      >
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
            {uploadDone ? 'Creating requirement…' : 'Uploading…'}
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
            Upload &amp; Extract with AI
          </>
        )}
      </Button>
    </div>
  );
}

// ─── Tab 3: Structured Form ───────────────────────────────────────────────────

function StructuredFormTab() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: '',
    productName: '',
    category: '',
    quantity: '',
    unit: '',
    budgetMax: '',
    deliveryLocation: '',
    requiredByDate: '',
    notes: '',
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [success, setSuccess] = useState(false);

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = () => {
    const errs = {};
    if (!form.productName.trim()) errs.productName = 'Product name is required.';
    if (!form.quantity || isNaN(Number(form.quantity)) || Number(form.quantity) <= 0) {
      errs.quantity = 'Enter a valid quantity greater than 0.';
    }
    if (!form.unit) errs.unit = 'Select a unit of measurement.';
    if (form.budgetMax && (isNaN(Number(form.budgetMax)) || Number(form.budgetMax) <= 0)) {
      errs.budgetMax = 'Enter a valid budget amount.';
    }
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    setApiError(null);

    try {
      await createRequirementFromForm({
        title: form.title.trim() || undefined,
        productName: form.productName.trim(),
        category: form.category || undefined,
        quantity: Number(form.quantity),
        unit: form.unit,
        budgetMax: form.budgetMax ? Number(form.budgetMax) : undefined,
        deliveryLocation: form.deliveryLocation.trim() || undefined,
        deliveryArea: form.deliveryLocation.trim() || undefined,
        requiredByDate: form.requiredByDate || undefined,
        requiredBy: form.requiredByDate || undefined,
        notes: form.notes.trim() || undefined,
      });
      setSuccess(true);
      setTimeout(() => navigate('/requirements'), 1500);
    } catch (err) {
      setApiError(getApiErrorMessage(err, 'Failed to submit requirement. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {success && (
        <SuccessBanner message="Requirement created successfully! Redirecting…" />
      )}
      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Title */}
      <Input
        label="Requirement Title (optional)"
        id="form-title"
        placeholder="e.g. Monthly dry goods order"
        value={form.title}
        onChange={set('title')}
        disabled={submitting || success}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Product name */}
        <Input
          label="Product Name *"
          id="form-product"
          data-testid="form-product-name"
          placeholder="e.g. Basmati Rice (India Gate)"
          value={form.productName}
          onChange={set('productName')}
          error={errors.productName}
          disabled={submitting || success}
        />

        {/* Category */}
        <Select
          label="Category"
          id="form-category"
          options={CATEGORY_OPTIONS}
          placeholder="Select category"
          value={form.category}
          onChange={set('category')}
          disabled={submitting || success}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Quantity */}
        <Input
          label="Quantity *"
          id="form-quantity"
          data-testid="form-quantity"
          type="number"
          min="1"
          step="1"
          placeholder="e.g. 50"
          value={form.quantity}
          onChange={set('quantity')}
          error={errors.quantity}
          disabled={submitting || success}
        />

        {/* Unit */}
        <Select
          label="Unit *"
          id="form-unit"
          options={UNIT_OPTIONS}
          placeholder="Select unit"
          value={form.unit}
          onChange={set('unit')}
          error={errors.unit}
          disabled={submitting || success}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Budget max */}
        <Input
          label="Max Budget (₹, optional)"
          id="form-budget"
          type="number"
          min="1"
          step="any"
          placeholder="e.g. 45000"
          value={form.budgetMax}
          onChange={set('budgetMax')}
          error={errors.budgetMax}
          disabled={submitting || success}
        />

        {/* Required by date */}
        <Input
          label="Required By (optional)"
          id="form-date"
          type="date"
          value={form.requiredByDate}
          onChange={set('requiredByDate')}
          disabled={submitting || success}
        />
      </div>

      {/* Delivery Area / Location */}
      <Input
        label="Delivery Area / City (optional)"
        id="form-location"
        placeholder="e.g. Lucknow, Delhi NCR, Mumbai"
        value={form.deliveryLocation}
        onChange={set('deliveryLocation')}
        disabled={submitting || success}
      />

      {/* Notes */}
      <div className="space-y-1.5">
        <label
          htmlFor="form-notes"
          className="block text-xs font-medium uppercase tracking-wide text-midnight-muted"
        >
          Additional Notes (optional)
        </label>
        <textarea
          id="form-notes"
          rows={3}
          placeholder="Brand preferences, packaging requirements, delivery instructions…"
          value={form.notes}
          onChange={set('notes')}
          disabled={submitting || success}
          className="w-full rounded-md border border-midnight-border bg-midnight-surface px-3 py-2.5 text-sm text-midnight-text placeholder:text-midnight-muted/60 focus:outline-none focus:ring-2 focus:ring-midnight-red focus:border-midnight-red disabled:opacity-50 disabled:cursor-not-allowed resize-y min-h-[80px]"
        />
      </div>

      <Button
        type="submit"
        variant="primary"
        disabled={submitting || success}
        data-testid="form-submit-button"
        className="w-full sm:w-auto"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
            Submitting…
          </>
        ) : (
          <>
            <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
            Create Requirement
          </>
        )}
      </Button>
    </form>
  );
}

// ─── Tab 4: CSV Bulk Import ───────────────────────────────────────────────────

function CsvImportTab() {
  const navigate = useNavigate();
  const csvInputRef = useRef(null);

  const [csvFile, setCsvFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const handleCsvSelect = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setResult(null);
    const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
    if (ext !== '.csv' && f.type !== 'text/csv') {
      setError('Only CSV files are accepted for bulk import.');
      setCsvFile(null);
      return;
    }
    setCsvFile(f);
  };

  const handleImport = async () => {
    if (!csvFile || submitting) return;
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const res = await importRequirementsFromCsv(csvFile);
      // Support backend APIResponse { data: { totalImported: N, requirements: [] } }
      // as well as { created: N, failed: M }
      const data = res?.data?.data !== undefined ? res.data.data : res?.data;
      const totalCreated = data?.totalImported ?? data?.created ?? 0;
      const totalFailed = data?.failed ?? 0;

      setResult({
        created: totalCreated,
        failed: totalFailed,
      });

      if (totalCreated > 0) {
        setTimeout(() => navigate('/requirements'), 2000);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'CSV import failed. Please check the file and try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {result && (
        <Alert variant={result.failed === 0 ? 'success' : 'warning'} data-testid="csv-result">
          <AlertTitle>
            {result.created} requirement{result.created !== 1 ? 's' : ''} imported
            {result.failed > 0 && `, ${result.failed} failed`}
          </AlertTitle>
          <AlertDescription>
            {result.created > 0 && 'Redirecting to your requirements list…'}
            {result.failed > 0 && ' Some rows could not be imported. Check the file and try again.'}
          </AlertDescription>
        </Alert>
      )}

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Template hint matching SAH-02 csvParser */}
      <Alert variant="info">
        <AlertTitle>CSV Template</AlertTitle>
        <AlertDescription>
          Supported columns:{' '}
          <code className="font-mono text-xs">
            productName, category, requestedQuantity, quantityUnit, deliveryArea, packSize, material, requiredBy, notes
          </code>
          . The <code className="font-mono text-xs">productName</code> and{' '}
          <code className="font-mono text-xs">requestedQuantity</code> (or quantity) columns are required.
        </AlertDescription>
      </Alert>

      {/* File picker */}
      <div className="space-y-3">
        <label
          htmlFor="csv-input"
          className="block text-xs font-medium uppercase tracking-wide text-midnight-muted"
        >
          Select CSV File
        </label>
        <div className="flex items-center gap-3">
          <input
            ref={csvInputRef}
            type="file"
            id="csv-input"
            data-testid="csv-input"
            accept=".csv,text/csv"
            onChange={handleCsvSelect}
            disabled={submitting}
            className="block text-sm text-midnight-muted file:mr-3 file:py-2 file:px-3 file:rounded-md file:border file:border-midnight-border file:text-xs file:font-medium file:bg-midnight-surface file:text-midnight-text hover:file:bg-midnight-elevated cursor-pointer disabled:opacity-50"
            aria-label="Select CSV file for bulk import"
          />
          {csvFile && (
            <button
              type="button"
              onClick={() => {
                setCsvFile(null);
                if (csvInputRef.current) csvInputRef.current.value = '';
              }}
              className="text-midnight-muted hover:text-midnight-text focus:outline-none focus-visible:ring-1 focus-visible:ring-midnight-red rounded"
              aria-label="Remove selected CSV"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {csvFile && (
          <p className="text-xs text-midnight-muted" data-testid="csv-filename">
            {csvFile.name} — {formatFileSize(csvFile.size)}
          </p>
        )}
      </div>

      <Button
        type="button"
        variant="primary"
        disabled={!csvFile || submitting}
        onClick={handleImport}
        data-testid="csv-import-button"
        className="w-full sm:w-auto"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
            Importing…
          </>
        ) : (
          <>
            <FileSpreadsheet className="h-4 w-4 mr-2" aria-hidden="true" />
            Import Requirements
          </>
        )}
      </Button>
    </div>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function RequirementCreatePage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('natural-language');

  return (
    <div className="max-w-3xl space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/requirements')}
          className="inline-flex items-center text-sm text-midnight-muted hover:text-midnight-text transition-colors w-fit focus:outline-none focus-visible:ring-2 focus-visible:ring-midnight-red rounded"
          aria-label="Back to requirements list"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Back to Requirements
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-midnight-text">Create Requirement</h1>
        <p className="text-sm text-midnight-muted mt-1">
          Choose how you want to submit your purchasing requirement.
        </p>
      </div>

      {/* 4-tab intake card */}
      <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-6">
        <Tabs
          defaultValue="natural-language"
          value={activeTab}
          onValueChange={setActiveTab}
        >
          <TabsList className="flex flex-wrap gap-1 h-auto" data-testid="intake-tabs">
            <TabsTrigger value="natural-language" data-testid="tab-nl">
              <MessageSquare className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              Natural Language
            </TabsTrigger>
            <TabsTrigger value="document-upload" data-testid="tab-doc">
              <Upload className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              Document Upload
            </TabsTrigger>
            <TabsTrigger value="structured-form" data-testid="tab-form">
              <FileText className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              Structured Form
            </TabsTrigger>
            <TabsTrigger value="csv-import" data-testid="tab-csv">
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              CSV Import
            </TabsTrigger>
          </TabsList>

          <TabsContent value="natural-language">
            <NaturalLanguageTab />
          </TabsContent>

          <TabsContent value="document-upload">
            <DocumentUploadTab />
          </TabsContent>

          <TabsContent value="structured-form">
            <StructuredFormTab />
          </TabsContent>

          <TabsContent value="csv-import">
            <CsvImportTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
