import { useState, useEffect, useCallback } from 'react';
import {
  Package,
  AlertTriangle,
  Clock,
  TrendingDown,
  Plus,
  Siren,
  X,
  Search,
  Inbox,
} from 'lucide-react';
import {
  fetchSkus,
  fetchInventoryByHospital,
  addInventoryBatch,
  createStockoutRequest,
  fetchOpenStockouts,
  type InventoryWithRelations,
  type StockoutWithRelations,
} from '@/lib/data';
import type { Sku, Urgency } from '@/lib/types';
import { computeSurplus } from '@/lib/surplus';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/AuthContext';

export default function PharmacistDashboard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const hospitalId = user?.hospitalId ?? '';
  const [skus, setSkus] = useState<Sku[]>([]);
  const [inventory, setInventory] = useState<InventoryWithRelations[]>([]);
  const [stockouts, setStockouts] = useState<StockoutWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddBatch, setShowAddBatch] = useState(false);
  const [showStockout, setShowStockout] = useState(false);
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    try {
      const s = await fetchSkus();
      setSkus(s);
    } catch (err) {
      console.error('Failed to load data:', err);
      toast('Failed to load SKU data', 'error');
    }
  }, [toast]);

  const loadInventory = useCallback(async () => {
    if (!hospitalId) return;
    setLoading(true);
    try {
      const [inv, so] = await Promise.all([
        fetchInventoryByHospital(hospitalId),
        fetchOpenStockouts(),
      ]);
      setInventory(inv);
      setStockouts(so);
    } catch (err) {
      console.error('Failed to load inventory:', err);
      toast('Failed to load inventory data', 'error');
    } finally {
      setLoading(false);
    }
  }, [hospitalId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const filteredInventory = inventory.filter(
    (b) =>
      b.sku?.name?.toLowerCase().includes(search.toLowerCase()) ||
      b.batch_number?.toLowerCase().includes(search.toLowerCase())
  );

  const myStockouts = stockouts.filter((s) => s.hospital_id === hospitalId);

  const today = new Date();
  const surplusResults = filteredInventory.map((b) => computeSurplus(b, today));
  const atRiskCount = surplusResults.filter((s) => s.is_at_risk).length;
  const expiringSoonCount = filteredInventory.filter((b) => {
    const days = Math.ceil((new Date(b.expiry_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return days <= 30 && days > 0;
  }).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Pharmacist Dashboard</h2>
        <p className="text-sm text-slate-500 mt-1">Manage your hospital's inventory batches and report shortages</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <StatCard icon={<Package className="w-5 h-5" />} label="Active Batches" value={filteredInventory.length} color="teal" />
            <StatCard icon={<AlertTriangle className="w-5 h-5" />} label="At-Risk Surplus" value={atRiskCount} color="amber" />
            <StatCard icon={<Clock className="w-5 h-5" />} label="Expiring ≤30 Days" value={expiringSoonCount} color="red" />
            <StatCard icon={<TrendingDown className="w-5 h-5" />} label="My Open Stockouts" value={myStockouts.length} color="blue" />
          </>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => setShowAddBatch(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 transition-colors shadow-sm shadow-teal-600/20"
        >
          <Plus className="w-4 h-4" />
          Add Inventory Batch
        </button>
        <button
          onClick={() => setShowStockout(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors"
        >
          <Siren className="w-4 h-4" />
          Report Stockout
        </button>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-900">Inventory Batches</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search batches..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent w-48 sm:w-64"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-500">
                <th className="px-5 py-3 font-medium">SKU</th>
                <th className="px-5 py-3 font-medium">Batch #</th>
                <th className="px-5 py-3 font-medium text-right">Qty</th>
                <th className="px-5 py-3 font-medium text-right">Run Rate/day</th>
                <th className="px-5 py-3 font-medium">Expiry Date</th>
                <th className="px-5 py-3 font-medium text-right">Days Left</th>
                <th className="px-5 py-3 font-medium text-right">Surplus</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-32" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-20" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-8 ml-auto" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-8 ml-auto" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-24" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-10 ml-auto" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-10 ml-auto" /></td>
                    <td className="px-5 py-4"><div className="h-5 bg-slate-100 rounded animate-pulse w-20" /></td>
                  </tr>
                ))
              ) : filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12">
                    <EmptyState
                      icon={<Package className="w-8 h-8" />}
                      title="No inventory batches found"
                      message={search ? "Try a different search term." : "Add an inventory batch to get started."}
                    />
                  </td>
                </tr>
              ) : (
                filteredInventory.map((batch, idx) => {
                  const surplus = surplusResults[idx];
                  const daysLeft = surplus.days_to_expiry;
                  const isExpiringSoon = daysLeft <= 30;
                  const isCritical = daysLeft <= 14;
                  return (
                    <tr key={batch.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-slate-900">{batch.sku?.name}</div>
                        <div className="text-xs text-slate-400">{batch.sku?.category}</div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-slate-600">{batch.batch_number}</td>
                      <td className="px-5 py-3.5 text-right font-medium text-slate-900">{batch.quantity}</td>
                      <td className="px-5 py-3.5 text-right text-slate-600">{batch.daily_run_rate}</td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {new Date(batch.expiry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${
                            isCritical ? 'bg-red-100 text-red-700' : isExpiringSoon ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {daysLeft}d
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className={`font-medium ${surplus.surplus > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                          {surplus.surplus > 0 ? `+${surplus.surplus}` : surplus.surplus}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {surplus.is_at_risk ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            At-Risk Surplus
                          </span>
                        ) : isCritical ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-medium">
                            <Clock className="w-3 h-3" />
                            Critical
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium">
                            Active
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* My Open Stockouts */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-900">My Open Stockout Requests</h3>
        </div>
        {loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 bg-slate-100 rounded animate-pulse w-40" />
                  <div className="h-3 bg-slate-100 rounded animate-pulse w-56" />
                </div>
                <div className="h-6 bg-slate-100 rounded animate-pulse w-16" />
              </div>
            ))}
          </div>
        ) : myStockouts.length === 0 ? (
          <EmptyState
            icon={<Inbox className="w-8 h-8" />}
            title="No open stockout requests"
            message="This hospital has no active shortages. Use 'Report Stockout' to flag one."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {myStockouts.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-5 hover:bg-slate-50 transition-colors">
                <div>
                  <div className="font-medium text-slate-900">{s.sku?.name}</div>
                  <div className="text-sm text-slate-500">
                    Need: {s.quantity_needed} units · Reported {new Date(s.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span
                  className={`inline-flex px-3 py-1 rounded-lg text-xs font-medium ${
                    s.urgency === 'emergency' ? 'bg-red-100 text-red-700' : s.urgency === 'urgent' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {s.urgency.charAt(0).toUpperCase() + s.urgency.slice(1)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Batch Modal */}
      {showAddBatch && (
        <AddBatchModal
          hospitalId={hospitalId}
          skus={skus}
          onClose={() => setShowAddBatch(false)}
          onAdded={() => {
            setShowAddBatch(false);
            loadInventory();
            toast('Inventory batch added successfully', 'success');
          }}
        />
      )}

      {/* Report Stockout Modal */}
      {showStockout && (
        <StockoutModal
          hospitalId={hospitalId}
          skus={skus}
          onClose={() => setShowStockout(false)}
          onSubmitted={() => {
            setShowStockout(false);
            loadInventory();
            toast('Stockout reported successfully', 'success');
          }}
        />
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: 'teal' | 'amber' | 'red' | 'blue' }) {
  const colors = {
    teal: 'bg-teal-50 text-teal-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    blue: 'bg-blue-50 text-blue-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 transition-transform duration-200 hover:-translate-y-0.5">
      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${colors[color]} mb-3`}>{icon}</div>
      <div className="font-display text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="w-10 h-10 bg-slate-100 rounded-xl animate-pulse mb-3" />
      <div className="h-7 bg-slate-100 rounded animate-pulse w-16 mb-2" />
      <div className="h-4 bg-slate-100 rounded animate-pulse w-24" />
    </div>
  );
}

function EmptyState({ icon, title, message }: { icon: React.ReactNode; title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-50 text-slate-300 mb-3">{icon}</div>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      <p className="text-sm text-slate-400 mt-1">{message}</p>
    </div>
  );
}

function AddBatchModal({ hospitalId, skus, onClose, onAdded }: { hospitalId: string; skus: Sku[]; onClose: () => void; onAdded: () => void }) {
  const [skuId, setSkuId] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [quantity, setQuantity] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [dailyRunRate, setDailyRunRate] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!skuId) e.skuId = 'Please select a SKU';
    if (!batchNumber.trim()) e.batchNumber = 'Batch number is required';
    const qty = parseInt(quantity);
    if (!quantity || isNaN(qty) || qty <= 0) e.quantity = 'Quantity must be a positive number';
    if (!expiryDate) e.expiryDate = 'Expiry date is required';
    else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (new Date(expiryDate) < today) e.expiryDate = 'Expiry date cannot be in the past';
    }
    const cost = parseFloat(unitCost);
    if (!unitCost || isNaN(cost) || cost <= 0) e.unitCost = 'Unit cost must be greater than 0';
    const rate = parseInt(dailyRunRate);
    if (!dailyRunRate || isNaN(rate) || rate <= 0) e.dailyRunRate = 'Run rate must be at least 1';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setErrors({});
    try {
      await addInventoryBatch({
        hospital_id: hospitalId,
        sku_id: skuId,
        batch_number: batchNumber.trim(),
        quantity: parseInt(quantity),
        expiry_date: expiryDate,
        unit_cost: parseFloat(unitCost),
        daily_run_rate: parseInt(dailyRunRate),
      });
      onAdded();
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Failed to add batch' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-900">Add Inventory Batch</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <Field label="SKU" error={errors.skuId}>
            <select value={skuId} onChange={(e) => { setSkuId(e.target.value); const s = skus.find((sku) => sku.id === e.target.value); if (s) { setUnitCost(s.unit_cost.toString()); setDailyRunRate(s.default_daily_run_rate.toString()); } }} className={`input ${errors.skuId ? 'border-red-300 ring-red-500' : ''}`}>
              <option value="">Select SKU...</option>
              {skus.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </Field>
          <Field label="Batch Number" error={errors.batchNumber}>
            <input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="e.g. AVN-2026Z" className={`input ${errors.batchNumber ? 'border-red-300 ring-red-500' : ''}`} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Quantity" error={errors.quantity}>
              <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={`input ${errors.quantity ? 'border-red-300 ring-red-500' : ''}`} />
            </Field>
            <Field label="Expiry Date" error={errors.expiryDate}>
              <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={`input ${errors.expiryDate ? 'border-red-300 ring-red-500' : ''}`} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Unit Cost (₹)" error={errors.unitCost}>
              <input type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className={`input ${errors.unitCost ? 'border-red-300 ring-red-500' : ''}`} />
            </Field>
            <Field label="Daily Run Rate" error={errors.dailyRunRate}>
              <input type="number" min="1" value={dailyRunRate} onChange={(e) => setDailyRunRate(e.target.value)} className={`input ${errors.dailyRunRate ? 'border-red-300 ring-red-500' : ''}`} />
            </Field>
          </div>
          {errors.form && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{errors.form}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50 shadow-sm shadow-teal-600/20">
              {saving ? 'Saving...' : 'Add Batch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StockoutModal({ hospitalId, skus, onClose, onSubmitted }: { hospitalId: string; skus: Sku[]; onClose: () => void; onSubmitted: () => void }) {
  const [skuId, setSkuId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [urgency, setUrgency] = useState<Urgency>('routine');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!skuId) e.skuId = 'Please select a SKU';
    const qty = parseInt(quantity);
    if (!quantity || isNaN(qty) || qty <= 0) e.quantity = 'Quantity must be a positive number';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setErrors({});
    try {
      await createStockoutRequest({ hospital_id: hospitalId, sku_id: skuId, quantity_needed: parseInt(quantity), urgency });
      onSubmitted();
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Failed to submit request' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-900">Report Stockout</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <Field label="SKU Needed" error={errors.skuId}>
            <select value={skuId} onChange={(e) => setSkuId(e.target.value)} className={`input ${errors.skuId ? 'border-red-300 ring-red-500' : ''}`}>
              <option value="">Select SKU...</option>
              {skus.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </Field>
          <Field label="Quantity Needed" error={errors.quantity}>
            <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={`input ${errors.quantity ? 'border-red-300 ring-red-500' : ''}`} />
          </Field>
          <Field label="Urgency Level">
            <div className="grid grid-cols-3 gap-2">
              {(['routine', 'urgent', 'emergency'] as Urgency[]).map((u) => (
                <button key={u} type="button" onClick={() => setUrgency(u)}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium capitalize transition-all ${
                    urgency === u
                      ? u === 'emergency' ? 'bg-red-600 text-white shadow-sm' : u === 'urgent' ? 'bg-amber-500 text-white shadow-sm' : 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >{u}</button>
              ))}
            </div>
          </Field>
          {errors.form && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{errors.form}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm shadow-red-600/20">
              {saving ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
