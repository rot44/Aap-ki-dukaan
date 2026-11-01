import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Building2,
  ShieldCheck,
  Database,
  Truck,
  Clock,
  Calendar,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ArrowLeft,
  Package,
  Layers,
  MapPin,
  Mail,
  Phone,
  FileText,
  SlidersHorizontal,
  ChevronRight,
  ExternalLink,
  Users,
} from 'lucide-react';

import {
  getSupplierById,
  getOffersBySupplier,
  requestQuote,
  QUOTE_REQUEST_REASONS,
  DELIVERY_AREAS,
  getApiErrorMessage,
  isOfferExpired,
  resolveOfferProvenance,
  calculateOfferLandedCost,
} from '@/api/suppliers.api';

import { formatMinorToMajor } from '@/utils/money';
import { calcRetailerMoq, calcStepMultiple } from '@/utils/moqMath';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/Dialog';

// ─── Custom / Updated Quote Request Modal ─────────────────────────────────────
function CustomQuoteModal({
  isOpen,
  onClose,
  supplier,
  offers,
  preselectedOffer,
}) {
  const [selectedProductId, setSelectedProductId] = useState('');
  const [requestedQuantity, setRequestedQuantity] = useState(100);
  const [deliveryArea, setDeliveryArea] = useState('DELHI_NCR');
  const [targetDeliveryDate, setTargetDeliveryDate] = useState('');
  const [requestReason, setRequestReason] = useState('NO_COMPATIBLE_OFFER');
  const [requestNotes, setRequestNotes] = useState('');

  const [validationErrors, setValidationErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [createdQuote, setCreatedQuote] = useState(null);

  // Available products from the supplier's active offers
  const productOptions = useMemo(() => {
    const map = new Map();
    offers.forEach((off) => {
      const prodId = off.productId?._id || off.productId?.id || off.productId;
      const name = off.productId?.canonicalName || off.supplierProductDescription || 'Wholesale Product';
      if (prodId && !map.has(String(prodId))) {
        map.set(String(prodId), {
          value: String(prodId),
          label: `${name} (${off.packUnit || 'UNIT'})`,
          offerId: off._id || off.id,
          defaultQuantity: off.computedRetailerMoq || off.minimumOrderQuantity || 100,
          packUnit: off.packUnit || 'UNIT',
        });
      }
    });
    return Array.from(map.values());
  }, [offers]);

  // Synchronize initial state when modal opens or preselectedOffer changes
  useEffect(() => {
    if (isOpen) {
      setCreatedQuote(null);
      setSubmitError(null);
      setValidationErrors({});

      if (preselectedOffer) {
        const pId = preselectedOffer.productId?._id || preselectedOffer.productId?.id || preselectedOffer.productId;
        setSelectedProductId(pId ? String(pId) : '');
        setRequestedQuantity(
          preselectedOffer.computedRetailerMoq ||
          preselectedOffer.minimumOrderQuantity ||
          100
        );
        if (Array.isArray(preselectedOffer.deliveryAreas) && preselectedOffer.deliveryAreas.length > 0) {
          setDeliveryArea(preselectedOffer.deliveryAreas[0]);
        }
        if (isOfferExpired(preselectedOffer)) {
          setRequestReason('STALE_QUOTE');
        } else {
          setRequestReason('VOLUME_DISCOUNT');
        }
      } else if (productOptions.length > 0) {
        setSelectedProductId(productOptions[0].value);
        setRequestedQuantity(productOptions[0].defaultQuantity || 100);
        setRequestReason('NO_COMPATIBLE_OFFER');
      }

      // Default delivery area to supplier's primary service area
      if (Array.isArray(supplier?.serviceAreas) && supplier.serviceAreas.length > 0) {
        setDeliveryArea(supplier.serviceAreas[0]);
      }
    }
  }, [isOpen, preselectedOffer, productOptions, supplier]);

  // Validation
  const validateForm = () => {
    const errors = {};
    if (!selectedProductId) {
      errors.productId = 'Please select a product for the quote request.';
    }
    const qtyNum = Number(requestedQuantity);
    if (!requestedQuantity || isNaN(qtyNum) || qtyNum <= 0 || !Number.isInteger(qtyNum)) {
      errors.requestedQuantity = 'Requested quantity must be a positive whole number (e.g. 100).';
    }
    if (!deliveryArea || !deliveryArea.trim()) {
      errors.deliveryArea = 'Delivery area is required.';
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        supplierId: supplier._id || supplier.id,
        productId: selectedProductId,
        supplierOfferId: preselectedOffer?._id || preselectedOffer?.id || undefined,
        requestedQuantity: Number(requestedQuantity),
        deliveryArea: deliveryArea.trim().toUpperCase(),
        targetDeliveryDate: targetDeliveryDate ? new Date(targetDeliveryDate).toISOString() : undefined,
        requestReason,
        requestNotes: requestNotes.trim(),
        currency: 'INR',
      };

      const res = await requestQuote(payload);
      const data = res?.data?.data !== undefined ? res.data.data : res?.data;
      setCreatedQuote(data || { status: 'REQUESTED' });
    } catch (err) {
      setSubmitError(getApiErrorMessage(err, 'Failed to submit quote request. Please review your details and try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto" data-testid="custom-quote-modal">
        <DialogHeader>
          <div className="flex items-start justify-between border-b border-midnight-border/70 pb-3">
            <div>
              <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-midnight-red" />
                Request Custom / Updated Quote
              </DialogTitle>
              <DialogDescription className="text-xs text-midnight-muted mt-1">
                Submit specific volume, delivery, or custom packaging requirements directly to{' '}
                <span className="text-slate-200 font-medium">{supplier?.name}</span>.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* ── Success Banner ── */}
        {createdQuote ? (
          <div className="space-y-4 py-4" data-testid="quote-success-banner">
            <Alert variant="success" className="border-emerald-500/40 bg-emerald-950/20">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <AlertTitle className="text-white text-sm font-semibold">
                Quote Request Submitted Successfully
              </AlertTitle>
              <AlertDescription className="text-xs text-slate-300 mt-1 leading-relaxed">
                Your quote request <strong className="text-white font-mono">#{createdQuote._id || createdQuote.id || 'CONFIRMED'}</strong> has been registered with status{' '}
                <Badge variant="pool" className="text-[11px] py-0 ml-1">
                  {createdQuote.status || 'REQUESTED'}
                </Badge>
                . The supplier will be notified to review your terms and reply with formal pricing and fulfillment SLA.
              </AlertDescription>
            </Alert>

            <div className="rounded-lg border border-midnight-border bg-midnight-surface/80 p-3 space-y-1.5 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-midnight-muted">Supplier:</span>
                <span className="font-semibold text-white">{supplier?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-midnight-muted">Requested Quantity:</span>
                <span className="font-mono font-semibold text-white">{requestedQuantity} units</span>
              </div>
              <div className="flex justify-between">
                <span className="text-midnight-muted">Delivery Area:</span>
                <span className="text-white">{deliveryArea}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-midnight-muted">Reason:</span>
                <span className="text-white">{QUOTE_REQUEST_REASONS.find(r => r.value === requestReason)?.label || requestReason}</span>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                variant="primary"
                size="sm"
                onClick={onClose}
                data-testid="quote-success-close-button"
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4 pt-2" data-testid="quote-request-form">
            {/* API Error Notification */}
            {submitError && (
              <Alert variant="error" data-testid="quote-submit-error">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Could Not Submit Quote Request</AlertTitle>
                <AlertDescription className="text-xs">{submitError}</AlertDescription>
              </Alert>
            )}

            {/* Supplier Info Badge */}
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-midnight-surface/60 border border-midnight-border/60 text-xs">
              <Building2 className="h-4 w-4 text-midnight-red shrink-0" />
              <div className="flex-1 truncate">
                <span className="text-midnight-muted">Supplier: </span>
                <strong className="text-white font-medium">{supplier?.name}</strong>
              </div>
              <Badge variant="outline" className="text-[10px] text-slate-400">
                {supplier?.serviceAreas?.join(', ') || 'Regional'}
              </Badge>
            </div>

            {/* Product Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-midnight-text block" htmlFor="quote-product-select">
                Target Product <span className="text-midnight-red">*</span>
              </label>
              {productOptions.length > 0 ? (
                <Select
                  id="quote-product-select"
                  data-testid="quote-product-select"
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    const chosen = productOptions.find((p) => p.value === e.target.value);
                    if (chosen?.defaultQuantity) {
                      setRequestedQuantity(chosen.defaultQuantity);
                    }
                  }}
                  options={[
                    { value: '', label: 'Select a product...' },
                    ...productOptions,
                  ]}
                  className="text-xs"
                />
              ) : (
                <p className="text-xs text-amber-400 italic">
                  No active products found for this supplier. Please specify details in the notes below.
                </p>
              )}
              {validationErrors.productId && (
                <p className="text-[11px] text-rose-400" data-testid="error-product-id">
                  {validationErrors.productId}
                </p>
              )}
            </div>

            {/* Quantity and Delivery Area Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Requested Quantity */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-midnight-text block" htmlFor="quote-quantity-input">
                  Requested Volume (Units) <span className="text-midnight-red">*</span>
                </label>
                <Input
                  id="quote-quantity-input"
                  type="number"
                  min="1"
                  step="1"
                  data-testid="quote-quantity-input"
                  value={requestedQuantity}
                  onChange={(e) => setRequestedQuantity(e.target.value)}
                  placeholder="e.g. 500"
                  className="text-xs"
                />
                {validationErrors.requestedQuantity && (
                  <p className="text-[11px] text-rose-400" data-testid="error-requested-quantity">
                    {validationErrors.requestedQuantity}
                  </p>
                )}
              </div>

              {/* Delivery Area */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-midnight-text block" htmlFor="quote-delivery-area-select">
                  Destination Region <span className="text-midnight-red">*</span>
                </label>
                <Select
                  id="quote-delivery-area-select"
                  data-testid="quote-delivery-area-select"
                  value={deliveryArea}
                  onChange={(e) => setDeliveryArea(e.target.value)}
                  options={DELIVERY_AREAS.filter((a) => a.value !== 'ALL')}
                  className="text-xs"
                />
                {validationErrors.deliveryArea && (
                  <p className="text-[11px] text-rose-400" data-testid="error-delivery-area">
                    {validationErrors.deliveryArea}
                  </p>
                )}
              </div>
            </div>

            {/* Request Reason and Target Delivery Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Request Reason */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-midnight-text block" htmlFor="quote-reason-select">
                  Reason for Request
                </label>
                <Select
                  id="quote-reason-select"
                  data-testid="quote-reason-select"
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  options={QUOTE_REQUEST_REASONS}
                  className="text-xs"
                />
              </div>

              {/* Target Delivery Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-midnight-text block" htmlFor="quote-target-date-input">
                  Desired Delivery Date <span className="text-midnight-muted text-[10px]">(optional)</span>
                </label>
                <Input
                  id="quote-target-date-input"
                  type="date"
                  data-testid="quote-target-date-input"
                  value={targetDeliveryDate}
                  onChange={(e) => setTargetDeliveryDate(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            {/* Request Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-midnight-text block" htmlFor="quote-notes-textarea">
                Commercial Requirements & Notes <span className="text-midnight-muted text-[10px]">(optional)</span>
              </label>
              <textarea
                id="quote-notes-textarea"
                data-testid="quote-notes-textarea"
                rows={3}
                value={requestNotes}
                onChange={(e) => setRequestNotes(e.target.value)}
                placeholder="Mention specific grade, packaging preferences, recurring cadence, or payment terms..."
                className="w-full rounded-md border border-midnight-border bg-midnight-card px-3 py-2 text-xs text-midnight-text placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-midnight-red"
              />
            </div>

            <DialogFooter className="pt-3 border-t border-midnight-border/60 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={isSubmitting}
                data-testid="quote-cancel-button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isSubmitting}
                data-testid="quote-submit-button"
                className="font-semibold"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
                    Submitting Request...
                  </>
                ) : (
                  'Submit Quote Request'
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Supplier Detail Page Component ──────────────────────────────────────
export default function SupplierDetailPage() {
  const { supplierId } = useParams();
  const navigate = useNavigate();

  const [supplier, setSupplier] = useState(null);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Quote Request Modal State
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [selectedOfferForQuote, setSelectedOfferForQuote] = useState(null);

  // Fetch Supplier profile and associated offers
  const fetchSupplierData = useCallback(async () => {
    if (!supplierId) return;

    setLoading(true);
    setError(null);

    try {
      // 1. Fetch Supplier details
      const supplierRes = await getSupplierById(supplierId);
      const supplierData =
        supplierRes?.data?.data !== undefined ? supplierRes.data.data : supplierRes?.data;

      if (!supplierData) {
        setError('Supplier record not found.');
        setSupplier(null);
        setOffers([]);
        return;
      }
      setSupplier(supplierData);

      // 2. Fetch Supplier's active offers
      const offersRes = await getOffersBySupplier(supplierId, { includeExpired: true, limit: 100 });
      setOffers(offersRes.offers || []);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to retrieve supplier profile.'));
      setSupplier(null);
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    fetchSupplierData();
  }, [fetchSupplierData]);

  // Open custom quote modal for a specific offer
  const handleOpenQuoteForOffer = (offer) => {
    setSelectedOfferForQuote(offer);
    setIsQuoteModalOpen(true);
  };

  // Open custom quote modal from header (no preselected offer)
  const handleOpenGenericQuote = () => {
    setSelectedOfferForQuote(null);
    setIsQuoteModalOpen(true);
  };

  // Start Group-Buy Pool with this offer
  const handleStartGroupBuy = (offerId) => {
    if (!offerId) return;
    navigate(`/group-buys/create?offerId=${encodeURIComponent(offerId)}`);
  };

  // Provenance resolution for the supplier
  const supplierProvenance = supplier ? resolveOfferProvenance(supplier) : null;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20" data-testid="supplier-detail-page">
      {/* ── Breadcrumb Navigation ── */}
      <div className="flex items-center gap-2 text-xs text-midnight-muted">
        <Link
          to="/suppliers"
          className="hover:text-midnight-text flex items-center gap-1 transition-colors"
          data-testid="back-to-catalogue-breadcrumb"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Wholesale Catalogue
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-white truncate max-w-xs font-medium">
          {supplier?.name || 'Supplier Profile'}
        </span>
      </div>

      {/* ── Loading Skeleton State ── */}
      {loading ? (
        <div className="space-y-6" data-testid="supplier-loading-skeleton">
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4">
            <div className="flex justify-between items-center">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-6 w-28 rounded-full" />
            </div>
            <Skeleton className="h-4 w-96" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        </div>
      ) : error ? (
        /* ── Error / Not Found State ── */
        <Alert variant="error" data-testid="supplier-error-state" className="p-6">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle className="text-base font-semibold">Supplier Information Unavailable</AlertTitle>
          <AlertDescription className="text-xs mt-1">{error}</AlertDescription>
          <div className="mt-4 flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={fetchSupplierData}
              data-testid="retry-supplier-button"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry Loading
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate('/suppliers')}
              data-testid="back-catalogue-button"
            >
              Return to Catalogue
            </Button>
          </div>
        </Alert>
      ) : supplier ? (
        /* ── Populated Supplier Profile ── */
        <div className="space-y-6">
          {/* Supplier Header Banner */}
          <div
            className="rounded-xl border border-midnight-border bg-midnight-card p-5 sm:p-6 shadow-sm space-y-4"
            data-testid="supplier-profile-header"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-midnight-border/60 pb-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-2">
                    <Building2 className="h-7 w-7 text-midnight-red" />
                    <span data-testid="supplier-name">{supplier.name}</span>
                  </h1>

                  {/* Provenance Badge */}
                  {supplierProvenance && (
                    <Badge
                      variant={supplierProvenance.variant}
                      data-testid="supplier-provenance-badge"
                      className="text-xs font-semibold px-2.5 py-0.5"
                      title={supplierProvenance.description}
                    >
                      {supplierProvenance.label === 'VERIFIED LIVE' && (
                        <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                      )}
                      {supplierProvenance.label === 'SUPPLIER SUBMITTED' && (
                        <Building2 className="h-3.5 w-3.5 mr-1" />
                      )}
                      {supplierProvenance.label === 'DEMO SAMPLE DATA' && (
                        <Database className="h-3.5 w-3.5 mr-1" />
                      )}
                      {supplierProvenance.label}
                    </Badge>
                  )}

                  {/* Active Status Badge */}
                  <Badge
                    variant={supplier.activeStatus === 'ACTIVE' ? 'success' : 'outline'}
                    className="text-[11px]"
                    data-testid="supplier-active-status"
                  >
                    {supplier.activeStatus || 'ACTIVE'}
                  </Badge>
                </div>

                <p className="text-xs text-midnight-muted">
                  Wholesale distributor registered in the Aap Ki Dukan B2B trade network.
                </p>
              </div>

              {/* Action Button: Custom Quote Request */}
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleOpenGenericQuote}
                  data-testid="header-request-quote-button"
                  className="text-xs font-semibold"
                >
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  Request Custom / Updated Quote
                </Button>
              </div>
            </div>

            {/* Profile Meta Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {/* Service Areas */}
              <div className="p-3 rounded-lg bg-midnight-surface/80 border border-midnight-border space-y-1.5" data-testid="supplier-service-areas">
                <span className="text-[11px] font-semibold text-midnight-muted flex items-center gap-1 uppercase tracking-wider">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                  Service & Delivery Regions
                </span>
                <div className="flex flex-wrap gap-1">
                  {Array.isArray(supplier.serviceAreas) && supplier.serviceAreas.length > 0 ? (
                    supplier.serviceAreas.map((area, idx) => (
                      <Badge key={idx} variant="outline" className="text-[11px] text-slate-200 border-slate-700">
                        {area}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-slate-400 italic">Regional fulfillment available</span>
                  )}
                </div>
              </div>

              {/* Verification & Compliance */}
              <div className="p-3 rounded-lg bg-midnight-surface/80 border border-midnight-border space-y-1.5">
                <span className="text-[11px] font-semibold text-midnight-muted flex items-center gap-1 uppercase tracking-wider">
                  <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
                  Compliance & Verification
                </span>
                <div className="space-y-1 text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-midnight-muted">Status:</span>
                    <strong className="text-white" data-testid="verification-status-value">
                      {supplier.verificationStatus || 'DEMO_ONLY'}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-midnight-muted">Data Source:</span>
                    <span className="font-mono text-slate-300">{supplier.dataSourceType || 'SEEDED_DEMO'}</span>
                  </div>
                </div>
              </div>

              {/* Contact Information (Safe subset) */}
              <div className="p-3 rounded-lg bg-midnight-surface/80 border border-midnight-border space-y-1.5">
                <span className="text-[11px] font-semibold text-midnight-muted flex items-center gap-1 uppercase tracking-wider">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  Commercial Representative
                </span>
                <div className="space-y-1 text-slate-300" data-testid="supplier-contact-info">
                  {supplier.contactReference?.contactPerson && (
                    <div className="flex justify-between">
                      <span className="text-midnight-muted">Contact:</span>
                      <span className="text-white font-medium">{supplier.contactReference.contactPerson}</span>
                    </div>
                  )}
                  {supplier.contactReference?.email && (
                    <div className="flex justify-between truncate">
                      <span className="text-midnight-muted">Email:</span>
                      <span className="text-slate-300 truncate max-w-[170px]">{supplier.contactReference.email}</span>
                    </div>
                  )}
                  {supplier.contactReference?.address && (
                    <div className="flex justify-between truncate">
                      <span className="text-midnight-muted">Facility:</span>
                      <span className="text-slate-300 truncate max-w-[170px]">{supplier.contactReference.address}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Active Product Offers Section ── */}
          <div className="space-y-4" data-testid="supplier-offers-section">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
                  <Package className="h-5 w-5 text-midnight-red" />
                  Active Wholesale Offers ({offers.length})
                </h2>
                <p className="text-xs text-midnight-muted mt-0.5">
                  Published catalog listings and verified wholesale lots currently available from this distributor.
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenGenericQuote}
                className="text-xs"
                data-testid="section-request-quote-button"
              >
                <FileText className="h-3 w-3 mr-1" />
                Custom Quote
              </Button>
            </div>

            {/* Empty Offers State */}
            {offers.length === 0 ? (
              <div
                className="rounded-xl border border-dashed border-midnight-border bg-midnight-card/60 p-12 text-center space-y-4"
                data-testid="no-offers-state"
              >
                <div className="inline-flex p-3 rounded-full bg-midnight-surface text-midnight-muted">
                  <Package className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">No Active Catalogue Offers</h3>
                  <p className="text-xs sm:text-sm text-midnight-muted max-w-md mx-auto mt-1">
                    {supplier.name} does not currently have published catalogue lots. You can submit a custom quote request for specific volume pricing.
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleOpenGenericQuote}
                  data-testid="empty-state-quote-button"
                >
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  Request Custom Quote
                </Button>
              </div>
            ) : (
              /* Offers Grid */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="supplier-offers-grid">
                {offers.map((offer) => {
                  const offerId = offer._id || offer.id;
                  const provenance = resolveOfferProvenance(offer);
                  const expired = isOfferExpired(offer);
                  const landed = calculateOfferLandedCost(offer, 1);

                  const wholesaleMoq = Number(offer.minimumOrderQuantity || 1);
                  const retailerMoq =
                    offer.computedRetailerMoq ??
                    calcRetailerMoq(wholesaleMoq, offer.retailerMoqPercentage || 20);
                  const stepMultiple =
                    offer.computedRetailerStep ??
                    calcStepMultiple(wholesaleMoq, offer.retailerStepPercentage || 1);

                  const productName =
                    offer.productId?.canonicalName ||
                    offer.supplierProductDescription ||
                    'Wholesale Product';
                  const category = offer.productId?.category || 'PACKAGING';

                  const expiresDateStr = offer.expiresAt
                    ? new Date(offer.expiresAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : null;

                  return (
                    <div
                      key={offerId}
                      data-testid={`supplier-offer-card-${offerId}`}
                      className={`flex flex-col rounded-xl border bg-midnight-card p-5 space-y-4 shadow-sm transition-all duration-200 ${
                        expired ? 'border-amber-900/40 opacity-85' : 'border-midnight-border hover:border-slate-500'
                      }`}
                    >
                      {/* Card Header: Product Title & Badges */}
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h3
                            className="font-display font-semibold text-base text-white line-clamp-1"
                            data-testid="offer-product-title"
                          >
                            {productName}
                          </h3>
                          <Badge variant="outline" className="text-[10px] shrink-0 text-slate-400 border-slate-700">
                            {category}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge
                            variant={provenance.variant}
                            data-testid={`offer-provenance-${offerId}`}
                            className="text-[10px]"
                          >
                            {provenance.label}
                          </Badge>

                          {expired && (
                            <Badge
                              variant="destructive"
                              data-testid={`offer-expired-badge-${offerId}`}
                              className="text-[10px] bg-rose-950 text-rose-300 border-rose-500/40"
                            >
                              <Clock className="h-3 w-3 mr-1" /> Expired Quote
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Pricing Details */}
                      <div className="p-3 rounded-lg bg-midnight-surface/80 border border-midnight-border space-y-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <div>
                            <span className="text-[11px] text-midnight-muted">Base Unit Price</span>
                            <div className="text-xl font-bold text-white tracking-tight" data-testid="offer-price-val">
                              {formatMinorToMajor(offer.baseUnitPriceMinor || 0, offer.currency || 'INR')}
                              <span className="text-xs font-normal text-midnight-muted ml-1">
                                / {offer.packUnit || 'UNIT'}
                              </span>
                            </div>
                          </div>

                          {offer.packSize && (
                            <div className="text-right">
                              <span className="text-[10px] text-midnight-muted block">Pack Spec</span>
                              <span className="text-xs font-semibold text-slate-200">{offer.packSize}</span>
                            </div>
                          )}
                        </div>

                        {/* Landed Cost Status */}
                        <div className="pt-2 border-t border-midnight-border/60 flex items-center justify-between text-xs text-slate-300">
                          <span className="flex items-center gap-1">
                            <Truck className="h-3 w-3 text-slate-400" />
                            {landed.isShippingKnown ? (
                              <span>
                                Flat Shipping: <strong className="text-white">{formatMinorToMajor(landed.shippingCostMinor, offer.currency || 'INR')}</strong>
                              </span>
                            ) : (
                              <span className="text-amber-400 italic">Shipping Quote Pending</span>
                            )}
                          </span>

                          <span className="text-[11px]">
                            {offer.taxInclusion === 'GST_INCLUDED' ? (
                              <span className="text-emerald-400">GST Included</span>
                            ) : (
                              <span className="text-slate-400">GST Excluded</span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Two-Level MOQ Metrics */}
                      <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                        <div className="p-1.5 rounded bg-midnight-surface/50 border border-midnight-border/70">
                          <span className="text-[9px] text-midnight-muted block uppercase tracking-wider font-mono">MOQ_W</span>
                          <strong className="text-white font-semibold text-xs" data-testid="offer-moq-w">
                            {wholesaleMoq.toLocaleString('en-IN')}
                          </strong>
                          <span className="text-[8px] text-midnight-muted block">Wholesale</span>
                        </div>

                        <div className="p-1.5 rounded bg-midnight-surface/50 border border-midnight-border/70">
                          <span className="text-[9px] text-midnight-muted block uppercase tracking-wider font-mono">MOQ_R</span>
                          <strong className="text-emerald-400 font-semibold text-xs" data-testid="offer-moq-r">
                            {retailerMoq.toLocaleString('en-IN')}
                          </strong>
                          <span className="text-[8px] text-midnight-muted block">Retailer (20%)</span>
                        </div>

                        <div className="p-1.5 rounded bg-midnight-surface/50 border border-midnight-border/70">
                          <span className="text-[9px] text-midnight-muted block uppercase tracking-wider font-mono">STEP</span>
                          <strong className="text-cyan-400 font-semibold text-xs" data-testid="offer-step">
                            {stepMultiple.toLocaleString('en-IN')}
                          </strong>
                          <span className="text-[8px] text-midnight-muted block">Step (1%)</span>
                        </div>
                      </div>

                      {/* Price Breaks if present */}
                      {Array.isArray(offer.quantityTiers) && offer.quantityTiers.length > 0 && (
                        <div className="space-y-1 text-xs">
                          <span className="text-[10px] font-semibold text-midnight-muted uppercase tracking-wider block">
                            Volume Tiers
                          </span>
                          <div className="space-y-1 text-[11px]">
                            {offer.quantityTiers.map((tier, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between px-2 py-0.5 rounded bg-midnight-surface/40 border border-midnight-border/50 text-slate-300 font-mono"
                              >
                                <span>
                                  {tier.minQuantity.toLocaleString('en-IN')}
                                  {tier.maxQuantity ? ` – ${tier.maxQuantity.toLocaleString('en-IN')}` : '+'} units
                                </span>
                                <strong className="text-emerald-400">
                                  {formatMinorToMajor(tier.unitPriceMinor, offer.currency || 'INR')}
                                </strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Expiry and Lead Time Meta */}
                      <div className="pt-2 border-t border-midnight-border/60 flex items-center justify-between text-[11px] text-midnight-muted">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-400" />
                          Lead time: <strong className="text-slate-200">{offer.leadTimeDays || 3}d</strong>
                        </span>
                        {expiresDateStr && (
                          <span className={expired ? 'text-rose-400 font-medium' : 'text-slate-300'}>
                            Expires: {expiresDateStr}
                          </span>
                        )}
                      </div>

                      {/* Action Buttons: Start Group-Buy Pool & Request Custom Quote */}
                      <div className="pt-2 space-y-2 mt-auto">
                        {/* Action 1: Start Group-Buy Pool with This Offer */}
                        <Button
                          variant="primary"
                          size="sm"
                          className="w-full text-xs font-semibold"
                          disabled={expired || !offer.isActive}
                          onClick={() => handleStartGroupBuy(offerId)}
                          data-testid={`start-group-buy-button-${offerId}`}
                        >
                          <Users className="h-3.5 w-3.5 mr-1.5" />
                          {expired ? 'Cannot Start Pool (Quote Expired)' : 'Start Group-Buy Pool with This Offer'}
                        </Button>

                        {/* Action 2: Request Custom / Updated Quote */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs text-slate-300"
                          onClick={() => handleOpenQuoteForOffer(offer)}
                          data-testid={`request-quote-button-${offerId}`}
                        >
                          <FileText className="h-3 w-3 mr-1.5" />
                          Request Custom / Updated Quote
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* ── Custom Quote Request Modal ── */}
      {supplier && (
        <CustomQuoteModal
          isOpen={isQuoteModalOpen}
          onClose={() => {
            setIsQuoteModalOpen(false);
            setSelectedOfferForQuote(null);
          }}
          supplier={supplier}
          offers={offers}
          preselectedOffer={selectedOfferForQuote}
        />
      )}
    </div>
  );
}
