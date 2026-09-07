import { useState, useEffect, useCallback } from 'react';
import {
  IndianRupee,
  Boxes,
  TrendingUp,
  Zap,
  Truck,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  XCircle,
  Snowflake,
  RotateCcw,
  Inbox,
  Package,
  X,
} from 'lucide-react';
import {
  fetchHospitals,
  fetchSkus,
  fetchAllInventory,
  fetchOpenStockouts,
  fetchAllTransfers,
  fetchAllTransactions,
  fetchSkuColdChainMap,
  createTransfers,
  updateTransferStatus,
  completeTransfer,
  resetDemoData,
  type InventoryWithRelations,
  type StockoutWithRelations,
  type TransferWithRelations,
  type TransactionWithRelations,
} from '@/lib/data';
import type { Hospital, Sku, Allocation } from '@/lib/types';
import { getAtRiskSurplus } from '@/lib/surplus';
import { rebalance } from '@/lib/rebalance';
import TransferMap from '@/components/TransferMap';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/AuthContext';

interface RebalanceSummary {
  matchedCount: number;
  unfulfilledCount: number;
  totalCost: number;
  totalSavings: number;
  allocations: Allocation[];
  unfulfilled: { request_id: string; sku_id: string; quantity_remaining: number }[];
}

export default function AdminDashboard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isNetworkAdmin = user?.role === 'network_admin';
  const userHospitalId = user?.hospitalId ?? '';
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [skus, setSkus] = useState<Sku[]>([]);
  const [inventory, setInventory] = useState<InventoryWithRelations[]>([]);
  const [stockouts, setStockouts] = useState<StockoutWithRelations[]>([]);
  const [transfers, setTransfers] = useState<TransferWithRelations[]>([]);
  const [transactions, setTransactions] = useState<TransactionWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [rebalanceSummary, setRebalanceSummary] = useState<RebalanceSummary | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [h, s, inv, so, tr, tx] = await Promise.all([
        fetchHospitals(),
        fetchSkus(),
        fetchAllInventory(),
        fetchOpenStockouts(),
        fetchAllTransfers(),
        fetchAllTransactions(),
      ]);
      setHospitals(h);
      setSkus(s);
      setInventory(inv);
      setStockouts(so);
      setTransfers(tr);
      setTransactions(tx);
    } catch (err) {
      console.error('Failed to load admin data:', err);
      toast('Failed to load network data', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Scope data by role: network_admin sees everything; hospital admin sees only their own hospital
  const scopedInventory = isNetworkAdmin
    ? inventory
    : inventory.filter((b) => b.hospital_id === userHospitalId);
  const scopedStockouts = isNetworkAdmin
    ? stockouts
    : stockouts.filter((s) => s.hospital_id === userHospitalId);
  const scopedTransfers = isNetworkAdmin
    ? transfers
    : transfers.filter(
        (t) => t.from_hospital_id === userHospitalId || t.to_hospital_id === userHospitalId
      );
  const scopedTransactions = isNetworkAdmin
    ? transactions
    : transactions.filter(
        (tx) =>
          tx.transfer?.from_hospital_id === userHospitalId ||
          tx.transfer?.to_hospital_id === userHospitalId
      );
  const scopedHospitals = isNetworkAdmin
    ? hospitals
    : hospitals.filter((h) => h.id === userHospitalId);

  // Metrics
  const totalWastePrevented = scopedTransactions.reduce((sum, t) => sum + Number(t.waste_cost_prevented), 0);
  const activeUnitsRebalanced = scopedTransactions.reduce((sum, t) => sum + (t.transfer?.quantity || 0), 0);
  const platformRevenue = scopedTransactions.reduce((sum, t) => sum + Number(t.platform_fee), 0);

  const today = new Date();
  const atRiskSurplus = getAtRiskSurplus(scopedInventory, today);

  const handleTriggerRebalance = async () => {
    setTriggering(true);
    setRebalanceSummary(null);
    try {
      const coldChainMap = await fetchSkuColdChainMap();
      const result = rebalance({
        requests: scopedStockouts,
        surplusBatches: atRiskSurplus,
        hospitals: scopedHospitals,
        skuColdChain: coldChainMap,
      });

      if (result.allocations.length === 0) {
        setRebalanceSummary({
          matchedCount: 0,
          unfulfilledCount: scopedStockouts.length,
          totalCost: 0,
          totalSavings: 0,
          allocations: [],
          unfulfilled: scopedStockouts.map((s) => ({ request_id: s.id, sku_id: s.sku_id, quantity_remaining: s.quantity_needed })),
        });
        toast('No feasible allocations found — all surplus may already be assigned', 'info');
        return;
      }

      // Calculate savings (sum of batch values for allocated quantities)
      let totalSavings = 0;
      for (const a of result.allocations) {
        const batch = scopedInventory.find((b) => b.id === a.batch_id);
        if (batch) totalSavings += a.quantity * batch.unit_cost;
      }

      // Create transfer records
      const transferRecords = result.allocations.map((a) => ({
        from_hospital_id: a.from_hospital_id,
        to_hospital_id: a.to_hospital_id,
        batch_id: a.batch_id,
        sku_id: a.sku_id,
        quantity: a.quantity,
        status: 'in_transit',
        distance_km: a.distance_km,
        transfer_cost: a.cost,
      }));
      await createTransfers(transferRecords);

      setRebalanceSummary({
        matchedCount: result.allocations.length,
        unfulfilledCount: result.unfulfilled.length,
        totalCost: result.total_cost,
        totalSavings,
        allocations: result.allocations,
        unfulfilled: result.unfulfilled,
      });
      toast(`Rebalance complete: ${result.allocations.length} transfer(s) created`, 'success');
      await loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Rebalance failed', 'error');
    } finally {
      setTriggering(false);
    }
  };

  const handleResetDemo = async () => {
    setResetting(true);
    try {
      await resetDemoData();
      setRebalanceSummary(null);
      toast('Demo data reset to original state', 'success');
      await loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Reset failed', 'error');
    } finally {
      setResetting(false);
    }
  };

  const handleCompleteTransfer = async (transferId: string) => {
    try {
      await completeTransfer(transferId);
      toast('Transfer completed and settlement recorded', 'success');
      await loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to complete transfer', 'error');
    }
  };

  const handleCancelTransfer = async (transferId: string) => {
    try {
      await updateTransferStatus(transferId, 'cancelled');
      toast('Transfer cancelled', 'info');
      await loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to cancel transfer', 'error');
    }
  };

  const activeTransfers = scopedTransfers.filter((t) => t.status === 'in_transit' || t.status === 'suggested');

  const skuName = (skuId: string) => skus.find((s) => s.id === skuId)?.name ?? 'Unknown SKU';
  const hospitalName = (hId: string) => scopedHospitals.find((h) => h.id === hId)?.name ?? hospitals.find((h) => h.id === hId)?.name ?? 'Unknown Hospital';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{isNetworkAdmin ? 'Network Admin Dashboard' : 'Hospital Admin Dashboard'}</h2>
          <p className="text-sm text-slate-500 mt-1">{isNetworkAdmin ? 'Global facility overview, rebalancing, and settlement' : 'Overview of your hospital\'s inventory, transfers, and settlements'}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleResetDemo}
            disabled={resetting || loading || !isNetworkAdmin}
            className="flex items-center gap-2 px-4 py-2.5 bg-white text-slate-600 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
            title={isNetworkAdmin ? 'Reset all demo data' : 'Only network admins can reset demo data'}
          >
            <RotateCcw className="w-4 h-4" />
            {resetting ? 'Resetting...' : 'Reset Demo Data'}
          </button>
          <button
            onClick={handleTriggerRebalance}
            disabled={triggering || loading || scopedStockouts.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 transition-colors shadow-sm shadow-teal-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Zap className="w-4 h-4" />
            {triggering ? 'Computing...' : 'Run Rebalance'}
          </button>
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {loading ? (
          <>
            <SkeletonMetric />
            <SkeletonMetric />
            <SkeletonMetric />
          </>
        ) : (
          <>
            <MetricCard icon={<IndianRupee className="w-6 h-6" />} label="Total Waste Prevented" value={`₹${totalWastePrevented.toLocaleString('en-IN')}`} subtitle={`${scopedTransactions.length} completed transfers`} />
            <MetricCard icon={<Boxes className="w-6 h-6" />} label="Active Units Rebalanced" value={activeUnitsRebalanced.toLocaleString('en-IN')} subtitle={`${activeTransfers.length} in transit`} />
            <MetricCard icon={<TrendingUp className="w-6 h-6" />} label="Platform Revenue Earned" value={`₹${platformRevenue.toLocaleString('en-IN')}`} subtitle="3.5% fee per transaction" />
          </>
        )}
      </div>

      {/* Rebalance Summary */}
      {rebalanceSummary && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-teal-600" />
              Rebalance Summary
            </h3>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
              <SummaryStat label="Requests Matched" value={rebalanceSummary.matchedCount.toString()} color="text-emerald-600" />
              <SummaryStat label="Still Unfulfilled" value={rebalanceSummary.unfulfilledCount.toString()} color={rebalanceSummary.unfulfilledCount > 0 ? 'text-red-500' : 'text-slate-400'} />
              <SummaryStat label="Total Transfer Cost" value={`₹${rebalanceSummary.totalCost.toLocaleString('en-IN')}`} color="text-blue-600" />
              <SummaryStat label="Est. Waste Prevented" value={`₹${rebalanceSummary.totalSavings.toLocaleString('en-IN')}`} color="text-teal-600" />
            </div>

            {rebalanceSummary.allocations.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700 mb-2">Transfers Created:</p>
                {rebalanceSummary.allocations.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2">
                    <Truck className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <span className="font-medium text-slate-900">{a.quantity} units</span>
                    <span className="text-slate-500">{skuName(a.sku_id)}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-600">{hospitalName(a.from_hospital_id)}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-600">{hospitalName(a.to_hospital_id)}</span>
                    <span className="ml-auto text-slate-500">{a.distance_km} km · ₹{a.cost.toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
            )}

            {rebalanceSummary.unfulfilled.length > 0 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-medium text-red-700 mb-1">Unfulfilled Requests:</p>
                {rebalanceSummary.unfulfilled.map((u, i) => (
                  <p key={i} className="text-sm text-red-600">
                    {skuName(u.sku_id)} — {u.quantity_remaining} units still needed
                  </p>
                ))}
              </div>
            )}

            <button
              onClick={() => setRebalanceSummary(null)}
              className="mt-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              <X className="w-4 h-4" />
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Map */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-900">Network Map — Live Transfers</h3>
          <p className="text-sm text-slate-500 mt-0.5">Hospital pins with directional lines for active transfers</p>
        </div>
        {loading ? (
          <div className="h-[420px] bg-slate-100 animate-pulse rounded-b-2xl" />
        ) : (
          <TransferMap hospitals={scopedHospitals} transfers={activeTransfers} stockouts={scopedStockouts} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Open Stockouts */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-base font-semibold text-slate-900">Open Stockout Requests</h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="p-5 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="space-y-2">
                      <div className="h-4 bg-slate-100 rounded animate-pulse w-32" />
                      <div className="h-3 bg-slate-100 rounded animate-pulse w-48" />
                    </div>
                    <div className="h-6 bg-slate-100 rounded animate-pulse w-16" />
                  </div>
                ))}
              </div>
            ) : scopedStockouts.length === 0 ? (
              <EmptyState icon={<Inbox className="w-8 h-8" />} title="No open stockout requests" message="All hospitals are well-stocked right now." />
            ) : (
              scopedStockouts.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                  <div>
                    <div className="font-medium text-slate-900 text-sm">{s.sku?.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{s.hospital?.name} · Need: {s.quantity_needed} units</div>
                  </div>
                  <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${s.urgency === 'emergency' ? 'bg-red-100 text-red-700' : s.urgency === 'urgent' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                    {s.urgency}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* At-Risk Surplus */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-base font-semibold text-slate-900">At-Risk Surplus Batches</h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="p-5 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="space-y-2">
                      <div className="h-4 bg-slate-100 rounded animate-pulse w-32" />
                      <div className="h-3 bg-slate-100 rounded animate-pulse w-48" />
                    </div>
                    <div className="h-6 bg-slate-100 rounded animate-pulse w-12" />
                  </div>
                ))}
              </div>
            ) : atRiskSurplus.length === 0 ? (
              <EmptyState icon={<Package className="w-8 h-8" />} title="No at-risk surplus detected" message="All inventory is expected to be consumed before expiry." />
            ) : (
              atRiskSurplus.map((s) => {
                const batch = scopedInventory.find((b) => b.id === s.batch_id);
                return (
                  <div key={s.batch_id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                    <div>
                      <div className="font-medium text-slate-900 text-sm">{batch?.sku?.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{batch?.hospital?.name} · {s.batch_number} · {s.days_to_expiry}d to expiry</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-amber-600">+{s.surplus}</div>
                      <div className="text-xs text-slate-400">surplus</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Active Transfers */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-900">Active Transfers</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-500">
                <th className="px-5 py-3 font-medium">SKU</th>
                <th className="px-5 py-3 font-medium">From → To</th>
                <th className="px-5 py-3 font-medium text-right">Qty</th>
                <th className="px-5 py-3 font-medium text-right">Distance</th>
                <th className="px-5 py-3 font-medium text-right">Cost</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-28" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-40" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-8 ml-auto" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-12 ml-auto" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-16 ml-auto" /></td>
                    <td className="px-5 py-4"><div className="h-5 bg-slate-100 rounded animate-pulse w-20" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-12 ml-auto" /></td>
                  </tr>
                ))
              ) : activeTransfers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8">
                    <EmptyState icon={<Truck className="w-8 h-8" />} title="No active transfers" message="Run rebalancing to create transfers from surplus to stockout hospitals." />
                  </td>
                </tr>
              ) : (
                activeTransfers.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-slate-900">{t.sku?.name}</div>
                      {t.sku?.cold_chain_required && (
                        <div className="flex items-center gap-1 text-xs text-blue-500 mt-0.5">
                          <Snowflake className="w-3 h-3" /> Cold Chain
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{t.from_hospital?.name}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-medium">{t.to_hospital?.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right font-medium text-slate-900">{t.quantity}</td>
                    <td className="px-5 py-3.5 text-right text-slate-600">{t.distance_km} km</td>
                    <td className="px-5 py-3.5 text-right text-slate-600">₹{t.transfer_cost.toLocaleString('en-IN')}</td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium">
                        <Truck className="w-3 h-3" />
                        In Transit
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => handleCompleteTransfer(t.id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Complete">
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleCancelTransfer(t.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Cancel">
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Ledger */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-900">Transaction Ledger</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-500">
                <th className="px-5 py-3 font-medium">SKU</th>
                <th className="px-5 py-3 font-medium">From → To</th>
                <th className="px-5 py-3 font-medium text-right">Qty</th>
                <th className="px-5 py-3 font-medium text-right">Batch Value</th>
                <th className="px-5 py-3 font-medium text-right">Platform Fee</th>
                <th className="px-5 py-3 font-medium text-right">Waste Prevented</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-28" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-40" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-8 ml-auto" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-16 ml-auto" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-16 ml-auto" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-16 ml-auto" /></td>
                  </tr>
                ))
              ) : scopedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8">
                    <EmptyState icon={<IndianRupee className="w-8 h-8" />} title="No transactions yet" message="Complete a transfer to record a settlement in the ledger." />
                  </td>
                </tr>
              ) : (
                scopedTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-slate-900">{tx.transfer?.sku?.name}</td>
                    <td className="px-5 py-3.5 text-slate-600">{tx.transfer?.from_hospital?.name} → {tx.transfer?.to_hospital?.name}</td>
                    <td className="px-5 py-3.5 text-right text-slate-600">{tx.transfer?.quantity}</td>
                    <td className="px-5 py-3.5 text-right font-medium text-slate-900">₹{Number(tx.total_batch_value).toLocaleString('en-IN')}</td>
                    <td className="px-5 py-3.5 text-right text-amber-600 font-medium">₹{Number(tx.platform_fee).toLocaleString('en-IN')}</td>
                    <td className="px-5 py-3.5 text-right text-emerald-600 font-medium">₹{Number(tx.waste_cost_prevented).toLocaleString('en-IN')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, subtitle }: { icon: React.ReactNode; label: string; value: string; subtitle: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-transform duration-200 hover:-translate-y-0.5">
      <div className="absolute right-4 top-4 h-16 w-16 rounded-full bg-[#f0f8f7]" />
      <div className="relative">
        <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#e7f4f1] text-[#0f766e]">{icon}</div>
        <div className="font-display text-2xl font-bold tracking-tight text-[#1e3142]">{value}</div>
        <div className="mt-0.5 text-sm font-medium text-slate-600">{label}</div>
        <div className="mt-1 text-xs text-slate-400">{subtitle}</div>
      </div>
    </div>
  );
}

function SkeletonMetric() {
  return (
    <div className="rounded-2xl bg-slate-100 p-5 shadow-sm h-[140px] animate-pulse" />
  );
}

function SummaryStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
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
