/*
 * AuthContext.tsx — Central authentication and authorization state for MedRebalance.
 *
 * Role in the architecture:
 *   This file wraps the entire app in a React Context that tracks the Supabase
 *   auth session and the current user's hospital + role from hospital_users.
 *   It exposes:
 *     - `session`     : the raw Supabase session (or null if logged out)
 *     - `user`        : { hospitalId, role, email } derived from hospital_users
 *     - `loading`     : true while the initial session check is in-flight
 *     - `signOut()`   : logs the user out
 *
 *   Every component that needs to know "who am I and which hospital am I from"
 *   calls `useAuth()` instead of re-querying Supabase. Route protection in
 *   App.tsx checks `session` to decide between the auth screens and the
 *   dashboards. PharmacistDashboard uses `user.hospitalId` to scope queries;
 *   AdminDashboard uses `user.role` to decide between network-wide and
 *   hospital-scoped views.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

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

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async (uid: string, email: string) => {
    const { data, error } = await supabase
      .from('hospital_users')
      .select('hospital_id, role')
      .eq('user_id', uid)
      .maybeSingle();

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
      // User exists in auth but has no hospital_users row yet (shouldn't happen
      // in normal flow, but handle gracefully)
      setUser({ hospitalId: null, role: 'pharmacist', email });
    }
  }, []);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        fetchUser(s.user.id, s.user.email ?? '').finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes — wrap async work to avoid deadlock
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        (async () => {
          await fetchUser(s.user.id, s.user.email ?? '');
        })();
      } else {
        setUser(null);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [fetchUser]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
