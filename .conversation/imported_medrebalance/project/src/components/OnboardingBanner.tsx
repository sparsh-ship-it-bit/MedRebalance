import { useState } from 'react';
import { Info, X, Zap, AlertTriangle, Activity } from 'lucide-react';

export default function OnboardingBanner() {
  const [visible, setVisible] = useState(() => {
    return localStorage.getItem('medrebalance_onboarded') !== 'true';
  });

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem('medrebalance_onboarded', 'true');
    setVisible(false);
  };

  return (
    <div className="bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 rounded-2xl p-5 mb-6">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-teal-500 text-white shadow-sm">
            <Info className="w-5 h-5" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-slate-900 mb-2">Welcome to MedRebalance</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="flex items-start gap-2">
              <Activity className="w-4 h-4 text-teal-600 mt-0.5 flex-shrink-0" />
              <p className="text-slate-600">
                <span className="font-medium text-slate-800">What it does:</span> Detects medical supplies at risk of expiring and redirects them to hospitals facing shortages.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-slate-600">
                <span className="font-medium text-slate-800">At-Risk Surplus:</span> A batch has more stock than it can consume before its expiry date — flagged for transfer.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Zap className="w-4 h-4 text-teal-600 mt-0.5 flex-shrink-0" />
              <p className="text-slate-600">
                <span className="font-medium text-slate-800">Run Rebalance:</span> Matches surplus batches to open stockout requests using a min-cost algorithm.
              </p>
            </div>
          </div>
        </div>
        <button onClick={dismiss} className="flex-shrink-0 p-1.5 hover:bg-teal-100 rounded-lg transition-colors">
          <X className="w-5 h-5 text-slate-500" />
        </button>
      </div>
    </div>
  );
}
