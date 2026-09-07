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
import { Activity, Mail, Lock, ArrowRight, Shield, Pill } from 'lucide-react';
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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 shadow-lg shadow-teal-500/20 mb-3">
            <Activity className="w-7 h-7 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">MedRebalance</h1>
          <p className="text-sm text-slate-500 mt-1">Medical Supply Network</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Sign In</h2>
          <p className="text-sm text-slate-500 mb-5">Access your hospital dashboard</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
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
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input pl-10"
                />
              </div>
            </div>
            <button
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
              <button onClick={onGoRegister} className="text-teal-600 font-medium hover:text-teal-700 transition-colors">
                Register your hospital
              </button>
            </p>
          </div>
        </div>

        {/* Demo credentials hint */}
        <div className="mt-4 bg-teal-50 border border-teal-200 rounded-xl p-4">
          <p className="text-xs text-teal-800 font-medium mb-1">Demo Account</p>
          <p className="text-xs text-teal-700">
            Email: <span className="font-mono">admin@medrebalance.demo</span>
            <br />
            Password: <span className="font-mono">demo1234</span>
          </p>
          <div className="flex items-center gap-3 mt-2 text-xs text-teal-600">
            <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Network Admin</span>
            <span className="flex items-center gap-1"><Pill className="w-3 h-3" /> Pharmacist</span>
          </div>
        </div>
      </div>
    </div>
  );
}
