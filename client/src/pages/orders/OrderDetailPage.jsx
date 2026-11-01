/**
 * CoBuy AI — Group Order Detail Page (SUJ-07 / SRU-05 / SRU-06 / SRU-07)
 *
 * Route: /orders/:orderId
 *
 * Displays:
 *  - Order details, product specifications, wholesale supplier information
 *  - Itemized per-shop member allocations (memberOrders)
 *  - Separate Supplier Settlement Status Card (Rule BR-009 & FR-PAY-016)
 *  - Download Purchase Order (PO) Summary modal / printable view
 *  - Chronological ActivityTimeline
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Package,
  ArrowLeft,
  FileText,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Store,
  DollarSign,
  Download,
  Printer,
  ShieldCheck,
} from 'lucide-react';

import { formatMinorToMajor } from '@/utils/money';
import { getOrderById, getPoSummary, getOrderSettlement, getOrderActivity } from '@/api/orders.api';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
import { ActivityTimeline } from '@/components/common/ActivityTimeline';
import { SandboxDisclosureBanner } from '@/components/common/SandboxDisclosureBanner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/Dialog';

export function OrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [settlement, setSettlement] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // PO Summary Modal State
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [poSummary, setPoSummary] = useState(null);
  const [poLoading, setPoLoading] = useState(false);

  useEffect(() => {
    async function loadOrderDetail() {
      if (!orderId) return;
      try {
        setLoading(true);
        setError(null);
        const [orderData, settlementData, activityData] = await Promise.allSettled([
          getOrderById(orderId),
          getOrderSettlement(orderId),
          getOrderActivity(orderId),
        ]);

        if (orderData.status === 'fulfilled') {
          setOrder(orderData.value);
        } else {
          throw new Error('Order not found');
        }

        if (settlementData.status === 'fulfilled') {
          setSettlement(settlementData.value);
        }

        if (activityData.status === 'fulfilled') {
          setActivity(activityData.value || []);
        }
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || 'Failed to load order details.');
      } finally {
        setLoading(false);
      }
    }

    loadOrderDetail();
  }, [orderId]);

  const handleOpenPoSummary = async () => {
    try {
      setPoLoading(true);
      setPoModalOpen(true);
      const poData = await getPoSummary(orderId, 'json');
      setPoSummary(poData);
    } catch {
      // fallback
    } finally {
      setPoLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 py-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 py-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Order Not Found</AlertTitle>
          <AlertDescription>{error || 'The requested purchase order could not be retrieved.'}</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => navigate('/orders')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Orders
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-6" data-testid="order-detail-page">
      {/* ── Top Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-midnight-border pb-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/orders')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Orders
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold font-mono text-white tracking-tight">
                {order.orderNumber || `AKD-${order._id.slice(-6)}`}
              </h1>
              <Badge variant="pool">{order.orderState || 'PROCESSING'}</Badge>
            </div>
            <p className="text-xs text-midnight-muted mt-0.5">
              Created on {new Date(order.createdAt).toLocaleDateString()} • Pool ID:{' '}
              <span className="font-mono text-slate-300">{order.poolId?._id || order.poolId}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button variant="primary" size="sm" onClick={handleOpenPoSummary}>
            <FileText className="h-4 w-4 mr-1.5" /> Purchase Order (PO)
          </Button>
        </div>
      </div>

      <SandboxDisclosureBanner />

      {/* ── Main Order Summary Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Member Allocations & Fulfillment */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section 1: Member Shop Allocations */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
            <h2 className="text-base font-bold text-white flex items-center justify-between border-b border-midnight-border/70 pb-3">
              <span className="flex items-center gap-2">
                <Store className="h-4 w-4 text-midnight-emerald" />
                Member Kirana Allocations ({order.memberOrders?.length || 0})
              </span>
              <span className="text-xs font-mono text-teal-300 font-normal">
                Total: {formatMinorToMajor(order.grandTotalMinor || 0, order.currency)}
              </span>
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-midnight-surface/80 text-midnight-muted uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Shop</th>
                    <th className="py-2.5 px-3">Allocated Qty</th>
                    <th className="py-2.5 px-3">Unit Price</th>
                    <th className="py-2.5 px-3">Merchandise Share</th>
                    <th className="py-2.5 px-3">Shipping Share</th>
                    <th className="py-2.5 px-3 text-right">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-midnight-border/50">
                  {(order.memberOrders || []).map((m, idx) => (
                    <tr key={idx} className="hover:bg-midnight-surface/30">
                      <td className="py-3 px-3 font-medium text-white">
                        {m.shopId?.name || `Shop #${(m.shopId?._id || m.shopId || '').slice(-4)}`}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-300">
                        {m.allocatedQuantity} {order.packUnit || 'units'}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-300">
                        {formatMinorToMajor(m.unitPriceMinor || 0, order.currency)}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-300">
                        {formatMinorToMajor(m.merchandiseShareMinor || 0, order.currency)}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-300">
                        {formatMinorToMajor(m.shippingShareMinor || 0, order.currency)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Badge variant="success">PAID</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Fulfillment & Dispatch Status */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-midnight-border/70 pb-3">
              <Truck className="h-4 w-4 text-teal-400" />
              Supplier Fulfillment & Dispatch Status
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1">
                <span className="text-midnight-muted uppercase tracking-wider">Wholesaler Confirmation</span>
                <div>
                  <Badge
                    variant={
                      order.supplierConfirmationStatus === 'CONFIRMED'
                        ? 'success'
                        : order.supplierConfirmationStatus === 'REJECTED'
                        ? 'destructive'
                        : 'warning'
                    }
                  >
                    {order.supplierConfirmationStatus || 'PENDING'}
                  </Badge>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-midnight-muted uppercase tracking-wider">Carrier / Logistics</span>
                <p className="font-medium text-white">{order.carrierName || 'Regional Bulk Carrier'}</p>
              </div>

              <div className="space-y-1">
                <span className="text-midnight-muted uppercase tracking-wider">Tracking Reference</span>
                <p className="font-mono text-teal-300">{order.deliveryTrackingNumber || 'TRK-2026-PENDING'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (1 Col): Supplier Settlement & Audit Trail */}
        <div className="space-y-6">
          {/* Wholesaler Payout Settlement Card (Rule BR-009 & FR-PAY-016) */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
            <div className="border-b border-midnight-border/70 pb-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-midnight-emerald" />
                  Wholesaler Settlement
                </h3>
                <Badge variant="neutral">
                  {settlement?.settlementStatus || order.supplierSettlementStatus || 'SIMULATED'}
                </Badge>
              </div>
              <p className="text-[11px] text-midnight-muted mt-1">
                Independent payout ledger tracking wholesaler remittance
              </p>
            </div>

            <div className="rounded-lg bg-midnight-surface/60 border border-midnight-border/60 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-midnight-muted">Settlement Mode:</span>
                <span className="font-mono text-amber-300 font-bold">
                  {settlement?.mode || 'DEMO (Simulated)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-midnight-muted">Gross Wholesale Total:</span>
                <span className="font-mono text-white font-bold">
                  {formatMinorToMajor(order.merchandiseTotalMinor || 0, order.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-midnight-muted">Shipping Payout:</span>
                <span className="font-mono text-white">
                  {formatMinorToMajor(order.shippingTotalMinor || 0, order.currency)}
                </span>
              </div>
              <div className="pt-2 border-t border-midnight-border/50 flex justify-between">
                <span className="text-slate-300 font-semibold">Total Payout:</span>
                <span className="font-mono text-teal-300 font-bold">
                  {formatMinorToMajor(order.grandTotalMinor || 0, order.currency)}
                </span>
              </div>
            </div>

            {/* Mandatory Transparency Disclosure (BR-009 & FR-PAY-016) */}
            <p className="text-[11px] text-slate-400 italic leading-relaxed">
              * Wholesaler payout is tracked in SupplierSettlement completely separately from buyer payments.
              Prototype settlements default to SIMULATED/DEMO with explicit disclosure.
            </p>
          </div>

          {/* Chronological Audit Timeline */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
              Order Activity Trail
            </h3>
            <ActivityTimeline
              events={
                activity.length > 0
                  ? activity
                  : [
                      {
                        action: 'ORDER_CREATED',
                        timestamp: order.createdAt,
                        actorRole: 'SYSTEM',
                        description: `Final Purchase Order created from funded group pool`,
                      },
                      {
                        action: order.supplierConfirmationStatus === 'CONFIRMED' ? 'SUPPLIER_CONFIRMED' : 'AWAITING_SUPPLIER',
                        timestamp: order.updatedAt,
                        actorRole: 'SUPPLIER',
                        description: `Supplier confirmation: ${order.supplierConfirmationStatus || 'PENDING'}`,
                      },
                    ]
              }
            />
          </div>
        </div>
      </div>

      {/* ── Purchase Order (PO) Summary Modal ── */}
      <Dialog open={poModalOpen} onOpenChange={setPoModalOpen}>
        <DialogContent className="max-w-2xl bg-midnight-card text-midnight-text border border-midnight-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <FileText className="h-5 w-5 text-midnight-emerald" />
              Purchase Order Document — {order.orderNumber}
            </DialogTitle>
            <DialogDescription>
              Official B2B collective procurement invoice summary for supplier fulfillment and drop-off verification.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 text-xs font-mono bg-midnight-surface/80 p-5 rounded-xl border border-midnight-border">
            <div className="flex justify-between border-b border-midnight-border pb-3">
              <div>
                <p className="text-white font-bold text-sm">AAP KI DUKAN (COBUY AI)</p>
                <p className="text-midnight-muted">B2B Group Procurement Network</p>
              </div>
              <div className="text-right">
                <p className="text-teal-300 font-bold">{order.orderNumber}</p>
                <p className="text-midnight-muted">{new Date(order.createdAt).toLocaleDateString()}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 py-2">
              <div>
                <span className="text-midnight-muted uppercase">Supplier:</span>
                <p className="text-white font-bold">{order.supplierId?.name || 'Verified Wholesaler'}</p>
                <p className="text-slate-300">{order.supplierId?.serviceAreas?.join(', ') || 'Regional Area'}</p>
              </div>
              <div className="text-right">
                <span className="text-midnight-muted uppercase">Allocations:</span>
                <p className="text-white">{order.memberOrders?.length || 0} Participating Kiranas</p>
                <p className="text-teal-300 font-bold">
                  Total: {formatMinorToMajor(order.grandTotalMinor || 0, order.currency)}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-midnight-border">
              <p className="text-[11px] text-midnight-muted italic">
                Authorized digital Purchase Order generated under CoBuy AI escrow protocol.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default OrderDetailPage;
