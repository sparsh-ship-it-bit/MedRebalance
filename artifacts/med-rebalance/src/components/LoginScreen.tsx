/*
 * LoginScreen.tsx — Email/password login + link to hospital registration.
 *
 * Role in the architecture:
 *   Shown when there is no active Supabase session. Calls
 *   supabase.auth.signInWithPassword() and on success the AuthContext
 *   onAuthStateChange listener picks up the new session automatically,
 *   which causes App.tsx to swap to the dashboard. Includes a link to
 *   the RegisterHospital screen so a new hospital can sign up.
 */

import { useState } from 'react';
import { Activity, ArrowRight, CheckCircle2, Lock, Mail, Shield } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';

interface Props {
  onGoRegister: () => void;
}

export default function LoginScreen({ onGoRegister }: Props) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast(error.message, 'error');
    } else {
      toast('Login successful', 'success');
    }
    setLoading(false);
  };

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
          <div className="mb-7">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#0f766e]">Secure workspace</div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">Welcome back</h2>
            <p className="mt-1.5 text-sm text-slate-500">Sign in to access your hospital operations dashboard.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input data-testid="input-login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@hospital.com"
                  className="input pl-10"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input data-testid="input-login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input pl-10"
                />
              </div>
            </div>
            <button data-testid="button-login"
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 shadow-sm shadow-teal-600/20"
            >
              {loading ? 'Signing in...' : 'Sign In'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-slate-100">
            <p className="text-sm text-slate-500 text-center">
              New hospital?{' '}
              <button data-testid="button-go-register" onClick={onGoRegister} className="font-semibold text-[#0f766e] transition-colors hover:text-[#095e58]">
                Register your hospital
              </button>
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#c5e6df] bg-[#f1faf8] p-4">
          <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#0f766e]" />
          <div><p className="text-xs font-semibold text-[#25645f]">Demo access</p><p className="mt-1 text-xs leading-5 text-[#52726e]"><span className="font-mono">admin@medrebalance.demo</span> · <span className="font-mono">demo1234</span></p></div>
        </div>
        </div>
      </div>
    </div>
  );
}
