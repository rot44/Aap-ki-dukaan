/**
 * HIM-10 — Supplier Detail Page & Custom Quote Request Modal UI Tests
 *
 * Verifies:
 *  1. Supplier detail loading skeleton
 *  2. Correct supplier information rendering (name, contact, service areas)
 *  3. Supplier verification badge (dataSourceType + verificationStatus)
 *  4. Service area display
 *  5. Active supplier offers rendering (product name, price, MOQ)
 *  6. Supplier with no active offers (empty state)
 *  7. Supplier not found (error state + retry)
 *  8. API error -> retry button
 *  9. Navigation from catalogue link to /suppliers/:supplierId (data-testid="supplier-link-*")
 * 10. Opening custom quote modal (data-testid="header-request-quote-button")
 * 11. Closing custom quote modal
 * 12. Prefilled quote fields from preselected offer (STALE_QUOTE reason for expired)
 * 13. Form validation (missing productId, invalid quantity, missing deliveryArea)
 * 14. Successful quote submission -> success banner with quote _id
 * 15. Failed quote submission -> error message displayed
 * 16. Duplicate submission prevention (submit button disabled while isSubmitting)
 * 17. Actual request payload sent to POST /api/quotes/requests
 * 18. Group-buy navigation with correct offerId query param
 * 19. Expired offer "Start Group-Buy" button is disabled
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

// ── Mock the suppliers API module ─────────────────────────────────────────────
vi.mock('@/api/suppliers.api', () => ({
  QUOTE_REQUEST_REASONS: [
    { value: 'NO_COMPATIBLE_OFFER', label: 'No Compatible Offer Available' },
    { value: 'STALE_QUOTE', label: 'Stale / Expired Quote (Request Refresh)' },
    { value: 'CUSTOM_SPECS', label: 'Custom Specifications or Packaging' },
    { value: 'VOLUME_DISCOUNT', label: 'Volume Discount for Larger Order' },
    { value: 'UNDER_MOQ_POOL', label: 'Under-MOQ Fulfillment Request' },
    { value: 'OTHER', label: 'Other Commercial Requirement' },
  ],
  DELIVERY_AREAS: [
    { value: 'ALL', label: 'All Delivery Areas' },
    { value: 'DELHI_NCR', label: 'Delhi NCR' },
    { value: 'MUMBAI_METRO', label: 'Mumbai Metro' },
    { value: 'BANGALORE', label: 'Bangalore' },
  ],
  CATEGORY_OPTIONS: [
    { value: 'ALL', label: 'All Categories' },
    { value: 'PACKAGING', label: 'Packaging Materials' },
    { value: 'GRAINS', label: 'Grains & Rice' },
  ],
  SORT_OPTIONS: {
    LOWEST_LANDED_COST: 'LOWEST_LANDED_COST',
    LOWEST_MOQ: 'LOWEST_MOQ',
    FRESHEST_QUOTE: 'FRESHEST_QUOTE',
  },
  SORT_LABELS: [
    { value: 'LOWEST_LANDED_COST', label: 'Lowest Landed Cost' },
  ],
  MOQ_FILTER_OPTIONS: [
    { value: 'ALL', label: 'Any Wholesale MOQ' },
  ],
  PROVENANCE_DISPLAY: {
    SEEDED_DEMO: { label: 'DEMO SAMPLE DATA', variant: 'provenance' },
    SUPPLIER_SUBMITTED: { label: 'SUPPLIER SUBMITTED', variant: 'pool' },
    VERIFIED_LIVE: { label: 'VERIFIED LIVE', variant: 'success' },
    EXTERNAL_API: { label: 'EXTERNAL SOURCE', variant: 'outline' },
  },
  getSupplierById: vi.fn(),
  getOffersBySupplier: vi.fn(),
  requestQuote: vi.fn(),
  searchOffers: vi.fn(),
  compareOffers: vi.fn(),
  listSuppliers: vi.fn(),
  searchProducts: vi.fn(),
  getApiErrorMessage: vi.fn((err, fallback) => err?.response?.data?.message || err?.message || fallback || 'Error'),
  isOfferExpired: vi.fn((offer) => {
    if (!offer?.expiresAt) return false;
    return new Date(offer.expiresAt).getTime() <= Date.now();
  }),
  resolveOfferProvenance: vi.fn((entity) => {
    if (!entity) return { label: 'UNVERIFIED', variant: 'outline', isVerified: false, description: 'Unknown' };
    const rawSource = (entity?.dataSourceType || '').toUpperCase().trim();
    const rawVerification = (entity?.verificationStatus || '').toUpperCase().trim();
    if (rawSource === 'VERIFIED_LIVE' && rawVerification === 'VERIFIED') {
      return { label: 'VERIFIED LIVE', variant: 'success', isVerified: true, description: 'Verified live' };
    }
    if (rawSource === 'SUPPLIER_SUBMITTED') {
      return { label: 'SUPPLIER SUBMITTED', variant: 'pool', isVerified: false, description: 'Supplier submitted' };
    }
    if (rawSource === 'SEEDED_DEMO' || rawVerification === 'DEMO_SAMPLE') {
      return { label: 'DEMO SAMPLE DATA', variant: 'provenance', isVerified: false, description: 'Demo sample' };
    }
    return { label: 'UNVERIFIED', variant: 'outline', isVerified: false, description: 'Unknown' };
  }),
  calculateOfferLandedCost: vi.fn((offer, qty = 1) => {
    const base = Number(offer?.baseUnitPriceMinor || 0);
    const isShippingKnown =
      offer?.flatShippingCostMinor !== null &&
      offer?.flatShippingCostMinor !== undefined &&
      typeof offer.flatShippingCostMinor === 'number';
    const ship = isShippingKnown ? Number(offer.flatShippingCostMinor) : null;
    const merchandiseTotalMinor = base * qty;
    const landedCostMinor = merchandiseTotalMinor + (ship || 0);
    return {
      unitPriceMinor: base,
      merchandiseTotalMinor,
      shippingCostMinor: ship,
      landedCostMinor,
      isShippingKnown,
      isCompleteLandedCost: isShippingKnown,
    };
  }),
}));

import * as suppliersApi from '@/api/suppliers.api';
import SupplierDetailPage from '@/pages/suppliers/SupplierDetailPage';
import SupplierCataloguePage from '@/pages/suppliers/SupplierCataloguePage';

// ── Test Helpers ─────────────────────────────────────────────────────────────

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-display">{location.pathname}{location.search}</div>;
}

function makeMockSupplier(overrides = {}) {
  return {
    _id: 'sup-1',
    name: 'EcoPack India Ltd',
    serviceAreas: ['DELHI_NCR', 'BANGALORE'],
    verificationStatus: 'VERIFIED',
    activeStatus: 'ACTIVE',
    dataSourceType: 'VERIFIED_LIVE',
    contactReference: {
      contactPerson: 'Rajesh Sharma',
      email: 'sales@ecopack.example.com',
      phone: '+91 98765 43210',
      address: 'Plot 42, Okhla Phase 3, New Delhi',
    },
    ...overrides,
  };
}

function makeMockOffer(overrides = {}) {
  return {
    _id: 'off-1',
    productId: {
      _id: 'prod-1',
      canonicalName: 'Bio-Degradable Coffee Cups 250ml',
      category: 'PACKAGING',
      baseUnit: 'UNIT',
    },
    supplierId: {
      _id: 'sup-1',
      name: 'EcoPack India Ltd',
    },
    supplierProductDescription: 'Eco-friendly compostable coffee cups for cafes.',
    packUnit: 'BOX',
    packSize: '1,000 pcs',
    currency: 'INR',
    baseUnitPriceMinor: 250,
    minimumOrderQuantity: 1000,
    retailerMoqPercentage: 20,
    retailerStepPercentage: 1,
    computedRetailerMoq: 200,
    computedRetailerStep: 10,
    quantityTiers: [
      { minQuantity: 500, maxQuantity: 1999, unitPriceMinor: 250 },
      { minQuantity: 2000, maxQuantity: null, unitPriceMinor: 210 },
    ],
    deliveryAreas: ['DELHI_NCR', 'BANGALORE'],
    leadTimeDays: 3,
    flatShippingCostMinor: 50000,
    taxInclusion: 'GST_INCLUDED',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    dataSourceType: 'VERIFIED_LIVE',
    verificationStatus: 'VERIFIED',
    isActive: true,
    ...overrides,
  };
}

function makeExpiredOffer(overrides = {}) {
  return makeMockOffer({
    _id: 'off-expired',
    productId: {
      _id: 'prod-exp',
      canonicalName: 'Kraft Paper Bags 10kg',
      category: 'PACKAGING',
      baseUnit: 'UNIT',
    },
    expiresAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    isActive: false,
    ...overrides,
  });
}

function renderSupplierDetailPage(supplierId = 'sup-1') {
  return render(
    <MemoryRouter initialEntries={[`/suppliers/${supplierId}`]}>
      <LocationDisplay />
      <Routes>
        <Route path="/suppliers/:supplierId" element={<SupplierDetailPage />} />
        <Route path="/suppliers" element={<div data-testid="catalogue-page-dest">Catalogue Page</div>} />
        <Route path="/group-buys/create" element={<div data-testid="group-buys-create-dest">Create Group Buy Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// ── Test Suite ───────────────────────────────────────────────────────────────

describe('SupplierDetailPage & CustomQuoteModal (HIM-10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Loading Skeleton ───────────────────────────────────────────────────
  it('1. renders loading skeleton while supplier data is being fetched', async () => {
    suppliersApi.getSupplierById.mockReturnValue(new Promise(() => {}));
    suppliersApi.getOffersBySupplier.mockReturnValue(new Promise(() => {}));

    renderSupplierDetailPage('sup-loading');

    expect(screen.getByTestId('supplier-loading-skeleton')).toBeInTheDocument();
  });

  // ── 2. Supplier Info Rendering ────────────────────────────────────────────
  it('2. renders correct supplier information (name, contact, service areas)', async () => {
    const mockSupplier = makeMockSupplier();
    suppliersApi.getSupplierById.mockResolvedValue({ data: { data: mockSupplier } });
    suppliersApi.getOffersBySupplier.mockResolvedValue({ offers: [] });

    renderSupplierDetailPage(mockSupplier._id);

    await waitFor(() => expect(screen.getByTestId('supplier-profile-header')).toBeInTheDocument());

    expect(screen.getByTestId('supplier-name')).toHaveTextContent('EcoPack India Ltd');
    expect(screen.getByTestId('supplier-contact-info')).toHaveTextContent('Rajesh Sharma');
    expect(screen.getByTestId('supplier-contact-info')).toHaveTextContent('sales@ecopack.example.com');
    expect(screen.getByTestId('supplier-service-areas')).toHaveTextContent('DELHI_NCR');
    expect(screen.getByTestId('supplier-service-areas')).toHaveTextContent('BANGALORE');
  });

  // ── 3. Verification Badge ─────────────────────────────────────────────────
  it('3. displays correct provenance and verification badges on supplier profile', async () => {
    const mockSupplier = makeMockSupplier({
      dataSourceType: 'VERIFIED_LIVE',
      verificationStatus: 'VERIFIED',
    });
    suppliersApi.getSupplierById.mockResolvedValue({ data: { data: mockSupplier } });
    suppliersApi.getOffersBySupplier.mockResolvedValue({ offers: [] });

    renderSupplierDetailPage(mockSupplier._id);

    await waitFor(() => expect(screen.getByTestId('supplier-provenance-badge')).toBeInTheDocument());
    expect(screen.getByTestId('supplier-provenance-badge')).toHaveTextContent('VERIFIED LIVE');
    expect(screen.getByTestId('verification-status-value')).toHaveTextContent('VERIFIED');
    expect(screen.getByTestId('supplier-active-status')).toHaveTextContent('ACTIVE');
  });

  // ── 4. Service Area Display ───────────────────────────────────────────────
  it('4. displays service areas badges or fallback for the supplier', async () => {
    const mockSupplier = makeMockSupplier({
      serviceAreas: ['MUMBAI_METRO'],
    });
    suppliersApi.getSupplierById.mockResolvedValue({ data: { data: mockSupplier } });
    suppliersApi.getOffersBySupplier.mockResolvedValue({ offers: [] });

    renderSupplierDetailPage(mockSupplier._id);

    await waitFor(() => expect(screen.getByTestId('supplier-service-areas')).toBeInTheDocument());
    expect(screen.getByTestId('supplier-service-areas')).toHaveTextContent('MUMBAI_METRO');
  });

  // ── 5. Active Offers Rendering ────────────────────────────────────────────
  it('5. renders active supplier offers with product name, price, and MOQ metrics', async () => {
    const mockSupplier = makeMockSupplier();
    const mockOffer = makeMockOffer();
    suppliersApi.getSupplierById.mockResolvedValue({ data: { data: mockSupplier } });
    suppliersApi.getOffersBySupplier.mockResolvedValue({ offers: [mockOffer] });

    renderSupplierDetailPage(mockSupplier._id);

    await waitFor(() => expect(screen.getByTestId('supplier-offers-grid')).toBeInTheDocument());

    expect(screen.getByTestId('offer-product-title')).toHaveTextContent('Bio-Degradable Coffee Cups 250ml');
    expect(screen.getByTestId('offer-price-val')).toHaveTextContent(/2.50/);
    expect(screen.getByTestId('offer-moq-w')).toHaveTextContent('1,000');
    expect(screen.getByTestId('offer-moq-r')).toHaveTextContent('200');
    expect(screen.getByTestId('offer-step')).toHaveTextContent('10');
  });

  // ── 6. Supplier with No Active Offers ──────────────────────────────────────
  it('6. displays empty state when supplier has no active offers', async () => {
    const mockSupplier = makeMockSupplier();
    suppliersApi.getSupplierById.mockResolvedValue({ data: { data: mockSupplier } });
    suppliersApi.getOffersBySupplier.mockResolvedValue({ offers: [] });

    renderSupplierDetailPage(mockSupplier._id);

    await waitFor(() => expect(screen.getByTestId('no-offers-state')).toBeInTheDocument());
    expect(screen.getByText('No Active Catalogue Offers')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state-quote-button')).toBeInTheDocument();
  });

  // ── 7. Supplier Not Found (Error State) ────────────────────────────────────
  it('7. displays error alert and retry button when supplier is not found or API fails', async () => {
    suppliersApi.getSupplierById.mockRejectedValue({
      response: { data: { message: 'Supplier not found' } },
    });

    renderSupplierDetailPage('sup-missing');

    await waitFor(() => expect(screen.getByTestId('supplier-error-state')).toBeInTheDocument());
    expect(screen.getByText(/Supplier not found/i)).toBeInTheDocument();
    expect(screen.getByTestId('retry-supplier-button')).toBeInTheDocument();
  });

  // ── 8. API Error Retry ────────────────────────────────────────────────────
  it('8. retries fetching supplier details and offers when retry button is clicked', async () => {
    const mockSupplier = makeMockSupplier();
    suppliersApi.getSupplierById
      .mockRejectedValueOnce({ message: 'Network error' })
      .mockResolvedValue({ data: { data: mockSupplier } });
    suppliersApi.getOffersBySupplier.mockResolvedValue({ offers: [] });

    renderSupplierDetailPage('sup-1');

    await waitFor(() => expect(screen.getByTestId('retry-supplier-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('retry-supplier-button'));

    await waitFor(() => expect(screen.getByTestId('supplier-profile-header')).toBeInTheDocument());
    expect(suppliersApi.getSupplierById).toHaveBeenCalledTimes(2);
  });

  // ── 9. Catalogue Link to /suppliers/:supplierId ───────────────────────────
  it('9. navigates from catalogue supplier link to /suppliers/:supplierId', async () => {
    const mockOffer = makeMockOffer();
    suppliersApi.searchOffers.mockResolvedValue({
      data: { data: { offers: [mockOffer] } },
    });

    render(
      <MemoryRouter initialEntries={['/suppliers']}>
        <LocationDisplay />
        <Routes>
          <Route path="/suppliers" element={<SupplierCataloguePage />} />
          <Route path="/suppliers/:supplierId" element={<div data-testid="target-supplier-detail">Supplier Detail Loaded</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByTestId('supplier-link-off-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('supplier-link-off-1'));

    await waitFor(() => {
      expect(screen.getByTestId('location-display')).toHaveTextContent('/suppliers/sup-1');
      expect(screen.getByTestId('target-supplier-detail')).toBeInTheDocument();
    });
  });

  // ── 10. Opening Custom Quote Modal ────────────────────────────────────────
  it('10. opens custom quote modal from header request button', async () => {
    const mockSupplier = makeMockSupplier();
    suppliersApi.getSupplierById.mockResolvedValue({ data: { data: mockSupplier } });
    suppliersApi.getOffersBySupplier.mockResolvedValue({ offers: [] });

    renderSupplierDetailPage(mockSupplier._id);

    await waitFor(() => expect(screen.getByTestId('header-request-quote-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('header-request-quote-button'));

    expect(screen.getByTestId('custom-quote-modal')).toBeInTheDocument();
    expect(screen.getByTestId('quote-request-form')).toBeInTheDocument();
  });

  // ── 11. Closing Custom Quote Modal ────────────────────────────────────────
  it('11. closes custom quote modal when Cancel button is clicked', async () => {
    const mockSupplier = makeMockSupplier();
    suppliersApi.getSupplierById.mockResolvedValue({ data: { data: mockSupplier } });
    suppliersApi.getOffersBySupplier.mockResolvedValue({ offers: [] });

    renderSupplierDetailPage(mockSupplier._id);

    await waitFor(() => expect(screen.getByTestId('header-request-quote-button')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('header-request-quote-button'));

    expect(screen.getByTestId('custom-quote-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('quote-cancel-button'));

    await waitFor(() => expect(screen.queryByTestId('custom-quote-modal')).not.toBeInTheDocument());
  });

  // ── 12. Prefilled Quote Fields from Offer ─────────────────────────────────
  it('12. prefills quote form fields from preselected offer and detects STALE_QUOTE for expired offer', async () => {
    const mockSupplier = makeMockSupplier();
    const expiredOffer = makeExpiredOffer();
    suppliersApi.getSupplierById.mockResolvedValue({ data: { data: mockSupplier } });
    suppliersApi.getOffersBySupplier.mockResolvedValue({ offers: [expiredOffer] });

    renderSupplierDetailPage(mockSupplier._id);

    await waitFor(() => expect(screen.getByTestId('request-quote-button-off-expired')).toBeInTheDocument());

    // Click request quote on expired offer
    fireEvent.click(screen.getByTestId('request-quote-button-off-expired'));

    expect(screen.getByTestId('custom-quote-modal')).toBeInTheDocument();

    // Expired offer should prefill reason with STALE_QUOTE
    const reasonSelect = screen.getByTestId('quote-reason-select');
    expect(reasonSelect.value).toBe('STALE_QUOTE');

    // Product select should have preselected product
    const productSelect = screen.getByTestId('quote-product-select');
    expect(productSelect.value).toBe('prod-exp');
  });

  // ── 13. Form Validation ───────────────────────────────────────────────────
  it('13. validates required form fields (product, quantity, delivery area) and prevents submit', async () => {
    const mockSupplier = makeMockSupplier();
    const mockOffer = makeMockOffer();
    suppliersApi.getSupplierById.mockResolvedValue({ data: { data: mockSupplier } });
    suppliersApi.getOffersBySupplier.mockResolvedValue({ offers: [mockOffer] });

    renderSupplierDetailPage(mockSupplier._id);

    await waitFor(() => expect(screen.getByTestId('header-request-quote-button')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('header-request-quote-button'));

    // Clear product selection
    const prodSelect = screen.getByTestId('quote-product-select');
    fireEvent.change(prodSelect, { target: { value: '' } });

    // Set invalid quantity
    const qtyInput = screen.getByTestId('quote-quantity-input');
    fireEvent.change(qtyInput, { target: { value: '0' } });

    // Clear delivery area
    const deliverySelect = screen.getByTestId('quote-delivery-area-select');
    fireEvent.change(deliverySelect, { target: { value: '' } });

    // Submit form
    fireEvent.click(screen.getByTestId('quote-submit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('error-product-id')).toBeInTheDocument();
      expect(screen.getByTestId('error-requested-quantity')).toBeInTheDocument();
      expect(screen.getByTestId('error-delivery-area')).toBeInTheDocument();
    });

    expect(suppliersApi.requestQuote).not.toHaveBeenCalled();
  });

  // ── 14. Successful Quote Submission ───────────────────────────────────────
  it('14. submits quote request successfully and displays confirmation banner with quote ID', async () => {
    const mockSupplier = makeMockSupplier();
    const mockOffer = makeMockOffer();
    suppliersApi.getSupplierById.mockResolvedValue({ data: { data: mockSupplier } });
    suppliersApi.getOffersBySupplier.mockResolvedValue({ offers: [mockOffer] });
    suppliersApi.requestQuote.mockResolvedValue({
      data: {
        data: {
          _id: 'quote-test-999',
          status: 'REQUESTED',
          supplierId: mockSupplier._id,
          requestedQuantity: 500,
        },
      },
    });

    renderSupplierDetailPage(mockSupplier._id);

    await waitFor(() => expect(screen.getByTestId('request-quote-button-off-1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('request-quote-button-off-1'));

    // Change volume
    const qtyInput = screen.getByTestId('quote-quantity-input');
    fireEvent.change(qtyInput, { target: { value: '500' } });

    fireEvent.click(screen.getByTestId('quote-submit-button'));

    await waitFor(() => expect(screen.getByTestId('quote-success-banner')).toBeInTheDocument());
    expect(screen.getByText(/#quote-test-999/)).toBeInTheDocument();
    expect(screen.getByText('REQUESTED')).toBeInTheDocument();

    // Click Done to close modal
    fireEvent.click(screen.getByTestId('quote-success-close-button'));
    await waitFor(() => expect(screen.queryByTestId('custom-quote-modal')).not.toBeInTheDocument());
  });

  // ── 15. Failed Quote Submission ───────────────────────────────────────────
  it('15. displays error alert when quote submission fails', async () => {
    const mockSupplier = makeMockSupplier();
    const mockOffer = makeMockOffer();
    suppliersApi.getSupplierById.mockResolvedValue({ data: { data: mockSupplier } });
    suppliersApi.getOffersBySupplier.mockResolvedValue({ offers: [mockOffer] });
    suppliersApi.requestQuote.mockRejectedValue({
      response: { data: { message: 'Supplier is currently not accepting custom quotes.' } },
    });

    renderSupplierDetailPage(mockSupplier._id);

    await waitFor(() => expect(screen.getByTestId('request-quote-button-off-1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('request-quote-button-off-1'));

    fireEvent.click(screen.getByTestId('quote-submit-button'));

    await waitFor(() => expect(screen.getByTestId('quote-submit-error')).toBeInTheDocument());
    expect(screen.getByText(/Supplier is currently not accepting custom quotes/i)).toBeInTheDocument();
  });

  // ── 16. Duplicate Submission Prevention ───────────────────────────────────
  it('16. disables submit button during submission to prevent duplicate requests', async () => {
    const mockSupplier = makeMockSupplier();
    const mockOffer = makeMockOffer();
    suppliersApi.getSupplierById.mockResolvedValue({ data: { data: mockSupplier } });
    suppliersApi.getOffersBySupplier.mockResolvedValue({ offers: [mockOffer] });
    // Pending promise
    suppliersApi.requestQuote.mockReturnValue(new Promise(() => {}));

    renderSupplierDetailPage(mockSupplier._id);

    await waitFor(() => expect(screen.getByTestId('request-quote-button-off-1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('request-quote-button-off-1'));

    const submitBtn = screen.getByTestId('quote-submit-button');
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('quote-submit-button')).toBeDisabled();
      expect(screen.getByText(/Submitting Request.../i)).toBeInTheDocument();
    });
  });

  // ── 17. Payload Structure to POST /api/quotes/requests ───────────────────
  it('17. sends correct payload structure to POST /api/quotes/requests', async () => {
    const mockSupplier = makeMockSupplier();
    const mockOffer = makeMockOffer();
    suppliersApi.getSupplierById.mockResolvedValue({ data: { data: mockSupplier } });
    suppliersApi.getOffersBySupplier.mockResolvedValue({ offers: [mockOffer] });
    suppliersApi.requestQuote.mockResolvedValue({
      data: { _id: 'quote-payload-check', status: 'REQUESTED' },
    });

    renderSupplierDetailPage(mockSupplier._id);

    await waitFor(() => expect(screen.getByTestId('request-quote-button-off-1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('request-quote-button-off-1'));

    // Fill notes
    const notesInput = screen.getByTestId('quote-notes-textarea');
    fireEvent.change(notesInput, { target: { value: 'Require delivery before end of next month' } });

    fireEvent.click(screen.getByTestId('quote-submit-button'));

    await waitFor(() =>
      expect(suppliersApi.requestQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierId: 'sup-1',
          productId: 'prod-1',
          supplierOfferId: 'off-1',
          requestedQuantity: 200,
          currency: 'INR',
          requestNotes: 'Require delivery before end of next month',
        })
      )
    );
  });

  // ── 18. Group-Buy Navigation ──────────────────────────────────────────────
  it('18. navigates to /group-buys/create with offerId parameter when clicking Start Group-Buy Pool', async () => {
    const mockSupplier = makeMockSupplier();
    const mockOffer = makeMockOffer();
    suppliersApi.getSupplierById.mockResolvedValue({ data: { data: mockSupplier } });
    suppliersApi.getOffersBySupplier.mockResolvedValue({ offers: [mockOffer] });

    renderSupplierDetailPage(mockSupplier._id);

    await waitFor(() => expect(screen.getByTestId('start-group-buy-button-off-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('start-group-buy-button-off-1'));

    await waitFor(() => {
      expect(screen.getByTestId('location-display')).toHaveTextContent('/group-buys/create?offerId=off-1');
      expect(screen.getByTestId('group-buys-create-dest')).toBeInTheDocument();
    });
  });

  // ── 19. Expired Offer Start Group-Buy Disabled ────────────────────────────
  it('19. disables Start Group-Buy Pool button for expired offers', async () => {
    const mockSupplier = makeMockSupplier();
    const expiredOffer = makeExpiredOffer();
    suppliersApi.getSupplierById.mockResolvedValue({ data: { data: mockSupplier } });
    suppliersApi.getOffersBySupplier.mockResolvedValue({ offers: [expiredOffer] });

    renderSupplierDetailPage(mockSupplier._id);

    await waitFor(() => expect(screen.getByTestId('start-group-buy-button-off-expired')).toBeInTheDocument());

    const startBtn = screen.getByTestId('start-group-buy-button-off-expired');
    expect(startBtn).toBeDisabled();
    expect(startBtn).toHaveTextContent(/Cannot Start Pool \(Quote Expired\)/i);
  });
});
