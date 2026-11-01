/**
 * CoBuy AI — Requirements List Page (HIM-07)
 *
 * Route: /requirements  (SHOP_OWNER only)
 *
 * Shows all submitted purchasing requirements with:
 *  - Loading skeleton
 *  - Populated list with status badges and source icons
 *  - Empty state with "Create First Requirement" CTA
 *  - API error state with retry
 *  - "Create Requirement" button → /requirements/new
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  MessageSquare,
  Upload,
  FileSpreadsheet,
  PlusCircle,
  RefreshCw,
  AlertCircle,
  ClipboardList,
  ChevronRight,
  Clock,
  Image as ImageIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
import {
  listRequirements,
  REQUIREMENT_STATUS,
  REQUIREMENT_SOURCE,
  getApiErrorMessage,
} from '@/api/requirements.api';

// ─── Status badge config (SAH-02 Requirement.model.js) ────────────────────────

const STATUS_CONFIG = {
  [REQUIREMENT_STATUS.DRAFT]: {
    label: 'Draft',
    variant: 'neutral',
  },
  [REQUIREMENT_STATUS.PROCESSING]: {
    label: 'Processing',
    variant: 'warning',
  },
  [REQUIREMENT_STATUS.NEEDS_REVIEW]: {
    label: 'Needs Review',
    variant: 'warning',
  },
  [REQUIREMENT_STATUS.CONFIRMED]: {
    label: 'Confirmed',
    variant: 'success',
  },
  [REQUIREMENT_STATUS.FAILED_EXTRACTION]: {
    label: 'Extraction Failed',
    variant: 'error',
  },
  [REQUIREMENT_STATUS.REJECTED]: {
    label: 'Rejected',
    variant: 'error',
  },
  [REQUIREMENT_STATUS.ARCHIVED]: {
    label: 'Archived',
    variant: 'neutral',
  },
};

// ─── Source icon config ──────────────────────────────────────────────────────

const SOURCE_ICON = {
  TEXT: MessageSquare,
  FORM: FileText,
  PDF: Upload,
  IMAGE: ImageIcon,
  CSV: FileSpreadsheet,
  [REQUIREMENT_SOURCE.NATURAL_LANGUAGE]: MessageSquare,
  [REQUIREMENT_SOURCE.DOCUMENT_UPLOAD]: Upload,
  [REQUIREMENT_SOURCE.STRUCTURED_FORM]: FileText,
  [REQUIREMENT_SOURCE.CSV_IMPORT]: FileSpreadsheet,
};

const SOURCE_LABEL = {
  TEXT: 'Natural Language',
  FORM: 'Structured Form',
  PDF: 'Document Upload (PDF)',
  IMAGE: 'Receipt / Image',
  CSV: 'CSV Bulk Import',
  [REQUIREMENT_SOURCE.NATURAL_LANGUAGE]: 'Natural Language',
  [REQUIREMENT_SOURCE.DOCUMENT_UPLOAD]: 'Document Upload',
  [REQUIREMENT_SOURCE.STRUCTURED_FORM]: 'Structured Form',
  [REQUIREMENT_SOURCE.CSV_IMPORT]: 'CSV Import',
};

// ─── Skeleton row ────────────────────────────────────────────────────────────

function RequirementRowSkeleton() {
  return (
    <div
      data-testid="requirement-skeleton"
      className="flex items-center gap-4 rounded-lg border border-midnight-border bg-midnight-card p-4"
    >
      <Skeleton className="h-9 w-9 rounded-md flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-4 w-2/5 rounded" />
        <Skeleton className="h-3 w-1/3 rounded" />
      </div>
      <Skeleton className="h-5 w-24 rounded-full flex-shrink-0" />
      <Skeleton className="h-4 w-4 rounded flex-shrink-0" />
    </div>
  );
}

// ─── Requirement row ─────────────────────────────────────────────────────────

function RequirementRow({ requirement }) {
  const navigate = useNavigate();
  const status = requirement.status || REQUIREMENT_STATUS.DRAFT;
  const source = requirement.sourceType || requirement.source || 'FORM';
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG[REQUIREMENT_STATUS.DRAFT];
  const SourceIcon = SOURCE_ICON[source] || FileText;
  const sourceLabel = SOURCE_LABEL[source] || source;

  // Resolve best available title from confirmed, extracted, or description fields
  const title =
    requirement.title ||
    requirement.productName ||
    requirement.confirmedFields?.productName ||
    requirement.extractedFields?.productName ||
    (requirement.originalDescription
      ? requirement.originalDescription.length > 60
        ? requirement.originalDescription.substring(0, 60) + '…'
        : requirement.originalDescription
      : requirement.naturalLanguageText
      ? requirement.naturalLanguageText.substring(0, 60) + '…'
      : `Requirement #${requirement._id?.slice(-6) || requirement.id?.slice(-6) || '—'}`);

  const quantity =
    requirement.requestedQuantity ||
    requirement.confirmedFields?.requestedQuantity ||
    requirement.extractedFields?.requestedQuantity;

  const unit =
    requirement.quantityUnit ||
    requirement.confirmedFields?.quantityUnit ||
    requirement.extractedFields?.quantityUnit;

  const deliveryArea =
    requirement.deliveryArea ||
    requirement.confirmedFields?.deliveryArea ||
    requirement.extractedFields?.deliveryArea;

  const createdAt = requirement.createdAt
    ? new Date(requirement.createdAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  const reqId = requirement._id || requirement.id;
  const handleOpenDetail = () => {
    if (reqId) {
      navigate(`/requirements/${reqId}`);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpenDetail}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleOpenDetail();
        }
      }}
      className="group flex items-center gap-4 rounded-lg border border-midnight-border bg-midnight-card p-4 hover:border-slate-500 hover:bg-midnight-elevated transition-colors cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-midnight-red"
      aria-label={`Requirement: ${title}`}
      data-testid={`requirement-item-${reqId}`}
    >
      {/* Source icon */}
      <div className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-md bg-midnight-surface border border-midnight-border text-midnight-muted">
        <SourceIcon className="h-4 w-4" aria-hidden="true" />
      </div>

      {/* Title & meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-midnight-text truncate">{title}</p>
        <p className="text-xs text-midnight-muted mt-0.5 truncate">
          <span>{sourceLabel}</span>
          {quantity && unit && (
            <>
              <span className="mx-1.5 text-midnight-border">·</span>
              <span className="font-mono text-midnight-text/90 font-medium">{quantity} {unit}</span>
            </>
          )}
          {deliveryArea && (
            <>
              <span className="mx-1.5 text-midnight-border">·</span>
              <span>{deliveryArea}</span>
            </>
          )}
          {createdAt && (
            <>
              <span className="mx-1.5 text-midnight-border">·</span>
              <Clock className="inline h-3 w-3 mb-0.5 mr-0.5" aria-hidden="true" />
              <span>{createdAt}</span>
            </>
          )}
        </p>
      </div>

      {/* Status badge */}
      <Badge variant={statusCfg.variant} className="flex-shrink-0 text-xs">
        {statusCfg.label}
      </Badge>

      {/* Chevron (detail link — HIM-08 scope) */}
      <ChevronRight
        className="h-4 w-4 text-midnight-muted flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-hidden="true"
      />
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ onCreateClick }) {
  return (
    <div
      data-testid="requirements-empty"
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-midnight-surface border border-midnight-border mb-5">
        <ClipboardList className="h-8 w-8 text-midnight-muted" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-semibold text-midnight-text mb-2">
        No requirements yet
      </h2>
      <p className="text-sm text-midnight-muted max-w-xs mb-6">
        Submit your first purchasing requirement and let the AI extract SKUs,
        quantities and pricing targets automatically.
      </p>
      <Button variant="primary" size="default" onClick={onCreateClick}>
        <PlusCircle className="h-4 w-4 mr-2" aria-hidden="true" />
        Create First Requirement
      </Button>
    </div>
  );
}

// ─── Page component ──────────────────────────────────────────────────────────

export default function RequirementsListPage() {
  const navigate = useNavigate();

  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRequirements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listRequirements();
      // Gracefully support backend APIResponse { data: { requirements: [...] } }
      // as well as flat array [...] or { requirements: [...] }
      const responsePayload = res?.data?.data !== undefined ? res.data.data : res?.data;
      const list = Array.isArray(responsePayload)
        ? responsePayload
        : Array.isArray(responsePayload?.requirements)
        ? responsePayload.requirements
        : Array.isArray(res?.data?.requirements)
        ? res.data.requirements
        : [];
      setRequirements(list);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load requirements. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequirements();
  }, [fetchRequirements]);

  const handleCreate = () => navigate('/requirements/new');

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading requirements">
        {/* Page header skeleton */}
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-2">
            <Skeleton className="h-7 w-56 rounded" />
            <Skeleton className="h-4 w-72 rounded" />
          </div>
          <Skeleton className="h-10 w-40 rounded-md" />
        </div>

        {/* Row skeletons */}
        <div className="space-y-3">
          {[1, 2, 3, 4].map((n) => (
            <RequirementRowSkeleton key={n} />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-midnight-text">Requirements</h1>
            <p className="text-sm text-midnight-muted mt-1">
              AI-assisted purchasing requirement intake
            </p>
          </div>
        </div>

        <Alert variant="error" data-testid="requirements-error">
          <AlertTitle>Failed to load requirements</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>

        <Button
          variant="outline"
          onClick={fetchRequirements}
          data-testid="retry-button"
        >
          <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  }

  // ── Populated / empty list ─────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-midnight-text">Requirements</h1>
          <p className="text-sm text-midnight-muted mt-1">
            {requirements.length > 0
              ? `${requirements.length} purchasing requirement${requirements.length === 1 ? '' : 's'}`
              : 'AI-assisted purchasing requirement intake'}
          </p>
        </div>

        {requirements.length > 0 && (
          <Button
            variant="primary"
            onClick={handleCreate}
            data-testid="create-requirement-button"
          >
            <PlusCircle className="h-4 w-4 mr-2" aria-hidden="true" />
            Create Requirement
          </Button>
        )}
      </div>

      {/* Content */}
      {requirements.length === 0 ? (
        <EmptyState onCreateClick={handleCreate} />
      ) : (
        <div
          className="space-y-3"
          role="list"
          aria-label="Purchasing requirements"
          data-testid="requirements-list"
        >
          {requirements.map((req) => (
            <div
              key={req._id || req.id}
              role="listitem"
            >
              <RequirementRow requirement={req} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
