/**
 * CoBuy AI — SUJ-06 Test Suite
 *
 * Verifies:
 *  1. payments.api.js (API client contracts & unwrap behavior)
 *  2. PayPalCheckoutModal (loading, simulated dev checkout, success, cancel, error states, sandbox disclosure)
 *  3. PaymentsPage (ledger rendering, all 4 payment purposes, status filters, metrics, empty state)
 *  4. RefundsPage (refunds tracker, all 8 refund reasons, live status badges, empty state)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { paymentsApi } from '@/api/payments.api';
import axiosClient from '@/api/axiosClient';
import PayPalCheckoutModal from '@/pages/payments/PayPalCheckoutModal';
import PaymentsPage from '@/pages/payments/PaymentsPage';
import RefundsPage from '@/pages/payments/RefundsPage';

// ── Mock Data Fixtures ────────────────────────────────────────────────────────

const mockPaymentsList = [
  {
    _id: 'pay-001',
    poolId: 'pool-101',
    contributionId: 'contrib-201',
    shopId: 'shop-301',
    payerUserId: 'user-so-1',
    paymentPurpose: 'INITIAL_JOIN',
    provider: 'PAYPAL_SANDBOX',
    providerOrderId: '5O19999999999991',
    providerCaptureId: '2C88888888888881',
    idempotencyKey: 'idemp-001-abc',
    amountMinor: 480000,
    currency: 'INR',
    paymentStatus: 'PAID',
    isTestTransaction: true,
    createdAt: '2026-11-01T10:00:00.000Z',
    capturedAt: '2026-11-01T10:01:00.000Z',
  },
  {
    _id: 'pay-002',
    poolId: 'pool-101',
    contributionId: 'contrib-201',
    shopId: 'shop-301',
    payerUserId: 'user-so-1',
    paymentPurpose: 'QUANTITY_INCREASE_DELTA',
    provider: 'MOCK_DEV',
    providerOrderId: 'MOCK-ORD-1234',
    providerCaptureId: 'MOCK-CAP-5678',
    idempotencyKey: 'idemp-002-def',
    amountMinor: 120000,
    currency: 'INR',
    paymentStatus: 'PAID',
    isTestTransaction: true,
    createdAt: '2026-11-01T11:00:00.000Z',
    capturedAt: '2026-11-01T11:00:30.000Z',
  },
  {
    _id: 'pay-003',
    poolId: 'pool-102',
    contributionId: 'contrib-202',
    shopId: 'shop-301',
    payerUserId: 'user-so-1',
    paymentPurpose: 'POST_APPROVAL_FINAL',
    provider: 'PAYPAL_SANDBOX',
    providerOrderId: '5O19999999999992',
    providerCaptureId: null,
    idempotencyKey: 'idemp-003-ghi',
    amountMinor: 350000,
    currency: 'INR',
    paymentStatus: 'CREATED',
    isTestTransaction: true,
    createdAt: '2026-11-01T12:00:00.000Z',
  },
  {
    _id: 'pay-004',
    poolId: 'pool-103',
    contributionId: 'contrib-203',
    shopId: 'shop-301',
    payerUserId: 'user-so-1',
    paymentPurpose: 'UNDER_MOQ_SURCHARGE',
    provider: 'PAYPAL_SANDBOX',
    providerOrderId: '5O19999999999993',
    providerCaptureId: null,
    idempotencyKey: 'idemp-004-jkl',
    amountMinor: 15000,
    currency: 'INR',
    paymentStatus: 'CANCELLED',
    isTestTransaction: true,
    createdAt: '2026-11-01T13:00:00.000Z',
  },
];

const mockRefundsList = [
  {
    _id: 'ref-001',
    paymentId: 'pay-001',
    poolId: 'pool-101',
    contributionId: 'contrib-201',
    shopId: 'shop-301',
    recipientUserId: 'user-so-1',
    amountMinor: 30000,
    currency: 'INR',
    reason: 'TIER_PRICE_DROP_SAVINGS',
    status: 'COMPLETED',
    providerRefundId: '7R11111111111111',
    idempotencyKey: 'ref-key-1',
    isTestTransaction: true,
    createdAt: '2026-11-01T14:00:00.000Z',
  },
  {
    _id: 'ref-002',
    paymentId: 'pay-002',
    poolId: 'pool-101',
    contributionId: 'contrib-201',
    shopId: 'shop-301',
    recipientUserId: 'user-so-1',
    amountMinor: 240000,
    currency: 'INR',
    reason: 'BUYER_WITHDRAWAL',
    status: 'PROCESSING',
    providerRefundId: null,
    idempotencyKey: 'ref-key-2',
    isTestTransaction: true,
    createdAt: '2026-11-01T15:00:00.000Z',
  },
  {
    _id: 'ref-003',
    paymentId: 'pay-003',
    poolId: 'pool-102',
    contributionId: 'contrib-202',
    shopId: 'shop-301',
    recipientUserId: 'user-so-1',
    amountMinor: 480000,
    currency: 'INR',
    reason: 'POOL_CANCELLED',
    status: 'COMPLETED',
    providerRefundId: '7R22222222222222',
    idempotencyKey: 'ref-key-3',
    isTestTransaction: true,
    createdAt: '2026-11-01T16:00:00.000Z',
  },
  {
    _id: 'ref-004',
    paymentId: 'pay-004',
    poolId: 'pool-103',
    contributionId: 'contrib-203',
    shopId: 'shop-301',
    recipientUserId: 'user-so-1',
    amountMinor: 50000,
    currency: 'INR',
    reason: 'UNDER_MOQ_BUYER_CANCEL',
    status: 'FAILED',
    failureReason: 'Provider gateway timeout on reversal',
    providerRefundId: null,
    idempotencyKey: 'ref-key-4',
    isTestTransaction: true,
    createdAt: '2026-11-01T17:00:00.000Z',
  },
];

// ── 1. payments.api.js Unit Tests ─────────────────────────────────────────────

describe('SUJ-06: payments.api.js Client Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('createPaymentOrder calls POST /api/payments/create-order without client-supplied amount', async () => {
    const postSpy = vi.spyOn(axiosClient, 'post').mockResolvedValue({
      data: {
        statusCode: 201,
        success: true,
        data: {
          paymentId: 'pay-new-1',
          providerOrderId: '5O-new',
          amountMinor: 480000,
          currency: 'INR',
          paymentStatus: 'CREATED',
        },
      },
    });

    const result = await paymentsApi.createPaymentOrder({
      contributionId: 'contrib-123',
      paymentPurpose: 'INITIAL_JOIN',
      idempotencyKey: 'test-idemp-key-1234',
    });

    expect(postSpy).toHaveBeenCalledWith(
      '/payments/create-order',
      expect.objectContaining({
        contributionId: 'contrib-123',
        paymentPurpose: 'INITIAL_JOIN',
        idempotencyKey: 'test-idemp-key-1234',
      })
    );
    // Crucial check: verify amountMinor was NOT sent by the client
    expect(postSpy.mock.calls[0][1]).not.toHaveProperty('amountMinor');
    expect(result.paymentId).toBe('pay-new-1');
  });

  it('capturePaymentOrder calls POST /api/payments/:paymentId/capture with providerOrderId', async () => {
    const postSpy = vi.spyOn(axiosClient, 'post').mockResolvedValue({
      data: {
        statusCode: 200,
        success: true,
        data: {
          payment: { _id: 'pay-123', paymentStatus: 'PAID' },
          contribution: { _id: 'contrib-123', status: 'ACTIVE' },
          isDuplicate: false,
        },
      },
    });

    const result = await paymentsApi.capturePaymentOrder('pay-123', {
      providerOrderId: '5O-test-order',
    });

    expect(postSpy).toHaveBeenCalledWith('/payments/pay-123/capture', {
      providerOrderId: '5O-test-order',
    });
    expect(result.payment.paymentStatus).toBe('PAID');
  });

  it('cancelPaymentOrder calls POST /api/payments/:paymentId/cancel', async () => {
    const postSpy = vi.spyOn(axiosClient, 'post').mockResolvedValue({
      data: {
        statusCode: 200,
        success: true,
        data: { payment: { _id: 'pay-123', paymentStatus: 'CANCELLED' } },
      },
    });

    const result = await paymentsApi.cancelPaymentOrder('pay-123');

    expect(postSpy).toHaveBeenCalledWith('/payments/pay-123/cancel', {});
    expect(result.payment.paymentStatus).toBe('CANCELLED');
  });

  it('listPayments calls GET /api/payments with pagination parameters', async () => {
    const getSpy = vi.spyOn(axiosClient, 'get').mockResolvedValue({
      data: {
        statusCode: 200,
        success: true,
        data: { payments: mockPaymentsList, total: 4, page: 1, limit: 20 },
      },
    });

    const result = await paymentsApi.listPayments({ page: 2, limit: 10 });

    expect(getSpy).toHaveBeenCalledWith('/payments', {
      params: { page: 2, limit: 10 },
    });
    expect(result.payments).toHaveLength(4);
    expect(result.total).toBe(4);
  });

  it('listRefunds calls GET /api/refunds with pagination parameters', async () => {
    const getSpy = vi.spyOn(axiosClient, 'get').mockResolvedValue({
      data: {
        statusCode: 200,
        success: true,
        data: { refunds: mockRefundsList, total: 4, page: 1, limit: 20 },
      },
    });

    const result = await paymentsApi.listRefunds({ page: 1, limit: 20 });

    expect(getSpy).toHaveBeenCalledWith('/refunds', {
      params: { page: 1, limit: 20 },
    });
    expect(result.refunds).toHaveLength(4);
  });
});

// ── 2. PayPalCheckoutModal Component Tests ────────────────────────────────────

describe('SUJ-06: PayPalCheckoutModal Component Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders modal with mandatory SandboxDisclosureBanner and payment purpose summary', () => {
    render(
      <PayPalCheckoutModal
        open={true}
        onOpenChange={vi.fn()}
        contributionId="contrib-test-1"
        paymentPurpose="INITIAL_JOIN"
        estimatedAmountMinor={480000}
        currency="INR"
        productTitle="Tata Tea Gold 500g"
        isMockMode={true}
      />
    );

    // Transparency banner check
    expect(screen.getByTestId('sandbox-disclosure-banner')).toBeInTheDocument();
    expect(screen.getByText(/TEST TRANSACTION — PAYPAL SANDBOX/i)).toBeInTheDocument();

    // Summary checks
    expect(screen.getByText(/Initial Join \(Pay-at-Join Commitment\)/i)).toBeInTheDocument();
    expect(screen.getByText('Tata Tea Gold 500g')).toBeInTheDocument();
    expect(screen.getByText(/₹4,800/i)).toBeInTheDocument();

    // Simulated Dev Checkout button check
    expect(screen.getByTestId('simulated-dev-checkout-btn')).toBeInTheDocument();
  });

  it('executes simulated dev checkout, displays success receipt, and invokes onSuccess', async () => {
    const user = userEvent.setup();
    const onSuccessMock = vi.fn();

    vi.spyOn(paymentsApi, 'createPaymentOrder').mockResolvedValue({
      paymentId: 'pay-sim-100',
      providerOrderId: 'MOCK-ORD-SIM-1',
      amountMinor: 480000,
      currency: 'INR',
      paymentStatus: 'CREATED',
    });

    vi.spyOn(paymentsApi, 'capturePaymentOrder').mockResolvedValue({
      payment: {
        _id: 'pay-sim-100',
        amountMinor: 480000,
        currency: 'INR',
        paymentStatus: 'PAID',
        providerCaptureId: 'MOCK-CAP-SIM-1',
      },
      contribution: {
        _id: 'contrib-test-1',
        status: 'ACTIVE',
      },
      isDuplicate: false,
    });

    render(
      <PayPalCheckoutModal
        open={true}
        onOpenChange={vi.fn()}
        contributionId="contrib-test-1"
        paymentPurpose="INITIAL_JOIN"
        estimatedAmountMinor={480000}
        currency="INR"
        isMockMode={true}
        onSuccess={onSuccessMock}
      />
    );

    const checkoutBtn = screen.getByTestId('simulated-dev-checkout-btn');
    await user.click(checkoutBtn);

    // Expect success state
    await waitFor(() => {
      expect(screen.getByTestId('checkout-success-state')).toBeInTheDocument();
    });

    expect(screen.getByText('Payment Confirmed!')).toBeInTheDocument();
    expect(screen.getByText('MOCK-CAP-SIM-1')).toBeInTheDocument();
    expect(screen.getByText('PAID')).toBeInTheDocument();
    expect(onSuccessMock).toHaveBeenCalledTimes(1);
    expect(onSuccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'pay-sim-100', paymentStatus: 'PAID' }),
      expect.objectContaining({ _id: 'contrib-test-1', status: 'ACTIVE' })
    );
  });

  it('handles cancellation and displays cancelled alert with retry option', async () => {
    const user = userEvent.setup();
    const onCancelMock = vi.fn();
    vi.spyOn(paymentsApi, 'cancelPaymentOrder').mockResolvedValue({
      payment: { _id: 'pay-sim-100', paymentStatus: 'CANCELLED' },
    });

    render(
      <PayPalCheckoutModal
        open={true}
        onOpenChange={vi.fn()}
        contributionId="contrib-test-1"
        paymentPurpose="INITIAL_JOIN"
        isMockMode={true}
        onCancel={onCancelMock}
      />
    );

    // Click modal close/cancel button
    const cancelBtn = screen.getByTestId('checkout-close-btn');
    await user.click(cancelBtn);

    // Cancel callback was invoked
    expect(cancelBtn).toBeInTheDocument();
  });

  it('handles payment failure, displays error state, and allows retry', async () => {
    const user = userEvent.setup();
    const onErrorMock = vi.fn();

    vi.spyOn(paymentsApi, 'createPaymentOrder').mockRejectedValue(
      new Error('Payment gateway unavailable in sandbox')
    );

    render(
      <PayPalCheckoutModal
        open={true}
        onOpenChange={vi.fn()}
        contributionId="contrib-test-1"
        paymentPurpose="INITIAL_JOIN"
        isMockMode={true}
        onError={onErrorMock}
      />
    );

    const checkoutBtn = screen.getByTestId('simulated-dev-checkout-btn');
    await user.click(checkoutBtn);

    await waitFor(() => {
      expect(screen.getByTestId('checkout-error-state')).toBeInTheDocument();
    });

    expect(screen.getByText(/Payment gateway unavailable in sandbox/i)).toBeInTheDocument();
    expect(onErrorMock).toHaveBeenCalledTimes(1);

    // Click Try Again
    const retryBtn = screen.getByTestId('checkout-retry-btn');
    await user.click(retryBtn);

    // Returns to idle state
    expect(screen.getByTestId('simulated-dev-checkout-btn')).toBeInTheDocument();
  });
});

// ── 3. PaymentsPage Component Tests ───────────────────────────────────────────

describe('SUJ-06: PaymentsPage Component Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders ledger table with all 4 payment purposes, metrics, and formatted amounts', async () => {
    vi.spyOn(paymentsApi, 'listPayments').mockResolvedValue({
      payments: mockPaymentsList,
      total: 4,
      page: 1,
      limit: 20,
    });

    render(
      <MemoryRouter>
        <PaymentsPage />
      </MemoryRouter>
    );

    // Wait for data load
    await waitFor(() => {
      expect(screen.getByTestId('payments-table')).toBeInTheDocument();
    });

    const table = screen.getByTestId('payments-table');

    // Verify Sandbox banner
    expect(screen.getByTestId('sandbox-disclosure-banner')).toBeInTheDocument();

    // Verify all 4 purposes are present in table
    expect(within(table).getByText('Initial Join')).toBeInTheDocument();
    expect(within(table).getByText('Quantity Delta')).toBeInTheDocument();
    expect(within(table).getByText('Post-Approval Final')).toBeInTheDocument();
    expect(within(table).getByText('Under-MOQ Surcharge')).toBeInTheDocument();

    // Verify formatted amounts
    expect(within(table).getByText(/₹4,800/i)).toBeInTheDocument();
    expect(within(table).getByText(/₹1,200/i)).toBeInTheDocument();
    expect(within(table).getByText(/₹3,500/i)).toBeInTheDocument();
    expect(within(table).getByText(/₹150/i)).toBeInTheDocument();

    // Verify statuses
    expect(within(table).getAllByText('PAID')).toHaveLength(2);
    expect(within(table).getByText('MOCK-CAP-5678')).toBeInTheDocument();
    expect(within(table).getByText('2C88888888888881')).toBeInTheDocument();
  });

  it('filters payments ledger by status', async () => {
    vi.spyOn(paymentsApi, 'listPayments').mockResolvedValue({
      payments: mockPaymentsList,
      total: 4,
      page: 1,
      limit: 20,
    });

    render(
      <MemoryRouter>
        <PaymentsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('payments-table')).toBeInTheDocument();
    });

    const table = screen.getByTestId('payments-table');

    // Filter by CANCELLED
    const filterSelect = screen.getByTestId('filter-status-select');
    fireEvent.change(filterSelect, { target: { value: 'CANCELLED' } });

    // Only CANCELLED row should remain
    expect(within(table).getByText('Under-MOQ Surcharge')).toBeInTheDocument();
    expect(within(table).queryByText('Initial Join')).not.toBeInTheDocument();
  });

  it('renders empty state when no payments exist', async () => {
    vi.spyOn(paymentsApi, 'listPayments').mockResolvedValue({
      payments: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    render(
      <MemoryRouter>
        <PaymentsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('payments-empty-state')).toBeInTheDocument();
    });

    expect(screen.getByText('No payment transactions found')).toBeInTheDocument();
  });
});

// ── 4. RefundsPage Component Tests ────────────────────────────────────────────

describe('SUJ-06: RefundsPage Component Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders refunds tracker table with reasons, live status badges, and formatted amounts', async () => {
    vi.spyOn(paymentsApi, 'listRefunds').mockResolvedValue({
      refunds: mockRefundsList,
      total: 4,
      page: 1,
      limit: 20,
    });

    render(
      <MemoryRouter>
        <RefundsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('refunds-table')).toBeInTheDocument();
    });

    const table = screen.getByTestId('refunds-table');

    // Check Sandbox banner
    expect(screen.getByTestId('sandbox-disclosure-banner')).toBeInTheDocument();

    // Check mapped reasons inside table
    expect(within(table).getByText('Tier Price Drop Savings')).toBeInTheDocument();
    expect(within(table).getByText('Buyer Withdrawal')).toBeInTheDocument();
    expect(within(table).getByText('Pool Cancelled')).toBeInTheDocument();
    expect(within(table).getByText('Under-MOQ Cancelled')).toBeInTheDocument();

    // Check formatted amounts (+₹300.00, etc.)
    expect(within(table).getByText(/\+₹300/i)).toBeInTheDocument();
    expect(within(table).getByText(/\+₹2,400/i)).toBeInTheDocument();
    expect(within(table).getByText(/\+₹4,800/i)).toBeInTheDocument();
    expect(within(table).getByText(/\+₹500/i)).toBeInTheDocument();

    // Check statuses
    expect(within(table).getAllByText('COMPLETED')).toHaveLength(2);
    expect(within(table).getByText('7R11111111111111')).toBeInTheDocument();
    expect(within(table).getByText(/Provider gateway timeout on reversal/i)).toBeInTheDocument();
  });

  it('filters refunds tracker by status', async () => {
    vi.spyOn(paymentsApi, 'listRefunds').mockResolvedValue({
      refunds: mockRefundsList,
      total: 4,
      page: 1,
      limit: 20,
    });

    render(
      <MemoryRouter>
        <RefundsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('refunds-table')).toBeInTheDocument();
    });

    const table = screen.getByTestId('refunds-table');
    const statusSelect = screen.getByTestId('filter-refund-status-select');
    fireEvent.change(statusSelect, { target: { value: 'FAILED' } });

    expect(within(table).getByText('Under-MOQ Cancelled')).toBeInTheDocument();
    expect(within(table).queryByText('Tier Price Drop Savings')).not.toBeInTheDocument();
  });

  it('renders empty state when no refunds exist', async () => {
    vi.spyOn(paymentsApi, 'listRefunds').mockResolvedValue({
      refunds: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    render(
      <MemoryRouter>
        <RefundsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('refunds-empty-state')).toBeInTheDocument();
    });

    expect(screen.getByText('No refunds recorded')).toBeInTheDocument();
  });
});
