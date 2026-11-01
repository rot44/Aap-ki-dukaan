/**
 * HIM-09 — Supplier Catalogue, Provenance Badges & Side-by-Side Offer Comparison Tests
 * (Updated for HIM-09 Final Corrections)
 *
 * Verifies:
 *  1.  Loading skeleton states
 *  2.  Error state and retry button
 *  3.  Retry re-fetches offers
 *  4.  Empty state message
 *  5.  Populated offer cards: product name, supplier, and prices
 *  6.  Two-level MOQ (MOQ_W, MOQ_R 20%) and Step multiple (1%) display
 *  7.  Quantity bulk price tiers breakdown
 *  8.  VERIFIED LIVE provenance badge (requires BOTH VERIFIED_LIVE source AND VERIFIED status)
 *  9.  SUPPLIER SUBMITTED provenance badge
 * 10.  DEMO SAMPLE DATA provenance badge
 * 11.  EXTERNAL_API source → EXTERNAL SOURCE badge (not DEMO)
 * 12.  Expired quote badge and filter toggle
 * 13.  Include Expired Quotes toggle triggers backend call with includeExpired: true
 * 14.  Category filter sends only valid backend enum values
 * 15.  GROCERIES is never sent to the backend (invalid category)
 * 16.  Delivery area filter sends correct backend value
 * 17.  Client-side text search by product name
 * 18.  Client-side text search by supplier name
 * 19.  Client-side text search by product description
 * 20.  Clearing search restores all offers
 * 21.  Sorting by Lowest Wholesale MOQ
 * 22.  Freshness sorting uses quoteTimestamp, not expiresAt
 * 23.  Offers with missing shipping are excluded from complete landed-cost ranking
 * 24.  Missing flatShippingCostMinor shows "Shipping Quote Pending"
 * 25.  Combined filters send all active params together
 * 26.  Offer selection and floating dock appear
 * 27.  Maximum 4 selectable offers enforcement & warning
 * 28.  Clear selection button
 * 29.  Compare modal opens and calls compareOffers API
 * 30.  Comparison API error shown in modal
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// ── Mock the suppliers API module ─────────────────────────────────────────────
vi.mock('@/api/suppliers.api', () => ({
  PROVENANCE_TYPE: {
    SEEDED_DEMO: 'SEEDED_DEMO',
    SUPPLIER_SUBMITTED: 'SUPPLIER_SUBMITTED',
    VERIFIED_LIVE: 'VERIFIED_LIVE',
    EXTERNAL_API: 'EXTERNAL_API',
  },
  PROVENANCE_DISPLAY: {
    SEEDED_DEMO: { label: 'DEMO SAMPLE DATA', variant: 'provenance', description: 'Demo', isVerified: false },
    SUPPLIER_SUBMITTED: { label: 'SUPPLIER SUBMITTED', variant: 'pool', description: 'Supplier', isVerified: false },
    VERIFIED_LIVE: { label: 'VERIFIED LIVE', variant: 'success', description: 'Verified', isVerified: true },
    EXTERNAL_API: { label: 'EXTERNAL SOURCE', variant: 'outline', description: 'External API', isVerified: false },
    UNKNOWN: { label: 'UNVERIFIED', variant: 'outline', description: 'Unknown', isVerified: false },
  },
  // Category options must match backend enum — no GROCERIES
  CATEGORY_OPTIONS: [
    { value: 'ALL', label: 'All Categories' },
    { value: 'GRAINS', label: 'Grains & Rice' },
    { value: 'PULSES', label: 'Pulses & Legumes' },
    { value: 'SPICES', label: 'Spices & Masalas' },
    { value: 'EDIBLE_OILS', label: 'Edible Oils & Fats' },
    { value: 'DAIRY', label: 'Dairy Products' },
    { value: 'BEVERAGES', label: 'Beverages & Drinks' },
    { value: 'SNACKS', label: 'Snacks & Ready Foods' },
    { value: 'PACKAGING', label: 'Packaging Materials' },
    { value: 'CLEANING', label: 'Cleaning & Hygiene' },
    { value: 'PERSONAL_CARE', label: 'Personal Care' },
    { value: 'OTHER', label: 'Other' },
  ],
  DELIVERY_AREAS: [
    { value: 'ALL', label: 'All Delivery Areas' },
    { value: 'DELHI_NCR', label: 'Delhi NCR' },
    { value: 'MUMBAI_METRO', label: 'Mumbai Metro' },
    { value: 'BANGALORE', label: 'Bangalore' },
  ],
  SORT_OPTIONS: {
    LOWEST_LANDED_COST: 'LOWEST_LANDED_COST',
    LOWEST_MOQ: 'LOWEST_MOQ',
    FRESHEST_QUOTE: 'FRESHEST_QUOTE',
  },
  SORT_LABELS: [
    { value: 'LOWEST_LANDED_COST', label: 'Lowest Landed Cost' },
    { value: 'LOWEST_MOQ', label: 'Lowest Wholesale MOQ' },
    { value: 'FRESHEST_QUOTE', label: 'Freshest Quote' },
  ],
  MOQ_FILTER_OPTIONS: [
    { value: 'ALL', label: 'Any Wholesale MOQ' },
    { value: '500', label: 'Up to 500 units' },
    { value: '1000', label: 'Up to 1,000 units' },
  ],
  searchOffers: vi.fn(),
  compareOffers: vi.fn(),
  listSuppliers: vi.fn(),
  getSupplierById: vi.fn(),
  searchProducts: vi.fn(),
  getApiErrorMessage: vi.fn((err, fallback) => err?.response?.data?.message || err?.message || fallback || 'Error'),
  isOfferExpired: vi.fn((offer) => {
    if (!offer?.expiresAt) return false;
    return new Date(offer.expiresAt).getTime() <= Date.now();
  }),
  resolveOfferProvenance: vi.fn((offer) => {
    if (!offer) return { label: 'UNVERIFIED', variant: 'outline', isVerified: false, description: 'Unknown' };
    const rawSource = (offer?.dataSourceType || '').toUpperCase().trim();
    const rawVerification = (offer?.verificationStatus || '').toUpperCase().trim();
    // VERIFIED_LIVE: BOTH source and verification must confirm it
    if (rawSource === 'VERIFIED_LIVE' && rawVerification === 'VERIFIED') {
      return { label: 'VERIFIED LIVE', variant: 'success', isVerified: true, description: 'Verified live' };
    }
    if (rawSource === 'SUPPLIER_SUBMITTED') {
      return { label: 'SUPPLIER SUBMITTED', variant: 'pool', isVerified: false, description: 'Supplier submitted' };
    }
    if (rawSource === 'SEEDED_DEMO' || rawVerification === 'DEMO_SAMPLE') {
      return { label: 'DEMO SAMPLE DATA', variant: 'provenance', isVerified: false, description: 'Demo sample' };
    }
    if (rawSource === 'EXTERNAL_API') {
      return { label: 'EXTERNAL SOURCE', variant: 'outline', isVerified: false, description: 'External API' };
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
import SupplierCataloguePage from '@/pages/suppliers/SupplierCataloguePage';

// ── Test Data Helpers ─────────────────────────────────────────────────────────

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const PAST   = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
const TS_NEWEST = '2026-10-29T10:00:00.000Z'; // Most recent quote
const TS_OLDER  = '2026-10-10T10:00:00.000Z'; // Older quote
const TS_OLDEST = '2026-09-01T10:00:00.000Z'; // Oldest quote

function makeMockOffer(overrides = {}) {
  return {
    _id: 'off-1',
    productId: {
      _id: 'prod-1',
      canonicalName: 'Bio-Degradable Coffee Cups 250ml',
      category: 'PACKAGING',
      baseUnit: 'UNIT',
      packSizeDescription: 'Box of 1,000 units',
      specifications: { material: 'Bagasse', foodSafe: true },
    },
    supplierId: {
      _id: 'sup-1',
      name: 'EcoPack India Ltd',
      contactReference: { email: 'sales@ecopack.in' },
      serviceAreas: ['DELHI_NCR', 'BANGALORE'],
      verificationStatus: 'VERIFIED',
      dataSourceType: 'VERIFIED_LIVE',
    },
    supplierProductDescription: 'Eco-friendly compostable coffee cups for cafes and restaurants.',
    packUnit: 'BOX',
    packSize: '1,000 pcs',
    currency: 'INR',
    baseUnitPriceMinor: 250, // ₹2.50 per cup
    quantityTiers: [
      { minQuantity: 500, maxQuantity: 1999, unitPriceMinor: 250 },
      { minQuantity: 2000, maxQuantity: null, unitPriceMinor: 210 },
    ],
    minimumOrderQuantity: 1000,
    retailerMoqPercentage: 20,
    retailerStepPercentage: 1,
    computedRetailerMoq: 200,
    computedRetailerStep: 10,
    deliveryAreas: ['DELHI_NCR', 'BANGALORE'],
    leadTimeDays: 3,
    shippingTerms: 'DOOR_DELIVERY',
    flatShippingCostMinor: 50000,
    taxInclusion: 'GST_INCLUDED',
    availabilityStatus: 'IN_STOCK',
    quoteTimestamp: TS_NEWEST,
    expiresAt: FUTURE,
    dataSourceType: 'VERIFIED_LIVE',
    verificationStatus: 'VERIFIED',
    isActive: true,
    ...overrides,
  };
}

function makeSupplierSubmittedOffer(overrides = {}) {
  return makeMockOffer({
    _id: 'off-2',
    supplierId: {
      _id: 'sup-2',
      name: 'QuickPrint Solutions',
      serviceAreas: ['DELHI_NCR'],
      verificationStatus: 'UNVERIFIED',
      dataSourceType: 'SUPPLIER_SUBMITTED',
    },
    productId: {
      _id: 'prod-2',
      canonicalName: 'Kraft Paper Bags 10kg',
      category: 'PACKAGING',
      baseUnit: 'UNIT',
    },
    supplierProductDescription: 'Heavy-duty kraft bags for retail packaging.',
    baseUnitPriceMinor: 450,
    minimumOrderQuantity: 500,
    computedRetailerMoq: 100,
    computedRetailerStep: 5,
    dataSourceType: 'SUPPLIER_SUBMITTED',
    verificationStatus: 'UNVERIFIED',
    quoteTimestamp: TS_OLDER,
    ...overrides,
  });
}

function makeDemoSampleOffer(overrides = {}) {
  return makeMockOffer({
    _id: 'off-3',
    supplierId: {
      _id: 'sup-3',
      name: 'Grain Valley Distributors',
      serviceAreas: ['ALL_INDIA'],
      verificationStatus: 'DEMO_ONLY',
      dataSourceType: 'SEEDED_DEMO',
    },
    productId: {
      _id: 'prod-3',
      canonicalName: 'Basmati Rice Extra Long Grain 5kg',
      category: 'GRAINS',
      baseUnit: 'BAG',
    },
    supplierProductDescription: 'Demo-seeded wholesale basmati rice for testing.',
    baseUnitPriceMinor: 38000,
    minimumOrderQuantity: 100,
    computedRetailerMoq: 20,
    computedRetailerStep: 5,
    dataSourceType: 'SEEDED_DEMO',
    verificationStatus: 'DEMO_SAMPLE',
    quoteTimestamp: TS_OLDEST,
    ...overrides,
  });
}

function makeExternalApiOffer(overrides = {}) {
  return makeMockOffer({
    _id: 'off-ext',
    supplierId: {
      _id: 'sup-ext',
      name: 'External Wholesale Hub',
      serviceAreas: ['ALL_INDIA'],
      verificationStatus: 'UNVERIFIED',
      dataSourceType: 'EXTERNAL_API',
    },
    productId: {
      _id: 'prod-ext',
      canonicalName: 'Imported Cleaning Fluid 5L',
      category: 'CLEANING',
      baseUnit: 'UNIT',
    },
    supplierProductDescription: 'Commercial floor cleaner imported from external catalogue.',
    baseUnitPriceMinor: 35000,
    dataSourceType: 'EXTERNAL_API',
    verificationStatus: 'UNVERIFIED',
    quoteTimestamp: TS_OLDER,
    ...overrides,
  });
}

function makeOfferWithPendingShipping(overrides = {}) {
  return makeMockOffer({
    _id: 'off-no-ship',
    flatShippingCostMinor: null, // Shipping not yet quoted
    ...overrides,
  });
}

// ── Render Helpers ─────────────────────────────────────────────────────────────

function renderCataloguePage() {
  return render(
    <MemoryRouter initialEntries={['/suppliers']}>
      <SupplierCataloguePage />
    </MemoryRouter>
  );
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('SupplierCataloguePage (HIM-09)', () => {

  // ── 1. Loading State ────────────────────────────────────────────────────────
  it('renders loading skeletons while fetching offers', async () => {
    suppliersApi.searchOffers.mockReturnValue(new Promise(() => {})); // Never resolves

    renderCataloguePage();

    expect(screen.getAllByTestId('offer-skeleton').length).toBeGreaterThan(0);
  });

  // ── 2. Error State ──────────────────────────────────────────────────────────
  it('renders error alert when searchOffers API call fails', async () => {
    suppliersApi.searchOffers.mockRejectedValue({ message: 'Network failure' });

    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('catalogue-error')).toBeInTheDocument());
    expect(screen.getByTestId('retry-catalogue-button')).toBeInTheDocument();
  });

  // ── 3. Retry ────────────────────────────────────────────────────────────────
  it('retries fetching offers when retry button is clicked', async () => {
    suppliersApi.searchOffers
      .mockRejectedValueOnce({ message: 'Network failure' })
      .mockResolvedValue({ data: { data: { offers: [] } } });

    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('retry-catalogue-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('retry-catalogue-button'));

    await waitFor(() => expect(screen.getByTestId('catalogue-empty')).toBeInTheDocument());
    expect(suppliersApi.searchOffers).toHaveBeenCalledTimes(2);
  });

  // ── 4. Empty State ──────────────────────────────────────────────────────────
  it('renders friendly empty state when no offers match filters', async () => {
    suppliersApi.searchOffers.mockResolvedValue({ data: { data: { offers: [] } } });

    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('catalogue-empty')).toBeInTheDocument());
  });

  // ── 5. Populated Offer Cards ────────────────────────────────────────────────
  it('renders populated offer cards with product name, supplier, and prices', async () => {
    const mockOffer = makeMockOffer();
    suppliersApi.searchOffers.mockResolvedValue({ data: { data: { offers: [mockOffer] } } });

    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('offers-grid')).toBeInTheDocument());

    expect(screen.getByText('Bio-Degradable Coffee Cups 250ml')).toBeInTheDocument();
    expect(screen.getByText('EcoPack India Ltd')).toBeInTheDocument();
    // Category badge appears on the offer card
    expect(screen.getByTestId('offer-card-off-1')).toHaveTextContent('PACKAGING');
    expect(screen.getByTestId('offer-unit-price')).toHaveTextContent(/2.50/);
  });

  // ── 6. Two-Level MOQ Display ────────────────────────────────────────────────
  it('displays Wholesale MOQ (MOQ_W), Retailer MOQ (MOQ_R 20%), and Step multiple (1%)', async () => {
    const mockOffer = makeMockOffer({
      minimumOrderQuantity: 1000,
      computedRetailerMoq: 200,
      computedRetailerStep: 10,
    });
    suppliersApi.searchOffers.mockResolvedValue({ data: { data: { offers: [mockOffer] } } });

    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('offers-grid')).toBeInTheDocument());

    expect(screen.getByTestId('moq-wholesale')).toHaveTextContent('1,000');
    expect(screen.getByTestId('moq-retailer')).toHaveTextContent('200');
    expect(screen.getByTestId('step-multiple')).toHaveTextContent('10');
  });

  // ── 7. Price Tiers ──────────────────────────────────────────────────────────
  it('renders bulk quantity price tiers when present on the offer', async () => {
    const mockOffer = makeMockOffer({
      quantityTiers: [
        { minQuantity: 500, maxQuantity: 1999, unitPriceMinor: 250 },
        { minQuantity: 2000, maxQuantity: null, unitPriceMinor: 210 },
      ],
    });
    suppliersApi.searchOffers.mockResolvedValue({ data: { data: { offers: [mockOffer] } } });

    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('offer-price-tiers')).toBeInTheDocument());
  });

  // ── 8. VERIFIED LIVE Badge ──────────────────────────────────────────────────
  it('displays VERIFIED LIVE badge only when dataSourceType=VERIFIED_LIVE AND verificationStatus=VERIFIED', async () => {
    const mockOffer = makeMockOffer({
      dataSourceType: 'VERIFIED_LIVE',
      verificationStatus: 'VERIFIED',
    });
    suppliersApi.searchOffers.mockResolvedValue({ data: { data: { offers: [mockOffer] } } });

    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('offers-grid')).toBeInTheDocument());
    expect(screen.getByTestId('provenance-badge-off-1')).toHaveTextContent('VERIFIED LIVE');
  });

  it('does NOT show VERIFIED LIVE badge when source is VERIFIED_LIVE but status is not VERIFIED', async () => {
    // VERIFIED_LIVE source with UNVERIFIED status → should NOT be VERIFIED LIVE
    const mockOffer = makeMockOffer({
      dataSourceType: 'VERIFIED_LIVE',
      verificationStatus: 'UNVERIFIED',
    });
    suppliersApi.searchOffers.mockResolvedValue({ data: { data: { offers: [mockOffer] } } });

    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('offers-grid')).toBeInTheDocument());
    expect(screen.getByTestId('provenance-badge-off-1')).not.toHaveTextContent('VERIFIED LIVE');
  });

  // ── 9. SUPPLIER SUBMITTED Badge ─────────────────────────────────────────────
  it('displays SUPPLIER SUBMITTED badge for supplier-submitted unverified quotes', async () => {
    const mockOffer = makeSupplierSubmittedOffer();
    suppliersApi.searchOffers.mockResolvedValue({ data: { data: { offers: [mockOffer] } } });

    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('offers-grid')).toBeInTheDocument());
    expect(screen.getByTestId('provenance-badge-off-2')).toHaveTextContent('SUPPLIER SUBMITTED');
  });

  // ── 10. DEMO SAMPLE DATA Badge ──────────────────────────────────────────────
  it('displays DEMO SAMPLE DATA badge for seeded demo offers', async () => {
    const mockOffer = makeDemoSampleOffer();
    suppliersApi.searchOffers.mockResolvedValue({ data: { data: { offers: [mockOffer] } } });

    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('offers-grid')).toBeInTheDocument());
    expect(screen.getByTestId('provenance-badge-off-3')).toHaveTextContent('DEMO SAMPLE DATA');
  });

  // ── 11. EXTERNAL_API → EXTERNAL SOURCE (not DEMO, not VERIFIED) ─────────────
  it('displays EXTERNAL SOURCE badge for EXTERNAL_API provenance — not DEMO and not VERIFIED LIVE', async () => {
    const mockOffer = makeExternalApiOffer();
    suppliersApi.searchOffers.mockResolvedValue({ data: { data: { offers: [mockOffer] } } });

    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('offers-grid')).toBeInTheDocument());
    const badge = screen.getByTestId('provenance-badge-off-ext');
    expect(badge).not.toHaveTextContent('DEMO SAMPLE DATA');
    expect(badge).not.toHaveTextContent('VERIFIED LIVE');
    expect(badge).toHaveTextContent('EXTERNAL SOURCE');
  });

  // ── 12. Expired Quote Badge ─────────────────────────────────────────────────
  it('identifies and marks expired quotes with warning badge when includeExpired is true', async () => {
    const expiredOffer = makeMockOffer({
      _id: 'off-exp',
      expiresAt: PAST,
    });
    suppliersApi.isOfferExpired.mockImplementation((offer) =>
      offer?.expiresAt ? new Date(offer.expiresAt).getTime() <= Date.now() : false
    );
    suppliersApi.searchOffers.mockResolvedValue({ data: { data: { offers: [expiredOffer] } } });

    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('offers-grid')).toBeInTheDocument());

    expect(screen.getByTestId('expired-badge-off-exp')).toBeInTheDocument();
  });

  // ── 13. Include Expired Toggle ──────────────────────────────────────────────
  it('toggles includeExpired parameter when clicking checkbox', async () => {
    suppliersApi.searchOffers.mockResolvedValue({ data: { data: { offers: [] } } });
    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('filter-category-select')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('include-expired-toggle'));

    await waitFor(() =>
      expect(suppliersApi.searchOffers).toHaveBeenCalledWith(
        expect.objectContaining({ includeExpired: true })
      )
    );
  });

  // ── 14. Category Filter — Valid Backend Enum Values ─────────────────────────
  it('sends only valid backend category enum values — filters by GRAINS correctly', async () => {
    suppliersApi.searchOffers.mockResolvedValue({ data: { data: { offers: [] } } });
    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('filter-category-select')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('filter-category-select'), {
      target: { value: 'GRAINS' },
    });

    await waitFor(() =>
      expect(suppliersApi.searchOffers).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'GRAINS' })
      )
    );
  });

  it('sends PACKAGING category correctly (valid backend value)', async () => {
    suppliersApi.searchOffers.mockResolvedValue({ data: { data: { offers: [] } } });
    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('filter-category-select')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('filter-category-select'), {
      target: { value: 'PACKAGING' },
    });

    await waitFor(() =>
      expect(suppliersApi.searchOffers).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'PACKAGING' })
      )
    );
    // Ensure GROCERIES is never sent to backend
    expect(suppliersApi.searchOffers).not.toHaveBeenCalledWith(
      expect.objectContaining({ category: 'GROCERIES' })
    );
  });

  // ── 15. GROCERIES Must Never Be Sent to Backend ─────────────────────────────
  it('does NOT include GROCERIES in the category options sent to backend', async () => {
    suppliersApi.searchOffers.mockResolvedValue({ data: { data: { offers: [] } } });
    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('filter-category-select')).toBeInTheDocument());

    // Verify GROCERIES is not an option in the select element
    const select = screen.getByTestId('filter-category-select');
    const options = Array.from(select.querySelectorAll('option')).map(o => o.value);
    expect(options).not.toContain('GROCERIES');
  });

  // ── 16. Delivery Area Filter ────────────────────────────────────────────────
  it('filters offers by delivery area via backend API call', async () => {
    suppliersApi.searchOffers.mockResolvedValue({ data: { data: { offers: [] } } });
    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('filter-delivery-area-select')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('filter-delivery-area-select'), {
      target: { value: 'BANGALORE' },
    });

    await waitFor(() =>
      expect(suppliersApi.searchOffers).toHaveBeenCalledWith(
        expect.objectContaining({ deliveryArea: 'BANGALORE' })
      )
    );
  });

  // ── 17. Text Search by Product Name ────────────────────────────────────────
  it('filters displayed offers by client-side search on product name', async () => {
    const coffeeOffer = makeMockOffer({ _id: 'off-coffee' });
    const riceOffer   = makeDemoSampleOffer({ _id: 'off-rice' });

    suppliersApi.searchOffers.mockResolvedValue({
      data: { data: { offers: [coffeeOffer, riceOffer] } },
    });

    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('offers-grid')).toBeInTheDocument());

    const searchInput = screen.getByTestId('catalogue-search-input');
    fireEvent.change(searchInput, { target: { value: 'rice' } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      // Rice offer should be visible, coffee cup should not
      expect(screen.getByText('Basmati Rice Extra Long Grain 5kg')).toBeInTheDocument();
      expect(screen.queryByText('Bio-Degradable Coffee Cups 250ml')).not.toBeInTheDocument();
    });
  });

  // ── 18. Text Search by Supplier Name ───────────────────────────────────────
  it('filters displayed offers by client-side search on supplier name', async () => {
    const coffeeOffer = makeMockOffer({ _id: 'off-ecopack' });
    const riceOffer   = makeDemoSampleOffer({ _id: 'off-grain' });

    suppliersApi.searchOffers.mockResolvedValue({
      data: { data: { offers: [coffeeOffer, riceOffer] } },
    });

    renderCataloguePage();
    await waitFor(() => expect(screen.getByTestId('offers-grid')).toBeInTheDocument());

    const searchInput = screen.getByTestId('catalogue-search-input');
    fireEvent.change(searchInput, { target: { value: 'Grain Valley' } });

    await act(async () => { vi.advanceTimersByTime(350); });

    await waitFor(() => {
      expect(screen.getByText('Basmati Rice Extra Long Grain 5kg')).toBeInTheDocument();
      expect(screen.queryByText('Bio-Degradable Coffee Cups 250ml')).not.toBeInTheDocument();
    });
  });

  // ── 19. Text Search by Product Description ─────────────────────────────────
  it('filters displayed offers by client-side search on product description', async () => {
    const coffeeOffer = makeMockOffer({ _id: 'off-cafe' });
    const riceOffer   = makeDemoSampleOffer({ _id: 'off-wholesale' });

    suppliersApi.searchOffers.mockResolvedValue({
      data: { data: { offers: [coffeeOffer, riceOffer] } },
    });

    renderCataloguePage();
    await waitFor(() => expect(screen.getByTestId('offers-grid')).toBeInTheDocument());

    const searchInput = screen.getByTestId('catalogue-search-input');
    // coffeeOffer.supplierProductDescription = 'Eco-friendly compostable coffee cups for cafes and restaurants.'
    fireEvent.change(searchInput, { target: { value: 'compostable' } });

    await act(async () => { vi.advanceTimersByTime(350); });

    await waitFor(() => {
      expect(screen.getByText('Bio-Degradable Coffee Cups 250ml')).toBeInTheDocument();
      expect(screen.queryByText('Basmati Rice Extra Long Grain 5kg')).not.toBeInTheDocument();
    });
  });

  // ── 20. Clearing Search Restores All Offers ─────────────────────────────────
  it('clears search and restores all catalogue offers', async () => {
    const coffeeOffer = makeMockOffer({ _id: 'off-coffee-clear' });
    const riceOffer   = makeDemoSampleOffer({ _id: 'off-rice-clear' });

    suppliersApi.searchOffers.mockResolvedValue({
      data: { data: { offers: [coffeeOffer, riceOffer] } },
    });

    renderCataloguePage();
    await waitFor(() => expect(screen.getByTestId('offers-grid')).toBeInTheDocument());

    const searchInput = screen.getByTestId('catalogue-search-input');
    fireEvent.change(searchInput, { target: { value: 'rice' } });

    await act(async () => { vi.advanceTimersByTime(350); });

    await waitFor(() =>
      expect(screen.queryByText('Bio-Degradable Coffee Cups 250ml')).not.toBeInTheDocument()
    );

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });
    await act(async () => { vi.advanceTimersByTime(350); });

    await waitFor(() => {
      expect(screen.getByText('Bio-Degradable Coffee Cups 250ml')).toBeInTheDocument();
      expect(screen.getByText('Basmati Rice Extra Long Grain 5kg')).toBeInTheDocument();
    });
  });

  // ── 21. Sorting by Lowest MOQ ───────────────────────────────────────────────
  it('sorts offers by Lowest Wholesale MOQ', async () => {
    const highMoq  = makeMockOffer({ _id: 'off-high', minimumOrderQuantity: 1000 });
    const lowMoq   = makeDemoSampleOffer({ _id: 'off-low', minimumOrderQuantity: 100 });
    const midMoq   = makeSupplierSubmittedOffer({ _id: 'off-mid', minimumOrderQuantity: 500 });

    suppliersApi.searchOffers.mockResolvedValue({
      data: { data: { offers: [highMoq, lowMoq, midMoq] } },
    });

    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('offers-grid')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('sort-by-select'), { target: { value: 'LOWEST_MOQ' } });

    await waitFor(() => {
      const moqValues = screen.getAllByTestId('moq-wholesale').map((el) => parseInt(el.textContent.replace(/,/g, ''), 10));
      expect(moqValues[0]).toBeLessThanOrEqual(moqValues[1]);
      expect(moqValues[1]).toBeLessThanOrEqual(moqValues[2]);
    });
  });

  // ── 22. Freshness Sorting Uses quoteTimestamp (Not expiresAt) ──────────────
  it('sorts offers by freshness using quoteTimestamp — not by expiry date', async () => {
    // Offer A: newest quoteTimestamp, oldest expiresAt (would rank LAST if sorted by expiry)
    const offerA = makeMockOffer({
      _id: 'off-a',
      quoteTimestamp: TS_NEWEST,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),  // expires soon
    });
    // Offer B: oldest quoteTimestamp, freshest expiresAt (would rank FIRST if sorted by expiry)
    const offerB = makeDemoSampleOffer({
      _id: 'off-b',
      quoteTimestamp: TS_OLDEST,
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // expires much later
    });

    suppliersApi.searchOffers.mockResolvedValue({
      data: { data: { offers: [offerB, offerA] } },
    });

    renderCataloguePage();
    await waitFor(() => expect(screen.getByTestId('offers-grid')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('sort-by-select'), { target: { value: 'FRESHEST_QUOTE' } });

    await waitFor(() => {
      const cards = screen.getAllByTestId(/^offer-card-/);
      // off-a (newest quoteTimestamp) should come first
      expect(cards[0]).toHaveAttribute('data-testid', 'offer-card-off-a');
      expect(cards[1]).toHaveAttribute('data-testid', 'offer-card-off-b');
    });
  });

  // ── 23. Incomplete Landed Costs Excluded from Complete-Cost Ranking ─────────
  it('excludes offers with pending shipping from complete landed-cost ranking', async () => {
    // Offer with shipping known (complete landed cost) — but higher merch cost
    const offerWithShipping = makeMockOffer({
      _id: 'off-ship-known',
      baseUnitPriceMinor: 500,
      flatShippingCostMinor: 10000,  // ₹100 shipping — total landed = ₹5.00 + ₹100 * 1
    });
    // Offer with NO shipping (incomplete) — cheaper merchandise
    const offerNoShipping = makeOfferWithPendingShipping({
      _id: 'off-no-ship',
      baseUnitPriceMinor: 200,       // cheaper merch but shipping unknown
      flatShippingCostMinor: null,
    });

    suppliersApi.searchOffers.mockResolvedValue({
      data: { data: { offers: [offerWithShipping, offerNoShipping] } },
    });

    renderCataloguePage();
    await waitFor(() => expect(screen.getByTestId('offers-grid')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('sort-by-select'), { target: { value: 'LOWEST_LANDED_COST' } });

    await waitFor(() => {
      const cards = screen.getAllByTestId(/^offer-card-/);
      // offer with known shipping should appear first (complete landed cost ranks over incomplete)
      expect(cards[0]).toHaveAttribute('data-testid', 'offer-card-off-ship-known');
      expect(cards[1]).toHaveAttribute('data-testid', 'offer-card-off-no-ship');
    });
  });

  // ── 24. Shipping Quote Pending Display ──────────────────────────────────────
  it('shows "Shipping Quote Pending" when flatShippingCostMinor is null', async () => {
    const offerNoShip = makeOfferWithPendingShipping({ _id: 'off-pending' });
    suppliersApi.searchOffers.mockResolvedValue({ data: { data: { offers: [offerNoShip] } } });

    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('offers-grid')).toBeInTheDocument());
    expect(screen.getByTestId('shipping-pending-label')).toBeInTheDocument();
    expect(screen.getByTestId('shipping-pending-label')).toHaveTextContent(/Shipping Quote Pending/i);
    // Should show merchandise total separately, not claim a complete landed cost
    expect(screen.queryByTestId('landed-cost-complete')).not.toBeInTheDocument();
    expect(screen.getByTestId('landed-cost-partial')).toBeInTheDocument();
  });

  // ── 25. Combined Filters Send All Active Params ─────────────────────────────
  it('sends all active filter params together when combining category, delivery area, and MOQ', async () => {
    suppliersApi.searchOffers.mockResolvedValue({ data: { data: { offers: [] } } });
    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('filter-category-select')).toBeInTheDocument());

    // Set category
    fireEvent.change(screen.getByTestId('filter-category-select'), { target: { value: 'PACKAGING' } });
    await waitFor(() => expect(suppliersApi.searchOffers).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'PACKAGING' })));

    // Set delivery area
    fireEvent.change(screen.getByTestId('filter-delivery-area-select'), { target: { value: 'BANGALORE' } });

    await waitFor(() =>
      expect(suppliersApi.searchOffers).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: 'PACKAGING', deliveryArea: 'BANGALORE' })
      )
    );

    // Set MOQ filter
    fireEvent.change(screen.getByTestId('filter-moq-select'), { target: { value: '1000' } });

    await waitFor(() =>
      expect(suppliersApi.searchOffers).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: 'PACKAGING', deliveryArea: 'BANGALORE', maxMoq: '1000' })
      )
    );
  });

  // ── 26. Offer Selection & Floating Dock ────────────────────────────────────
  it('allows selecting offers and reveals floating comparison dock', async () => {
    const offer1 = makeMockOffer({ _id: 'off-sel-1' });
    const offer2 = makeSupplierSubmittedOffer({ _id: 'off-sel-2' });

    suppliersApi.searchOffers.mockResolvedValue({
      data: { data: { offers: [offer1, offer2] } },
    });

    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('offers-grid')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('select-offer-off-sel-1'));
    fireEvent.click(screen.getByTestId('select-offer-off-sel-2'));

    await waitFor(() => {
      expect(screen.getByTestId('floating-comparison-dock')).toBeInTheDocument();
      expect(screen.getByTestId('selected-count-badge')).toHaveTextContent('2 of 4');
    });
  });

  // ── 27. Maximum 4 Offers Enforcement ───────────────────────────────────────
  it('prevents selecting more than 4 offers and displays a warning', async () => {
    const offers = [
      makeMockOffer({ _id: 'off-A' }),
      makeMockOffer({ _id: 'off-B', supplierId: { _id: 'sup-B', name: 'Supplier B', serviceAreas: ['DELHI_NCR'], verificationStatus: 'VERIFIED', dataSourceType: 'VERIFIED_LIVE' } }),
      makeMockOffer({ _id: 'off-C', supplierId: { _id: 'sup-C', name: 'Supplier C', serviceAreas: ['DELHI_NCR'], verificationStatus: 'VERIFIED', dataSourceType: 'VERIFIED_LIVE' } }),
      makeMockOffer({ _id: 'off-D', supplierId: { _id: 'sup-D', name: 'Supplier D', serviceAreas: ['DELHI_NCR'], verificationStatus: 'VERIFIED', dataSourceType: 'VERIFIED_LIVE' } }),
      makeDemoSampleOffer({ _id: 'off-E' }),
    ];

    suppliersApi.searchOffers.mockResolvedValue({ data: { data: { offers } } });

    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('offers-grid')).toBeInTheDocument());

    ['off-A', 'off-B', 'off-C', 'off-D'].forEach((id) =>
      fireEvent.click(screen.getByTestId(`select-offer-${id}`))
    );

    await waitFor(() =>
      expect(screen.getByTestId('selected-count-badge')).toHaveTextContent('4 of 4')
    );

    // Attempt to select 5th
    fireEvent.click(screen.getByTestId('select-offer-off-E'));

    await waitFor(() =>
      expect(screen.getByTestId('selection-warning-banner')).toBeInTheDocument()
    );

    expect(screen.getByTestId('selected-count-badge')).toHaveTextContent('4 of 4');
  });

  // ── 28. Clear Selection Button ──────────────────────────────────────────────
  it('clears all selected offers when clicking clear selection button', async () => {
    const offer1 = makeMockOffer({ _id: 'off-clear-1' });
    const offer2 = makeSupplierSubmittedOffer({ _id: 'off-clear-2' });

    suppliersApi.searchOffers.mockResolvedValue({
      data: { data: { offers: [offer1, offer2] } },
    });

    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('offers-grid')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('select-offer-off-clear-1'));
    fireEvent.click(screen.getByTestId('select-offer-off-clear-2'));

    await waitFor(() => expect(screen.getByTestId('floating-comparison-dock')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('clear-selection-button'));

    await waitFor(() =>
      expect(screen.queryByTestId('floating-comparison-dock')).not.toBeInTheDocument()
    );
  });

  // ── 29. Comparison Modal Opens & Calls API ──────────────────────────────────
  it('opens comparison modal and calls compareOffers API when clicking compare', async () => {
    const offer1 = makeMockOffer({ _id: 'off-cmp-1' });
    const offer2 = makeSupplierSubmittedOffer({ _id: 'off-cmp-2' });

    suppliersApi.searchOffers.mockResolvedValue({
      data: { data: { offers: [offer1, offer2] } },
    });

    const mockComparison = {
      comparisons: [
        {
          offerId: 'off-cmp-1',
          supplierName: 'EcoPack India Ltd',
          productName: 'Bio-Degradable Coffee Cups 250ml',
          appliedUnitPriceMinor: 250,
          merchandiseTotalMinor: 25000,
          shippingCostMinor: 50000,
          isShippingKnown: true,
          knownLandedCostMinor: 75000,
          savingsVsHighestMinor: 0,
          packUnit: 'BOX',
          currency: 'INR',
          leadTimeDays: 3,
          taxInclusion: 'GST_INCLUDED',
          costFlags: ['GST_INCLUDED'],
          moqFeasibility: {
            wholesaleMoq: 1000, retailerMoq: 200, retailerStep: 10,
            meetsWholesaleMoq: false, meetsRetailerMoq: false, stepCompliant: false,
          },
          quoteFreshness: { isExpired: false, daysUntilExpiry: 30 },
          dataSourceType: 'VERIFIED_LIVE',
          verificationStatus: 'VERIFIED',
        },
        {
          offerId: 'off-cmp-2',
          supplierName: 'QuickPrint Solutions',
          productName: 'Kraft Paper Bags 10kg',
          appliedUnitPriceMinor: 450,
          merchandiseTotalMinor: 45000,
          shippingCostMinor: null,
          isShippingKnown: false,
          knownLandedCostMinor: 45000,
          savingsVsHighestMinor: 30000,
          packUnit: 'BOX',
          currency: 'INR',
          leadTimeDays: 5,
          taxInclusion: 'GST_EXCLUDED',
          costFlags: [],
          moqFeasibility: {
            wholesaleMoq: 500, retailerMoq: 100, retailerStep: 5,
            meetsWholesaleMoq: false, meetsRetailerMoq: false, stepCompliant: false,
          },
          quoteFreshness: { isExpired: false, daysUntilExpiry: 20 },
          dataSourceType: 'SUPPLIER_SUBMITTED',
          verificationStatus: 'UNVERIFIED',
        },
      ],
      bestOfferId: 'off-cmp-1',
      savingsVsHighestMinor: 30000,
    };

    suppliersApi.compareOffers.mockResolvedValue({
      data: { data: { comparison: mockComparison, summary: { headline: 'EcoPack is cheaper', tradeOffExplanation: 'Better overall value.', keyDifferentiators: ['Lower unit price'] } } },
    });

    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('offers-grid')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('select-offer-off-cmp-1'));
    fireEvent.click(screen.getByTestId('select-offer-off-cmp-2'));

    await waitFor(() => expect(screen.getByTestId('open-comparison-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('open-comparison-button'));

    await waitFor(() => expect(screen.getByTestId('comparison-modal')).toBeInTheDocument());

    await waitFor(() => {
      expect(screen.getByTestId('comparison-table')).toBeInTheDocument();
      expect(screen.getByTestId('ai-tradeoff-summary')).toBeInTheDocument();
      expect(screen.getByTestId('summary-headline')).toHaveTextContent('EcoPack is cheaper');
    });

    expect(suppliersApi.compareOffers).toHaveBeenCalledWith(
      expect.objectContaining({
        offerIds: expect.arrayContaining(['off-cmp-1', 'off-cmp-2']),
        requestedQuantity: expect.any(Number),
      })
    );
  });

  // ── 30. Comparison API Error ────────────────────────────────────────────────
  it('displays error in comparison modal if compareOffers API fails', async () => {
    const offer1 = makeMockOffer({ _id: 'off-err-1' });
    const offer2 = makeSupplierSubmittedOffer({ _id: 'off-err-2' });

    suppliersApi.searchOffers.mockResolvedValue({
      data: { data: { offers: [offer1, offer2] } },
    });

    suppliersApi.compareOffers.mockRejectedValue({ message: 'Comparison service unavailable.' });

    renderCataloguePage();

    await waitFor(() => expect(screen.getByTestId('offers-grid')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('select-offer-off-err-1'));
    fireEvent.click(screen.getByTestId('select-offer-off-err-2'));

    await waitFor(() => expect(screen.getByTestId('open-comparison-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('open-comparison-button'));

    await waitFor(() => expect(screen.getByTestId('comparison-modal')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('comparison-error')).toBeInTheDocument());
  });
});
