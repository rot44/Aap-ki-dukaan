/**
 * CoBuy AI — Business Profile & Settings Page (HIM-06 / PRK-04)
 *
 * Route: /profile
 *
 * Manages Kirana / Retailer shop identity, delivery location, GSTIN,
 * contact details, and trade category preferences.
 */

import React, { useState, useEffect } from 'react';
import {
  User,
  Store,
  MapPin,
  Phone,
  Mail,
  Shield,
  CheckCircle2,
  AlertCircle,
  Save,
  Loader2,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { getMyShop, updateMyShop } from '@/api/shop.api';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';

const DELIVERY_AREAS = [
  'LUCKNOW',
  'KANPUR',
  'VARANASI',
  'AGRA',
  'NOIDA',
  'GHAZIABAD',
  'DELHI_NCR',
  'PRAYAGRAJ',
  'MEERUT',
  'BAREILLY',
];

export function ProfilePage() {
  const { user, shop, setShop } = useAuth();
  const { notify } = useNotifications();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    name: shop?.name || '',
    ownerName: shop?.ownerName || user?.name || '',
    contactPhone: shop?.contactPhone || '',
    street: typeof shop?.address === 'string' ? shop.address : shop?.address?.street || '',
    deliveryArea: shop?.deliveryArea || 'LUCKNOW',
    gstin: shop?.gstin || '',
  });

  useEffect(() => {
    let active = true;
    async function loadShopProfile() {
      try {
        const data = await getMyShop().catch(() => null);
        if (active && data) {
          setFormData({
            name: data.name || '',
            ownerName: data.ownerName || data.contactPerson || user?.name || '',
            contactPhone: data.contactPhone || data.phone || '',
            street: data.address?.street || (typeof data.address === 'string' ? data.address : ''),
            deliveryArea: data.address?.area || data.deliveryArea || 'LUCKNOW',
            gstin: data.gstin || '',
          });
        }
      } catch {
        // graceful fallback to context
      }
    }

    loadShopProfile();
    return () => {
      active = false;
    };
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage('');

      const payload = {
        name: formData.name,
        ownerName: formData.ownerName,
        contactPhone: formData.contactPhone,
        address: {
          street: formData.street,
          area: formData.deliveryArea,
        },
        deliveryArea: formData.deliveryArea,
        gstin: formData.gstin || undefined,
      };

      const updated = await updateMyShop(payload);
      if (setShop && updated) {
        setShop(updated);
      }
      setSuccessMessage('Business profile updated successfully.');
      notify?.('Shop profile updated successfully!', 'success');
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to save shop profile.';
      setError(msg);
      notify?.(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6" data-testid="profile-page">
      {/* ── Page Header with Required Test Identifiers (Always Rendered) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-midnight-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Business Profile & Settings</h1>
            <Badge variant="warning">Wave 3 (HIM-06)</Badge>
          </div>
          <p className="text-xs text-midnight-muted mt-1">
            Manage kirana business identity, verified delivery drop location, and GSTIN trade credentials
          </p>
        </div>

        <Badge variant="pool" className="self-start sm:self-auto font-mono text-xs">
          Role: {user?.role || 'SHOP_OWNER'}
        </Badge>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Profile Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Shop & Identity */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-5 shadow-xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-midnight-border/70 pb-3">
              <Store className="h-4 w-4 text-midnight-emerald" />
              Kirana / Shop Identity
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Shop / Business Name</label>
                <Input
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g. Hazratganj Super Store"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Owner / Authorized Representative</label>
                <Input
                  name="ownerName"
                  value={formData.ownerName}
                  onChange={handleChange}
                  placeholder="e.g. Ramesh Kumar"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Contact Phone (+91)</label>
                <Input
                  name="contactPhone"
                  value={formData.contactPhone}
                  onChange={handleChange}
                  placeholder="e.g. 9876543210"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">GSTIN / Tax Identifier (Optional)</label>
                <Input
                  name="gstin"
                  value={formData.gstin}
                  onChange={handleChange}
                  placeholder="09AAAAA0000A1Z5"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Delivery & Logistics Area */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-5 shadow-xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-midnight-border/70 pb-3">
              <MapPin className="h-4 w-4 text-teal-400" />
              Delivery Drop Location & Regional Area
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Street Address / Landmark</label>
                <Input
                  name="street"
                  value={formData.street}
                  onChange={handleChange}
                  placeholder="Shop No. 12, Market Road, Near Clock Tower"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Regional Delivery Area</label>
                <select
                  name="deliveryArea"
                  value={formData.deliveryArea}
                  onChange={handleChange}
                  className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-sm p-2.5 focus:border-midnight-emerald focus:outline-none"
                >
                  {DELIVERY_AREAS.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-midnight-muted">
                  Pool discovery and regional supplier quotes are strictly filtered by this delivery area.
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: User Authentication Details */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-midnight-border/70 pb-3">
              <Shield className="h-4 w-4 text-slate-400" />
              Account Security & Linked User
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-midnight-muted">Registered Email:</span>
                <p className="font-mono text-white font-medium">{user?.email || 'N/A'}</p>
              </div>
              <div>
                <span className="text-xs text-midnight-muted">Access Level / Role:</span>
                <p className="font-medium text-teal-300">{user?.role || 'SHOP_OWNER'}</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving Changes...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" /> Save Profile
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export default ProfilePage;
