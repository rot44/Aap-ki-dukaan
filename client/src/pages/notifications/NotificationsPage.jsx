/**
 * CoBuy AI — In-App Notification Center (SUJ-07 / SRU-08)
 *
 * Route: /notifications
 *
 * Provides real-time alerts across all 19 procurement lifecycle events:
 *  - Pool joined, payment verified/failed, MOQ milestone reached, early lock
 *  - 72h expiry, 24h decision required, quote revised, snapshot approval
 *  - Refund initiated/completed/failed, order confirmed/rejected/updated
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  Clock,
  RotateCcw,
  Package,
  Layers,
  Sparkles,
  ExternalLink,
  Check,
} from 'lucide-react';

import { useNotifications } from '@/context/NotificationContext';
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/api/notifications.api';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

function getEventIcon(eventType = '') {
  const upper = eventType.toUpperCase();
  if (upper.includes('PAY') || upper.includes('CAPTURE')) {
    return { icon: CreditCard, color: 'text-amber-400 bg-amber-950/60' };
  }
  if (upper.includes('REFUND')) {
    return { icon: RotateCcw, color: 'text-rose-400 bg-rose-950/60' };
  }
  if (upper.includes('ORDER')) {
    return { icon: Package, color: 'text-cyan-400 bg-cyan-950/60' };
  }
  if (upper.includes('DECISION') || upper.includes('EXPIR')) {
    return { icon: AlertTriangle, color: 'text-yellow-400 bg-yellow-950/60' };
  }
  if (upper.includes('APPROV') || upper.includes('LOCK')) {
    return { icon: CheckCircle2, color: 'text-emerald-400 bg-emerald-950/60' };
  }
  return { icon: Layers, color: 'text-teal-400 bg-teal-950/60' };
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const { unreadCount, fetchUnreadCount } = useNotifications();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL'); // ALL | UNREAD

  const loadNotificationsList = async () => {
    try {
      setLoading(true);
      const res = await fetchNotifications();
      const list = res?.data?.notifications || res?.data || res || [];
      setNotifications(Array.isArray(list) ? list : []);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotificationsList();
  }, []);

  const handleMarkRead = async (id) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
      );
      fetchUnreadCount?.();
    } catch {
      // fallback
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      fetchUnreadCount?.();
    } catch {
      // fallback
    }
  };

  const filtered = notifications.filter((n) => {
    if (filter === 'UNREAD') return !n.isRead;
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6" data-testid="notifications-page">
      {/* ── Page Header with Required Test Identifiers ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-midnight-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Notification Center</h1>
            <Badge variant="warning">Wave 4 (SUJ-07)</Badge>
          </div>
          <p className="text-xs text-midnight-muted mt-1">
            Real-time procurement alerts, pool milestone updates, tier discount unlocks, and order dispatch notices
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
            <Check className="h-3.5 w-3.5 mr-1.5" /> Mark All Read
          </Button>
        </div>
      </div>

      {/* ── Filter Tabs ── */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFilter('ALL')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            filter === 'ALL'
              ? 'bg-midnight-emerald text-midnight-bg font-bold'
              : 'bg-midnight-surface border border-midnight-border text-slate-300 hover:border-slate-500'
          }`}
        >
          All Notifications ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('UNREAD')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            filter === 'UNREAD'
              ? 'bg-midnight-emerald text-midnight-bg font-bold'
              : 'bg-midnight-surface border border-midnight-border text-slate-300 hover:border-slate-500'
          }`}
        >
          Unread Only ({notifications.filter((n) => !n.isRead).length})
        </button>
      </div>

      {/* ── Notifications List ── */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-midnight-border bg-midnight-card p-12 text-center space-y-3 shadow-xl">
          <div className="inline-flex p-3 rounded-full bg-midnight-surface border border-midnight-border text-midnight-muted mx-auto">
            <Bell className="h-8 w-8" />
          </div>
          <h3 className="text-base font-bold text-white">No Notifications Found</h3>
          <p className="text-xs text-midnight-muted max-w-sm mx-auto">
            You're all caught up! Live milestone events and decision prompts will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-midnight-border bg-midnight-card divide-y divide-midnight-border/60 overflow-hidden shadow-xl">
          {filtered.map((item) => {
            const { icon: Icon, color } = getEventIcon(item.type || item.eventType);

            return (
              <div
                key={item._id}
                className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                  !item.isRead ? 'bg-midnight-surface/50' : 'hover:bg-midnight-surface/30'
                }`}
              >
                <div className="flex items-start gap-3 flex-1">
                  <div className={`p-2 rounded-lg border border-midnight-border/50 ${color} mt-0.5`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      {!item.isRead && (
                        <span className="h-2 w-2 rounded-full bg-midnight-emerald animate-pulse" />
                      )}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{item.message}</p>
                    <p className="text-[11px] text-midnight-muted">
                      {new Date(item.createdAt).toLocaleString()} • {item.type}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  {item.poolId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/group-buys/${item.poolId}`)}
                    >
                      View Pool <ExternalLink className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                  {item.orderId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/orders/${item.orderId}`)}
                    >
                      View Order <ExternalLink className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                  {!item.isRead && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-400 hover:text-white"
                      onClick={() => handleMarkRead(item._id)}
                    >
                      Mark Read
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default NotificationsPage;
