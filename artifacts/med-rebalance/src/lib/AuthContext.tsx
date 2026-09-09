/*
 * AuthContext.tsx — Central authentication and authorization state for MedRebalance.
 *
 * Tracks the Supabase session and the current user's hospital + role. It also
 * completes a pending hospital registration after an email-confirmed user
 * signs in, so registration works whether Supabase email confirmation is on
 * or off.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { retry } from '@/lib/retry';
import { PENDING_REGISTRATION_KEY } from '@/components/RegisterHospital';

export type UserRole = 'pharmacist' | 'admin' | 'network_admin';

export interface AppUser {
  hospitalId: string | null;
  role: UserRole;
  email: string;
}

interface AuthContextValue {
  session: Session | null;
  user: AppUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

interface PendingRegistration {
  email: string;
  hospitalName: string;
  address: string;
  city: string;
  hospitalType: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

async function completePendingRegistration(uid: string, email: string): Promise<boolean> {
  const raw = localStorage.getItem(PENDING_REGISTRATION_KEY);
  if (!raw) return false;

  let pending: PendingRegistration;
  try {
    pending = JSON.parse(raw) as PendingRegistration;
  } catch {
    localStorage.removeItem(PENDING_REGISTRATION_KEY);
    return false;
  }

  if (!pending || pending.email !== email || !pending.hospitalName || !pending.address || !pending.city || !pending.hospitalType) {
    return false;
  }

  const coords: Record<string, { lat: number; lng: number }> = {
    Mumbai: { lat: 19.076, lng: 72.8777 },
    Delhi: { lat: 28.6139, lng: 77.209 },
    Bangalore: { lat: 12.9716, lng: 77.5946 },
    Chennai: { lat: 13.0827, lng: 80.2707 },
    Hyderabad: { lat: 17.385, lng: 78.4867 },
    Pune: { lat: 18.5204, lng: 73.8567 },
    Kolkata: { lat: 22.5726, lng: 88.3639 },
    Ahmedabad: { lat: 23.0225, lng: 72.5714 },
  };
  const location = coords[pending.city] ?? coords.Mumbai;

  // If the user already has a membership, registration was completed earlier.
  const { data: existing, error: existingError } = await retry(() => supabase
    .from('hospital_users')
    .select('hospital_id, role')
    .eq('user_id', uid)
    .maybeSingle());
  if (existingError) throw existingError;
  if (existing) {
    localStorage.removeItem(PENDING_REGISTRATION_KEY);
    return true;
  }

  const { data: hospital, error: hospitalError } = await retry(() => supabase
    .from('hospitals')
    .insert({
      name: pending.hospitalName,
      address: `${pending.address}, ${pending.city}`,
      lat: location.lat,
      lng: location.lng,
      type: pending.hospitalType,
    })
    .select('id')
    .single());
  if (hospitalError) throw hospitalError;

  const { error: linkError } = await retry(() => supabase.from('hospital_users').insert({
    user_id: uid,
    hospital_id: hospital.id,
    role: 'admin',
  }));

  if (linkError) {
    // Do not silently discard the pending registration. The next authenticated
    // session can retry the membership link; this is safer than losing setup.
    throw linkError;
  }

  localStorage.removeItem(PENDING_REGISTRATION_KEY);
  return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async (uid: string, email: string) => {
    try {
      await completePendingRegistration(uid, email);
    } catch (error) {
      console.error('Failed to complete pending hospital registration:', error);
    }

    const { data, error } = await retry(() => supabase
      .from('hospital_users')
      .select('hospital_id, role')
      .eq('user_id', uid)
      .maybeSingle());

    if (error) {
      console.error('Failed to fetch hospital_users:', error);
      setUser(null);
      return;
    }

    if (data) {
      setUser({
        hospitalId: data.hospital_id as string,
        role: data.role as UserRole,
        email,
      });
    } else {
      setUser({ hospitalId: null, role: 'pharmacist', email });
    }
  }, []);

  useEffect(() => {
    retry(() => supabase.auth.getSession()).then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        fetchUser(s.user.id, s.user.email ?? '').finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }).catch((error) => {
      console.error('Failed to restore Supabase session:', error);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        void fetchUser(s.user.id, s.user.email ?? '');
      } else {
        setUser(null);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [fetchUser]);

  const signOut = useCallback(async () => {
    await retry(() => supabase.auth.signOut());
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
