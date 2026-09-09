import { useState } from 'react';
import { Activity, ArrowLeft, MapPin, Building2, Mail, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';

interface Props { onBack: () => void; }
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  Mumbai: { lat: 19.076, lng: 72.8777 }, Delhi: { lat: 28.6139, lng: 77.209 },
  Bangalore: { lat: 12.9716, lng: 77.5946 }, Chennai: { lat: 13.0827, lng: 80.2707 },
  Hyderabad: { lat: 17.385, lng: 78.4867 }, Pune: { lat: 18.5204, lng: 73.8567 },
  Kolkata: { lat: 22.5726, lng: 88.3639 }, Ahmedabad: { lat: 23.0225, lng: 72.5714 },
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
  const [formError, setFormError] = useState('');

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setFormError('');
    if (!hospitalName.trim() || !address.trim() || !email.trim() || password.length < 6) {
      setFormError('Please complete all fields. Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const coords = CITY_COORDS[city];
      const response = await fetch('/api/register-hospital', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalName, address, city, hospitalType, email, password, lat: coords.lat, lng: coords.lng }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Registration failed.');

      // The server creates the Auth user as already confirmed. Sign in normally
      // so the browser receives a standard Supabase session for RLS-protected UI.
      const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (loginError) throw new Error(`Hospital created, but automatic sign-in failed: ${loginError.message}`);
      toast('Hospital registered successfully', 'success');
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed.';
      setFormError(message);
      toast(message, 'error');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-[100dvh] bg-[#f4f9f8] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        <div className="flex flex-col items-center mb-6">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0f766e] shadow-lg mb-3"><Activity className="w-7 h-7 text-white" /></div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Register your hospital</h1>
          <p className="text-sm text-slate-500 mt-1">Set up your team’s secure network workspace</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Hospital Name</label><div className="relative"><Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><input required value={hospitalName} onChange={e=>setHospitalName(e.target.value)} placeholder="e.g. Lifeline General Hospital" className="input pl-10"/></div></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Address</label><input required value={address} onChange={e=>setAddress(e.target.value)} placeholder="Street address, area" className="input"/></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1.5">City</label><div className="relative"><MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><select value={city} onChange={e=>setCity(e.target.value)} className="input pl-10">{Object.keys(CITY_COORDS).map(c=><option key={c}>{c}</option>)}</select></div><p className="text-xs text-slate-400 mt-1">Lat: {CITY_COORDS[city].lat}, Lng: {CITY_COORDS[city].lng}</p></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Hospital Type</label><select value={hospitalType} onChange={e=>setHospitalType(e.target.value)} className="input"><option>General Hospital</option><option>Childrens Hospital</option><option>Heart Institute</option><option>Multispecialty</option><option>Cancer Center</option></select></div>
            </div>
            <div className="pt-2 border-t border-slate-100"><p className="text-sm font-medium text-slate-700 mb-3">Admin Account</p></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Admin Email</label><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@hospital.com" className="input pl-10"/></div></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><input required type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters" className="input pl-10"/></div></div>
            {formError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg break-words">{formError}</p>}
            <div className="flex gap-3 pt-2"><button type="button" onClick={onBack} className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-600 rounded-xl"><ArrowLeft className="w-4 h-4"/>Back to Login</button><button type="submit" disabled={loading} className="flex-1 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-xl disabled:opacity-50">{loading ? 'Registering...' : 'Register Hospital'}</button></div>
          </form>
        </div>
      </div>
    </div>
  );
}
