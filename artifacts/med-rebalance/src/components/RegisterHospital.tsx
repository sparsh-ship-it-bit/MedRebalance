/*
 * RegisterHospital.tsx — Hospital self-registration screen.
 *
 * Role in the architecture:
 *   Lets a new hospital join the MedRebalance network. The flow is:
 *     1. Collect hospital details (name, address, city → lat/lng, type) and
 *        admin credentials (email, password).
 *     2. Call supabase.auth.signUp() to create the auth user.
 *     3. Insert a row into `hospitals`.
 *     4. Insert a row into `hospital_users` linking the new user to the new
 *        hospital with role 'admin'.
 *   On success, the AuthContext listener picks up the session and App.tsx
 *   routes to the dashboard. The city dropdown maps to preset coordinates
 *   so non-technical users don't need to know lat/lng.
 */

import { useState } from 'react';
import { Activity, ArrowLeft, MapPin, Building2, Mail, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';

interface Props {
  onBack: () => void;
}

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  'Mumbai': { lat: 19.076, lng: 72.8777 },
  'Delhi': { lat: 28.6139, lng: 77.209 },
  'Bangalore': { lat: 12.9716, lng: 77.5946 },
  'Chennai': { lat: 13.0827, lng: 80.2707 },
  'Hyderabad': { lat: 17.385, lng: 78.4867 },
  'Pune': { lat: 18.5204, lng: 73.8567 },
  'Kolkata': { lat: 22.5726, lng: 88.3639 },
  'Ahmedabad': { lat: 23.0225, lng: 72.5714 },
};

export default function RegisterHospital({ onBack }: Props) {
  const { toast } = useToast();
  const [hospitalName, setHospitalName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Mumbai');
  const [hospitalType, setHospitalType] = useState('General Hospital');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!hospitalName.trim()) e.hospitalName = 'Hospital name is required';
    if (!address.trim()) e.address = 'Address is required';
    if (!email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Invalid email format';
    if (password.length < 6) e.password = 'Password must be at least 6 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setErrors({});

    try {
      // Step 1: Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });
      if (authError) throw authError;
      if (!authData.user) throw new Error('Failed to create user account');

      const userId = authData.user.id;
      const coords = CITY_COORDS[city];

      // Step 2: Insert hospital
      const { data: hospitalData, error: hospitalError } = await supabase
        .from('hospitals')
        .insert({
          name: hospitalName.trim(),
          address: `${address.trim()}, ${city}`,
          lat: coords.lat,
          lng: coords.lng,
          type: hospitalType,
        })
        .select()
        .single();

      if (hospitalError) throw hospitalError;

      // Step 3: Link user to hospital with admin role
      const { error: linkError } = await supabase.from('hospital_users').insert({
        user_id: userId,
        hospital_id: hospitalData.id,
        role: 'admin',
      });

      if (linkError) throw linkError;

      toast('Hospital registered successfully', 'success');
      // AuthContext will pick up the session automatically
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      setErrors({ form: msg });
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#f4f9f8] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0f766e] shadow-lg shadow-teal-900/15 mb-3">
            <Activity className="w-7 h-7 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">Register your hospital</h1>
          <p className="text-sm text-slate-500 mt-1">Set up your team’s secure network workspace</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Hospital details */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Hospital Name</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input data-testid="input-register-hospital-name"
                  value={hospitalName}
                  onChange={(e) => setHospitalName(e.target.value)}
                  placeholder="e.g. Lifeline General Hospital"
                  className={`input pl-10 ${errors.hospitalName ? 'border-red-300' : ''}`}
                />
              </div>
              {errors.hospitalName && <p className="text-xs text-red-500 mt-1">{errors.hospitalName}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Address</label>
              <input data-testid="input-register-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street address, area"
                className={`input ${errors.address ? 'border-red-300' : ''}`}
              />
              {errors.address && <p className="text-xs text-red-500 mt-1">{errors.address}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">City</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <select data-testid="input-register-city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="input pl-10"
                  >
                    {Object.keys(CITY_COORDS).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Lat: {CITY_COORDS[city].lat}, Lng: {CITY_COORDS[city].lng}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Hospital Type</label>
                <select data-testid="input-register-hospital-type"
                  value={hospitalType}
                  onChange={(e) => setHospitalType(e.target.value)}
                  className="input"
                >
                  <option value="General Hospital">General Hospital</option>
                  <option value="Childrens Hospital">Childrens Hospital</option>
                  <option value="Heart Institute">Heart Institute</option>
                  <option value="Multispecialty">Multispecialty</option>
                  <option value="Cancer Center">Cancer Center</option>
                </select>
              </div>
            </div>

            {/* Divider */}
            <div className="pt-2 border-t border-slate-100">
              <p className="text-sm font-medium text-slate-700 mb-3">Admin Account</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Admin Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input data-testid="input-register-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@hospital.com"
                  className={`input pl-10 ${errors.email ? 'border-red-300' : ''}`}
                />
              </div>
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input data-testid="input-register-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className={`input pl-10 ${errors.password ? 'border-red-300' : ''}`}
                />
              </div>
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
            </div>

            {errors.form && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{errors.form}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button data-testid="button-register-back"
                type="button"
                onClick={onBack}
                className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </button>
              <button data-testid="button-register-submit"
                type="submit"
                disabled={loading}
                className="flex-1 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50 shadow-sm shadow-teal-600/20"
              >
                {loading ? 'Registering...' : 'Register Hospital'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
