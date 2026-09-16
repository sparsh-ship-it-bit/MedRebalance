/*
 * LoginScreen.tsx — Three-gate workspace login.
 *
 * The user first chooses a workspace gate and proves knowledge of that gate's
 * password. The gate password is verified by the backend, never in browser code.
 * The normal Supabase email/password login then authenticates the account, and
 * AuthContext selects the requested workspace only when the account has that role.
 */

import { useState } from 'react';
import { Activity, ArrowRight, CheckCircle2, Lock, Mail, Shield, Building2, Network, Pill, ChevronLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import type { UserRole } from '@/lib/AuthContext';

interface Props {
  onGoRegister: () => void;
}

const GATES: Array<{ role: UserRole; title: string; description: string; icon: typeof Pill }> = [
  {
    role: 'pharmacist',
    title: 'Pharmacist',
    description: 'Pharmacy operations & inventory',
    icon: Pill,
  },
  {
    role: 'admin',
    title: 'Hospital Administrator',
    description: 'Hospital-wide administration',
    icon: Building2,
  },
  {
    role: 'network_admin',
    title: 'Network Administrator',
    description: 'Network transfers & rebalancing',
    icon: Network,
  },
];

const GATE_ROLE_KEY = 'medrebalance.authorizedGateRole';

export default function LoginScreen({ onGoRegister }: Props) {
  const { toast } = useToast();
  const [gate, setGate] = useState<UserRole | null>(null);
  const [gatePassword, setGatePassword] = useState('');
  const [gateLoading, setGateLoading] = useState(false);
  const [gateVerified, setGateVerified] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const verifyGate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gate) return;

    setGateLoading(true);
    try {
      const response = await fetch('/api/role-gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: gate, password: gatePassword }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast(result.error || 'Gate verification failed.', 'error');
        return;
      }

      sessionStorage.setItem(GATE_ROLE_KEY, gate);
      setGateVerified(true);
      toast(`${GATES.find((item) => item.role === gate)?.title} gate unlocked`, 'success');
    } catch {
      toast('Could not reach the security gate. Please try again.', 'error');
    } finally {
      setGateLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gateVerified || !gate) return;

    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      toast(error?.message || 'Sign in failed.', 'error');
      setLoading(false);
      return;
    }

    // The gate password alone never grants a role. The authenticated account
    // must also have a matching hospital_users membership.
    const { data: membership, error: membershipError } = await supabase
      .from('hospital_users')
      .select('hospital_id')
      .eq('user_id', data.user.id)
      .eq('role', gate)
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership) {
      await supabase.auth.signOut();
      sessionStorage.removeItem(GATE_ROLE_KEY);
      toast('This account is not authorized for that workspace.', 'error');
      setLoading(false);
      return;
    }

    toast('Login successful', 'success');
    setLoading(false);
  };

  const selectedGate = GATES.find((item) => item.role === gate);

  return (
    <div className="min-h-[100dvh] bg-[#f4f9f8] px-4 py-8 sm:py-12">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_22px_70px_rgba(28,62,79,.12)] md:grid-cols-[1.05fr_.95fr]">
        <div className="relative hidden overflow-hidden bg-[#0f766e] p-10 text-white md:flex md:flex-col md:justify-between">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full border-[28px] border-white/10" />
          <div className="absolute -bottom-24 -left-20 h-64 w-64 rounded-full border-[22px] border-white/10" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15"><Activity className="h-6 w-6" /></div>
              <div><div className="font-display text-xl font-bold">MedRebalance</div><div className="text-[10px] uppercase tracking-[.18em] text-teal-100">Clinical supply network</div></div>
            </div>
            <div className="mt-24 max-w-sm">
              <div className="mb-4 text-xs font-semibold uppercase tracking-[.2em] text-teal-100">Move with confidence</div>
              <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight">The right medicine, before it expires.</h1>
              <p className="mt-5 text-[15px] leading-7 text-teal-50">A shared operational view for pharmacy teams coordinating surplus, shortage, and safe transfer across the hospital network.</p>
            </div>
          </div>
          <div className="relative flex items-center gap-2 text-xs text-teal-100"><CheckCircle2 className="h-4 w-4" /> Every action is logged for clinical accountability</div>
        </div>

        <div className="p-6 sm:p-10">
          <div className="mb-8 flex items-center gap-3 md:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0f766e]"><Activity className="h-5 w-5 text-white" /></div>
            <div><div className="font-display text-lg font-bold text-[#1e3142]">MedRebalance</div><div className="text-[10px] uppercase tracking-[.16em] text-slate-400">Clinical supply network</div></div>
          </div>

          {!gateVerified ? (
            <>
              <div className="mb-7">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#0f766e]">Security checkpoint</div>
                <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">Choose your gate</h2>
                <p className="mt-1.5 text-sm text-slate-500">Each workspace has its own access password.</p>
              </div>

              {!gate ? (
                <div className="space-y-3">
                  {GATES.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.role}
                        type="button"
                        onClick={() => setGate(item.role)}
                        className="group flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-teal-300 hover:bg-teal-50/40 hover:shadow-sm"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 group-hover:bg-teal-100 group-hover:text-teal-700">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-900">{item.title}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">{item.description}</span>
                        </span>
                        <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-teal-600" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <form onSubmit={verifyGate} className="space-y-4">
                  <button type="button" onClick={() => { setGate(null); setGatePassword(''); }} className="mb-2 flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-teal-700">
                    <ChevronLeft className="h-4 w-4" /> Back to gates
                  </button>
                  <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4">
                    <div className="flex items-center gap-3">
                      {selectedGate && <selectedGate.icon className="h-5 w-5 text-teal-700" />}
                      <div><p className="text-sm font-semibold text-teal-900">{selectedGate?.title}</p><p className="text-xs text-teal-700">Enter this gate's password to continue.</p></div>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Gate password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input autoFocus type="password" required value={gatePassword} onChange={(e) => setGatePassword(e.target.value)} placeholder="Enter gate password" className="input pl-10" />
                    </div>
                  </div>
                  <button type="submit" disabled={gateLoading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-teal-600/20 transition hover:bg-teal-700 disabled:opacity-50">
                    {gateLoading ? 'Checking gate...' : 'Unlock gate'}
                    {!gateLoading && <ArrowRight className="h-4 w-4" />}
                  </button>
                </form>
              )}
            </>
          ) : (
            <>
              <div className="mb-7">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#0f766e]">Gate unlocked</div>
                <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">Sign in to enter</h2>
                <p className="mt-1.5 text-sm text-slate-500">{selectedGate?.title} workspace selected.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
                  <div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input data-testid="input-login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@hospital.com" className="input pl-10" /></div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Account password</label>
                  <div className="relative"><Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input data-testid="input-login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="input pl-10" /></div>
                </div>
                <button data-testid="button-login" type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-teal-600/20 transition hover:bg-teal-700 disabled:opacity-50">
                  {loading ? 'Signing in...' : 'Enter workspace'}
                  {!loading && <ArrowRight className="h-4 w-4" />}
                </button>
              </form>

              <button type="button" onClick={() => { sessionStorage.removeItem(GATE_ROLE_KEY); setGateVerified(false); setGatePassword(''); }} className="mt-4 flex w-full items-center justify-center gap-1 text-xs font-semibold text-slate-500 hover:text-teal-700">
                <ChevronLeft className="h-4 w-4" /> Choose a different gate
              </button>
            </>
          )}

          <div className="mt-5 border-t border-slate-100 pt-5">
            <p className="text-center text-sm text-slate-500">
              New hospital?{' '}
              <button data-testid="button-go-register" onClick={onGoRegister} className="font-semibold text-[#0f766e] transition-colors hover:text-[#095e58]">Register your hospital</button>
            </p>
          </div>
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#c5e6df] bg-[#f1faf8] p-4">
            <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#0f766e]" />
            <div><p className="text-xs font-semibold text-[#25645f]">Two-step workspace access</p><p className="mt-1 text-xs leading-5 text-[#52726e]">Gate password + your MedRebalance account password are required.</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}
