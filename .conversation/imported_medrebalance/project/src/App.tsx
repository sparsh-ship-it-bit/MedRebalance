import { useState } from 'react';
import { Activity, Shield, Pill, LogOut } from 'lucide-react';
import { ToastProvider } from '@/components/Toast';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import OnboardingBanner from '@/components/OnboardingBanner';
import PharmacistDashboard from '@/components/PharmacistDashboard';
import AdminDashboard from '@/components/AdminDashboard';
import LoginScreen from '@/components/LoginScreen';
import RegisterHospital from '@/components/RegisterHospital';

type AuthView = 'login' | 'register';

function AppContent() {
  const { session, user, loading, signOut } = useAuth();
  const [authView, setAuthView] = useState<AuthView>('login');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 shadow-lg shadow-teal-500/20">
            <Activity className="w-7 h-7 text-white animate-pulse" strokeWidth={2.5} />
          </div>
          <p className="text-sm text-slate-400">Loading MedRebalance...</p>
        </div>
      </div>
    );
  }

  // No session → show auth screens
  if (!session) {
    if (authView === 'register') {
      return <RegisterHospital onBack={() => setAuthView('login')} />;
    }
    return <LoginScreen onGoRegister={() => setAuthView('register')} />;
  }

  // Has session — determine which dashboard to show
  const showAdmin = user?.role === 'network_admin' || user?.role === 'admin';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 shadow-lg shadow-teal-500/20">
                <Activity className="w-5 h-5 text-white" strokeWidth={2.5} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">MedRebalance</h1>
                <p className="text-xs text-slate-500 -mt-0.5">
                  {user?.email} · {user?.role === 'network_admin' ? 'Network Admin' : user?.role === 'admin' ? 'Hospital Admin' : 'Pharmacist'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Role badge */}
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg text-sm">
                {showAdmin ? (
                  <>
                    <Shield className="w-4 h-4 text-teal-600" />
                    <span className="font-medium text-slate-700">Admin</span>
                  </>
                ) : (
                  <>
                    <Pill className="w-4 h-4 text-teal-600" />
                    <span className="font-medium text-slate-700">Pharmacist</span>
                  </>
                )}
              </div>

              {/* Logout */}
              <button
                onClick={() => signOut()}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <OnboardingBanner />
        {showAdmin ? <AdminDashboard /> : <PharmacistDashboard />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ToastProvider>
  );
}
