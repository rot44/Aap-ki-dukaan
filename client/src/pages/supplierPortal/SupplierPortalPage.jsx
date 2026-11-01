/**
 * CoBuy AI — Wholesaler Supplier Workspace (SUJ-08)
 *
 * Route: /supplier-portal
 *
 * Dedicated workspace for regional distributors and manufacturers:
 *  1. My Catalogue Offers (MOQ_W, Retailer MOQ %, Step %, tier price matrix)
 *  2. Incoming Buyer Quote Requests (Binding responses via PATCH /api/quotes/:id/respond)
 *  3. Under-MOQ Feasibility Requests (Accept sub-MOQ / revised quotes / reject)
 *  4. Group Purchase Orders & Fulfillment Tracking (PATCH /api/orders/:id/supplier-status)
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Store,
  Layers,
  FileText,
  Clock,
  Package,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Send,
  Truck,
  ArrowRight,
  SlidersHorizontal,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { formatMinorToMajor } from '@/utils/money';
import { listOrders, updateSupplierStatus } from '@/api/orders.api';
import { searchSupplierOffers, submitSupplierFeasibility } from '@/api/pools.api';
import axiosClient from '@/api/axiosClient';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { SandboxDisclosureBanner } from '@/components/common/SandboxDisclosureBanner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog';

export function SupplierPortalPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notify } = useNotifications();

  const [activeTab, setActiveTab] = useState('OFFERS'); // OFFERS | QUOTES | UNDER_MOQ | ORDERS
  const [loading, setLoading] = useState(true);

  // Data states
  const [offers, setOffers] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [underMoqPools, setUnderMoqPools] = useState([]);
  const [orders, setOrders] = useState([]);

  // Respond to Quote Modal State
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [quoteResponseModalOpen, setQuoteResponseModalOpen] = useState(false);
  const [quoteUnitPriceMajor, setQuoteUnitPriceMajor] = useState('');
  const [quoteShippingMajor, setQuoteShippingMajor] = useState('0');
  const [quoteValidityDays, setQuoteValidityDays] = useState('7');
  const [submittingAction, setSubmittingAction] = useState(false);

  // Sub-MOQ Feasibility Modal State
  const [selectedPool, setSelectedPool] = useState(null);
  const [feasibilityModalOpen, setFeasibilityModalOpen] = useState(false);
  const [feasibilityDecision, setFeasibilityDecision] = useState('ACCEPTED_SUB_MOQ');
  const [revisedPriceMajor, setRevisedPriceMajor] = useState('');

  // Order Fulfillment Modal State
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [fulfillmentModalOpen, setFulfillmentModalOpen] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState('DISPATCHED');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrierName, setCarrierName] = useState('Regional Express');

  const loadSupplierWorkspaceData = async () => {
    try {
      setLoading(true);
      const [offersRes, quotesRes, poolsRes, ordersRes] = await Promise.allSettled([
        searchSupplierOffers({ limit: 20 }),
        axiosClient.get('/quotes').then((r) => r.data?.data || r.data || []),
        axiosClient.get('/pools?state=UNDER_MOQ_DECISION_PENDING').then((r) => r.data?.data || r.data || []),
        listOrders({ limit: 20 }),
      ]);

      if (offersRes.status === 'fulfilled' && Array.isArray(offersRes.value)) {
        setOffers(offersRes.value);
      }
      if (quotesRes.status === 'fulfilled' && Array.isArray(quotesRes.value)) {
        setQuotes(quotesRes.value);
      }
      if (poolsRes.status === 'fulfilled' && Array.isArray(poolsRes.value)) {
        setUnderMoqPools(poolsRes.value);
      }
      if (ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value)) {
        setOrders(ordersRes.value);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSupplierWorkspaceData();
  }, []);

  // Handle Submit Quote Response (SAH-09)
  const handleSubmitQuoteResponse = async () => {
    if (!selectedQuote) return;
    try {
      setSubmittingAction(true);
      const unitPriceMinor = Math.round(parseFloat(quoteUnitPriceMajor) * 100);
      const shippingMinor = Math.round(parseFloat(quoteShippingMajor || '0') * 100);
      const validUntil = new Date(Date.now() + parseInt(quoteValidityDays, 10) * 86400000).toISOString();

      await axiosClient.patch(`/quotes/${selectedQuote._id}/respond`, {
        unitPriceMinor,
        shippingTotalMinor: shippingMinor,
        validUntil,
        status: 'OFFER_ACCEPTED',
      });

      notify?.('Binding quote response submitted to retailer.', 'success');
      setQuoteResponseModalOpen(false);
      await loadSupplierWorkspaceData();
    } catch (err) {
      notify?.(err?.response?.data?.message || err?.message || 'Failed to respond to quote.', 'error');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle Submit Sub-MOQ Feasibility (PRK-10)
  const handleSubmitFeasibility = async () => {
    if (!selectedPool) return;
    try {
      setSubmittingAction(true);
      const payload = {
        resolutionStatus: feasibilityDecision,
      };
      if (feasibilityDecision === 'REVISED_QUOTE_PROVIDED' && revisedPriceMajor) {
        payload.revisedUnitPriceMinor = Math.round(parseFloat(revisedPriceMajor) * 100);
      }

      await submitSupplierFeasibility(selectedPool._id, payload);
      notify?.('Under-MOQ feasibility resolution recorded.', 'success');
      setFeasibilityModalOpen(false);
      await loadSupplierWorkspaceData();
    } catch (err) {
      notify?.(err?.response?.data?.message || err?.message || 'Failed to submit feasibility.', 'error');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle Order Status Update (SRU-05)
  const handleUpdateOrderStatus = async (confirmationStatus) => {
    if (!selectedOrder) return;
    try {
      setSubmittingAction(true);
      const payload = {};
      if (confirmationStatus) {
        payload.supplierConfirmationStatus = confirmationStatus;
      } else {
        payload.dispatchStatus = dispatchStatus;
        payload.deliveryTrackingNumber = trackingNumber || undefined;
        payload.carrierName = carrierName || undefined;
      }

      await updateSupplierStatus(selectedOrder._id, payload);
      notify?.('Order status updated.', 'success');
      setFulfillmentModalOpen(false);
      await loadSupplierWorkspaceData();
    } catch (err) {
      notify?.(err?.response?.data?.message || err?.message || 'Failed to update order status.', 'error');
    } finally {
      setSubmittingAction(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-6" data-testid="supplier-portal-page">
      {/* ── Page Header with Required Test Identifiers ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-midnight-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Wholesaler Supplier Workspace</h1>
            <Badge variant="warning">Wave 4 (SUJ-08)</Badge>
          </div>
          <p className="text-xs text-midnight-muted mt-1">
            Dedicated workspace for regional distributors and manufacturers. Publish wholesale offers with MOQ_W and tier
            matrices, respond to incoming buyer quotes, and process finalized group purchase orders.
          </p>
        </div>

        <Badge variant="pool" className="self-start sm:self-auto font-mono text-xs">
          Role: {user?.role || 'SUPPLIER'}
        </Badge>
      </div>

      <SandboxDisclosureBanner />

      {/* ── Tabs Navigation ── */}
      <div className="flex items-center gap-2 border-b border-midnight-border/70 pb-2 overflow-x-auto">
        {[
          { id: 'OFFERS', label: `My Offers (${offers.length})`, icon: SlidersHorizontal },
          { id: 'QUOTES', label: `Incoming Quotes (${quotes.length})`, icon: FileText },
          { id: 'UNDER_MOQ', label: `Sub-MOQ Feasibility (${underMoqPools.length})`, icon: Clock },
          { id: 'ORDERS', label: `Purchase Orders (${orders.length})`, icon: Package },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === t.id
                  ? 'bg-midnight-emerald text-midnight-bg font-bold shadow-md'
                  : 'bg-midnight-surface border border-midnight-border text-slate-300 hover:border-slate-500'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Tab 1: Catalogue Offers ── */}
      {activeTab === 'OFFERS' && (
        <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-midnight-border/70 pb-3">
            <h2 className="text-base font-bold text-white">Active Wholesale Catalogue Offers</h2>
            <Button variant="primary" size="sm" onClick={() => navigate('/suppliers')}>
              <Plus className="h-4 w-4 mr-1" /> View Catalogue
            </Button>
          </div>

          {loading ? (
            <Skeleton className="h-32 w-full rounded-xl" />
          ) : offers.length === 0 ? (
            <p className="text-xs text-midnight-muted py-6 text-center">No active offers found.</p>
          ) : (
            <div className="divide-y divide-midnight-border/50 text-xs">
              {offers.map((offer) => (
                <div key={offer._id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-bold text-white text-sm">
                      {offer.productCanonicalName || offer.productId?.canonicalName || 'Wholesale Product'}
                    </p>
                    <p className="text-midnight-muted">
                      Wholesale MOQ: <strong className="text-slate-200">{offer.minimumOrderQuantity}</strong> • Pack:{' '}
                      <strong className="text-slate-200">{offer.packUnit || 'UNIT'}</strong> • Base Price:{' '}
                      <strong className="text-teal-300">
                        {formatMinorToMajor(offer.baseUnitPriceMinor || 0, offer.currency)}
                      </strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="pool">{offer.currency || 'INR'}</Badge>
                    <Badge variant="outline">{offer.dataSourceType || 'LIVE'}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 2: Incoming Quotes ── */}
      {activeTab === 'QUOTES' && (
        <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
          <div className="border-b border-midnight-border/70 pb-3">
            <h2 className="text-base font-bold text-white">Custom & Revised Buyer Quote Requests</h2>
            <p className="text-xs text-midnight-muted mt-0.5">
              Review custom procurement requests and submit binding wholesale pricing terms.
            </p>
          </div>

          {quotes.length === 0 ? (
            <p className="text-xs text-midnight-muted py-6 text-center">No pending quote requests.</p>
          ) : (
            <div className="divide-y divide-midnight-border/50 text-xs">
              {quotes.map((q) => (
                <div key={q._id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">
                        {q.productId?.canonicalName || 'Custom Item'}
                      </span>
                      <Badge variant="outline">{q.status}</Badge>
                    </div>
                    <p className="text-midnight-muted">
                      Requested Quantity: <strong className="text-slate-200">{q.requestedQuantity}</strong> units •
                      Delivery Area: <strong className="text-slate-200">{q.deliveryArea || 'Regional'}</strong>
                    </p>
                  </div>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setSelectedQuote(q);
                      setQuoteUnitPriceMajor('');
                      setQuoteResponseModalOpen(true);
                    }}
                  >
                    Respond to Quote <Send className="h-3 w-3 ml-1.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 3: Sub-MOQ Feasibility ── */}
      {activeTab === 'UNDER_MOQ' && (
        <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
          <div className="border-b border-midnight-border/70 pb-3">
            <h2 className="text-base font-bold text-white">Under-MOQ Feasibility Requests</h2>
            <p className="text-xs text-midnight-muted mt-0.5">
              Pools that reached 72h below MOQ. Decide whether to accept at current tier, provide a revised quote, or reject.
            </p>
          </div>

          {underMoqPools.length === 0 ? (
            <p className="text-xs text-midnight-muted py-6 text-center">No pools currently awaiting feasibility review.</p>
          ) : (
            <div className="divide-y divide-midnight-border/50 text-xs">
              {underMoqPools.map((pool) => (
                <div key={pool._id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-bold text-white text-sm">{pool.title}</p>
                    <p className="text-midnight-muted">
                      Achieved: <strong className="text-teal-300">{pool.totalEligibleQuantity || 0}</strong> /{' '}
                      <strong className="text-slate-300">{pool.targetMoq}</strong> {pool.packUnit} • Shortfall:{' '}
                      <strong className="text-rose-400">
                        {Math.max(0, (pool.targetMoq || 0) - (pool.totalEligibleQuantity || 0))}
                      </strong>
                    </p>
                  </div>

                  <Button
                    variant="warning"
                    size="sm"
                    onClick={() => {
                      setSelectedPool(pool);
                      setFeasibilityModalOpen(true);
                    }}
                  >
                    Resolve Feasibility
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 4: Purchase Orders ── */}
      {activeTab === 'ORDERS' && (
        <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
          <div className="border-b border-midnight-border/70 pb-3">
            <h2 className="text-base font-bold text-white">Finalized Group Purchase Orders</h2>
            <p className="text-xs text-midnight-muted mt-0.5">
              Confirm incoming group orders and dispatch fulfillment tracking milestones.
            </p>
          </div>

          {orders.length === 0 ? (
            <p className="text-xs text-midnight-muted py-6 text-center">No assigned purchase orders.</p>
          ) : (
            <div className="divide-y divide-midnight-border/50 text-xs">
              {orders.map((order) => (
                <div key={order._id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white">{order.orderNumber}</span>
                      <Badge variant="success">{order.supplierConfirmationStatus || 'CONFIRMED'}</Badge>
                      <Badge variant="pool">{order.orderState || 'PROCESSING'}</Badge>
                    </div>
                    <p className="text-midnight-muted">
                      Grand Total:{' '}
                      <strong className="text-teal-300">
                        {formatMinorToMajor(order.grandTotalMinor || 0, order.currency)}
                      </strong>{' '}
                      • {order.memberOrders?.length || 0} drop-off locations
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/orders/${order._id}`)}
                    >
                      View PO
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setSelectedOrder(order);
                        setFulfillmentModalOpen(true);
                      }}
                    >
                      Update Dispatch <Truck className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modal: Respond to Quote (SAH-09) ── */}
      <Dialog open={quoteResponseModalOpen} onOpenChange={setQuoteResponseModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Submit Binding Quote Response</DialogTitle>
            <DialogDescription>
              Provide binding wholesale pricing and validity date for requested quantity of {selectedQuote?.requestedQuantity} units.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3 text-xs">
            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">Unit Price (₹):</label>
              <Input
                type="number"
                step="0.01"
                value={quoteUnitPriceMajor}
                onChange={(e) => setQuoteUnitPriceMajor(e.target.value)}
                placeholder="e.g. 80.00"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">Total Shipping Share (₹):</label>
              <Input
                type="number"
                step="0.01"
                value={quoteShippingMajor}
                onChange={(e) => setQuoteShippingMajor(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">Quote Validity (Days):</label>
              <select
                className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-2.5"
                value={quoteValidityDays}
                onChange={(e) => setQuoteValidityDays(e.target.value)}
              >
                <option value="3">3 Days</option>
                <option value="7">7 Days</option>
                <option value="14">14 Days</option>
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setQuoteResponseModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={submittingAction || !quoteUnitPriceMajor}
              onClick={handleSubmitQuoteResponse}
            >
              Submit Binding Quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Sub-MOQ Feasibility (PRK-10) ── */}
      <Dialog open={feasibilityModalOpen} onOpenChange={setFeasibilityModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Under-MOQ Feasibility Resolution</DialogTitle>
            <DialogDescription>
              Pool reached {selectedPool?.totalEligibleQuantity} / {selectedPool?.targetMoq} units. Choose resolution:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3 text-xs">
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="feasibility"
                  value="ACCEPTED_SUB_MOQ"
                  checked={feasibilityDecision === 'ACCEPTED_SUB_MOQ'}
                  onChange={(e) => setFeasibilityDecision(e.target.value)}
                />
                <span className="text-white">Accept Sub-MOQ Order at Current Tier Price</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="feasibility"
                  value="REVISED_QUOTE_PROVIDED"
                  checked={feasibilityDecision === 'REVISED_QUOTE_PROVIDED'}
                  onChange={(e) => setFeasibilityDecision(e.target.value)}
                />
                <span className="text-white">Provide Revised Unit Price for Achieved Qty</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="feasibility"
                  value="REJECTED_SUB_MOQ"
                  checked={feasibilityDecision === 'REJECTED_SUB_MOQ'}
                  onChange={(e) => setFeasibilityDecision(e.target.value)}
                />
                <span className="text-rose-400">Reject Sub-MOQ Order (Triggers Full Buyer Refunds)</span>
              </label>
            </div>

            {feasibilityDecision === 'REVISED_QUOTE_PROVIDED' && (
              <div className="space-y-1 pt-2">
                <label className="text-slate-300 font-semibold">Revised Unit Price (₹):</label>
                <Input
                  type="number"
                  step="0.01"
                  value={revisedPriceMajor}
                  onChange={(e) => setRevisedPriceMajor(e.target.value)}
                  placeholder="e.g. 95.00"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setFeasibilityModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={submittingAction}
              onClick={handleSubmitFeasibility}
            >
              Submit Feasibility
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Order Fulfillment & Dispatch Tracking (SRU-05) ── */}
      <Dialog open={fulfillmentModalOpen} onOpenChange={setFulfillmentModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Order Fulfillment</DialogTitle>
            <DialogDescription>
              Update dispatch and tracking reference for {selectedOrder?.orderNumber}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3 text-xs">
            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">Fulfillment Status:</label>
              <select
                className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-2.5"
                value={dispatchStatus}
                onChange={(e) => setDispatchStatus(e.target.value)}
              >
                <option value="NOT_DISPATCHED">NOT DISPATCHED</option>
                <option value="DISPATCHED">DISPATCHED</option>
                <option value="DELIVERED">DELIVERED</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">Carrier / Fleet Name:</label>
              <Input
                value={carrierName}
                onChange={(e) => setCarrierName(e.target.value)}
                placeholder="e.g. North Fleet Logistics"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">Tracking Number / AWB:</label>
              <Input
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="e.g. TRK-2026-98765"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setFulfillmentModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={submittingAction}
              onClick={() => handleUpdateOrderStatus(null)}
            >
              Save Dispatch Details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SupplierPortalPage;
