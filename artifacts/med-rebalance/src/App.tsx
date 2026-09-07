import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  BookOpenCheck,
  Building2,
  ChevronRight,
  CircleHelp,
  FileClock,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Shield,
  X,
} from 'lucide-react';
import { ToastProvider, useToast } from '@/components/Toast';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import OnboardingBanner from '@/components/OnboardingBanner';
import PharmacistDashboard from '@/components/PharmacistDashboard';
import AdminDashboard from '@/components/AdminDashboard';
import LoginScreen from '@/components/LoginScreen';
import RegisterHospital from '@/components/RegisterHospital';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationEvent,
} from '@/lib/notifications';
import { fetchAuditLogs, type AuditLogEntry } from '@/lib/audit';
import {
  fetchAllBillingStatuses,
  fetchBillingStatus,
  isStripeConfigured,
  startSubscription,
  type HospitalBilling,
} from '@/lib/billing';

type AuthView = 'login' | 'register';
type WorkspaceView = 'overview' | 'notifications' | 'audit' | 'billing';

function AppContent() {
  const { session, user, loading, signOut } = useAuth();
  const [authView, setAuthView] = useState<AuthView>('login');

  if (loading) return <LoadingScreen />;
  if (!session) {
    return authView === 'register'
      ? <RegisterHospital onBack={() => setAuthView('login')} />
      : <LoginScreen onGoRegister={() => setAuthView('register')} />;
  }

  return <Workspace user={user} signOut={signOut} />;
}

function Workspace({ user, signOut }: { user: any; signOut: () => Promise<void> }) {
  const { toast } = useToast();
  const isNetworkAdmin = user?.role === 'network_admin';
  const [view, setView] = useState<WorkspaceView>('overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [unread, setUnread] = useState(0);

  const loadNotifications = useCallback(async () => {
    if (!user?.hospitalId) return;
    try {
      const events = await fetchNotifications(user.hospitalId, isNetworkAdmin);
      setNotifications(events);
      setUnread(events.filter((event) => !event.is_read).length);
    } catch {
      toast('Notifications are temporarily unavailable', 'error');
    }
  }, [isNetworkAdmin, toast, user?.hospitalId]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const navigate = (next: WorkspaceView) => {
    setView(next);
    setMobileOpen(false);
    if (next === 'notifications') loadNotifications();
  };

  const roleLabel = isNetworkAdmin ? 'Network administrator' : user?.role === 'admin' ? 'Hospital administrator' : 'Pharmacy operations';
  const initials = (user?.email ?? 'MR').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-[100dvh] bg-[#f7fafc] text-slate-900">
      <header className="fixed inset-x-0 top-0 z-40 h-[72px] border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="flex h-full items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              data-testid="button-open-navigation"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0f766e] shadow-sm shadow-teal-900/15">
              <Activity className="h-5 w-5 text-white" strokeWidth={2.2} />
            </div>
            <div className="leading-none">
              <div className="font-display text-[17px] font-bold tracking-tight text-[#1e3142]">MedRebalance</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[.16em] text-[#64748b]">Clinical supply network</div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden items-center gap-2 border-r border-slate-200 pr-4 text-right sm:flex">
              <div>
                <div className="text-sm font-semibold text-slate-700">{roleLabel}</div>
                <div className="mt-0.5 text-xs text-slate-400">{user?.email}</div>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e7f4f1] text-xs font-bold text-[#0f766e]">{initials}</div>
            </div>
            <button
              data-testid="button-header-notifications"
              onClick={() => navigate('notifications')}
              className="relative rounded-xl p-2.5 text-slate-500 transition-colors hover:bg-[#eef8f6] hover:text-[#0f766e]"
              aria-label={`${unread} unread notifications`}
            >
              <Bell className="h-[19px] w-[19px]" />
              {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#c2413b] ring-2 ring-white" />}
            </button>
            <button
              data-testid="button-sign-out"
              onClick={() => signOut()}
              className="hidden items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 sm:flex"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      {mobileOpen && <button data-testid="button-close-navigation-overlay" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-slate-900/25 lg:hidden" aria-label="Close navigation" />}
      <aside className={`fixed bottom-0 left-0 top-[72px] z-50 w-[248px] border-r border-slate-200 bg-white px-3 py-5 transition-transform duration-200 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-5 flex items-center justify-between px-3 lg:hidden">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Navigation</span>
          <button data-testid="button-close-navigation" onClick={() => setMobileOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Workspace</div>
        <NavItem active={view === 'overview'} icon={<LayoutDashboard />} label="Operations overview" onClick={() => navigate('overview')} testId="nav-overview" />
        <NavItem active={view === 'notifications'} icon={<Bell />} label="Notifications" count={unread} onClick={() => navigate('notifications')} testId="nav-notifications" />
        <div className="mt-7 px-3 pb-2 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Governance</div>
        <NavItem active={view === 'audit'} icon={<FileClock />} label="Audit trail" onClick={() => navigate('audit')} testId="nav-audit" />
        <NavItem active={view === 'billing'} icon={<ReceiptText />} label="Billing & plan" onClick={() => navigate('billing')} testId="nav-billing" />
        <div className="absolute bottom-5 left-3 right-3 rounded-2xl border border-[#d9ebe7] bg-[#f1faf8] p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-[#0f766e]"><Shield className="h-4 w-4" /> Clinical safeguards</div>
          <p className="text-xs leading-5 text-[#52726e]">Every transfer is logged and visible to the network team.</p>
        </div>
      </aside>

      <main className="min-h-[100dvh] pt-[72px] lg:pl-[248px]">
        <div className="mx-auto max-w-[1520px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {view === 'overview' && (
            <div className="workspace-enter">
              <OnboardingBanner />
              {isNetworkAdmin ? <AdminDashboard /> : <PharmacistDashboard />}
            </div>
          )}
          {view === 'notifications' && <NotificationsPanel events={notifications} onRead={async (id) => { await markNotificationRead(id); loadNotifications(); }} onReadAll={async () => { await markAllNotificationsRead(user.hospitalId ?? '', isNetworkAdmin); loadNotifications(); }} />}
          {view === 'audit' && <AuditPanel />}
          {view === 'billing' && <BillingPanel isNetworkAdmin={isNetworkAdmin} hospitalId={user.hospitalId ?? ''} toast={toast} />}
        </div>
      </main>
    </div>
  );
}

function NavItem({ active, icon, label, count, onClick, testId }: { active: boolean; icon: React.ReactNode; label: string; count?: number; onClick: () => void; testId: string }) {
  return (
    <button data-testid={testId} onClick={onClick} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${active ? 'bg-[#e7f4f1] text-[#0f766e]' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}>
      <span className={`${active ? 'text-[#0f766e]' : 'text-slate-400 group-hover:text-slate-600'}`}>{icon}</span>
      <span className="flex-1">{label}</span>
      {count ? <span className="rounded-full bg-[#c2413b] px-1.5 py-0.5 text-[10px] font-bold text-white">{count}</span> : null}
      {active && <ChevronRight className="h-3.5 w-3.5" />}
    </button>
  );
}

function LoadingScreen() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-[#f7fafc]"><div className="flex flex-col items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0f766e] shadow-lg shadow-teal-900/10"><Activity className="h-7 w-7 animate-pulse text-white" /></div><div className="skeleton h-3 w-36 rounded-full" /><p className="text-xs font-medium text-slate-400">Connecting to your clinical workspace</p></div></div>;
}

function NotificationsPanel({ events, onRead, onReadAll }: { events: NotificationEvent[]; onRead: (id: string) => Promise<void>; onReadAll: () => Promise<void> }) {
  return <SectionFrame eyebrow="Activity center" title="Notifications" description="Operational events from your hospital network." action={events.some((event) => !event.is_read) ? <button data-testid="button-mark-all-read" onClick={onReadAll} className="text-sm font-semibold text-[#0f766e] hover:text-[#095e58]">Mark all as read</button> : undefined}>
    <div className="divide-y divide-slate-100">{events.length === 0 ? <EmptyPanel icon={<Bell />} title="You are all caught up" message="New transfer, stockout, and inventory events will appear here." /> : events.map((event) => <button data-testid={`notification-${event.id}`} key={event.id} onClick={() => !event.is_read && onRead(event.id)} className={`flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50 ${!event.is_read ? 'bg-[#f5fbfa]' : ''}`}><div className={`mt-0.5 h-9 w-9 flex-shrink-0 rounded-xl ${!event.is_read ? 'bg-[#dff2ed] text-[#0f766e]' : 'bg-slate-100 text-slate-400'} flex items-center justify-center`}><Activity className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="text-sm font-semibold text-slate-800">{event.title}</p>{!event.is_read && <span className="h-1.5 w-1.5 rounded-full bg-[#0f766e]" />}</div><p className="mt-1 text-sm text-slate-500">{event.message}</p><p className="mt-2 text-xs text-slate-400">{new Date(event.created_at).toLocaleString()}</p></div></button>)}</div>
  </SectionFrame>;
}

function AuditPanel() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => { fetchAuditLogs().then(setLogs).catch(() => setError(true)).finally(() => setLoading(false)); }, []);
  return <SectionFrame eyebrow="Accountability" title="Audit trail" description="A read-only record of inventory, transfer, and settlement activity."><div className="overflow-x-auto">{error ? <EmptyPanel icon={<CircleHelp />} title="Audit trail unavailable" message="Please refresh and try again." /> : loading ? <div className="space-y-3 p-5">{[1, 2, 3, 4].map((i) => <div className="skeleton h-12 rounded-xl" key={i} />)}</div> : logs.length === 0 ? <EmptyPanel icon={<FileClock />} title="No audit events yet" message="Mutations will be recorded here automatically." /> : <table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3 font-semibold">Action</th><th className="px-5 py-3 font-semibold">Table</th><th className="px-5 py-3 font-semibold">Record</th><th className="px-5 py-3 font-semibold">When</th></tr></thead><tbody className="divide-y divide-slate-100">{logs.map((log) => <tr key={log.id} data-testid={`audit-row-${log.id}`} className="hover:bg-slate-50"><td className="px-5 py-4 font-semibold text-slate-700">{log.action}</td><td className="px-5 py-4 text-slate-500">{log.table_name}</td><td className="px-5 py-4 font-mono text-xs text-slate-400">{log.record_id ?? '—'}</td><td className="px-5 py-4 text-slate-500">{new Date(log.created_at).toLocaleString()}</td></tr>)}</tbody></table>}</div></SectionFrame>;
}

function BillingPanel({ isNetworkAdmin, hospitalId, toast }: { isNetworkAdmin: boolean; hospitalId: string; toast: (message: string, type?: 'success' | 'error' | 'info') => void }) {
  const [status, setStatus] = useState<HospitalBilling | null>(null);
  const [allStatuses, setAllStatuses] = useState<HospitalBilling[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  useEffect(() => { (isNetworkAdmin ? fetchAllBillingStatuses().then(setAllStatuses) : fetchBillingStatus(hospitalId).then(setStatus)).catch(() => toast('Billing information is unavailable', 'error')).finally(() => setLoading(false)); }, [hospitalId, isNetworkAdmin, toast]);
  const begin = async () => { setStarting(true); try { const url = await startSubscription(hospitalId, 'Hospital subscription'); if (url) window.location.href = url; else toast('Stripe billing is not configured for this workspace', 'info'); } catch { toast('Unable to start subscription', 'error'); } finally { setStarting(false); } };
  return <SectionFrame eyebrow="Commercial operations" title="Billing & plan" description="Subscription status and platform fee visibility for the network.">{loading ? <div className="skeleton h-44 rounded-2xl" /> : isNetworkAdmin ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{allStatuses.length === 0 ? <EmptyPanel icon={<Building2 />} title="No billing records" message="Hospital subscriptions will appear here." /> : allStatuses.map((item) => <div className="rounded-2xl border border-slate-200 p-5" key={item.hospital_id}><div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Hospital account</div><div className="mt-2 font-semibold text-slate-800">{item.subscription_status === 'active' ? 'Active subscription' : 'Subscription not set up'}</div><div className="mt-1 text-sm text-slate-500">₹{item.subscription_amount.toLocaleString('en-IN')} / month</div></div>)}</div> : <div className="max-w-xl rounded-2xl border border-slate-200 bg-[#fbfdfd] p-6"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e7f4f1] text-[#0f766e]"><ReceiptText className="h-5 w-5" /></div><div><div className="font-display text-lg font-bold text-slate-800">{status?.subscription_status === 'active' ? 'Subscription active' : 'Plan setup required'}</div><div className="text-sm text-slate-500">{status?.subscription_status === 'active' ? 'Your hospital account is in good standing.' : 'Connect a subscription to keep network operations enabled.'}</div></div></div><div className="mt-6 flex flex-wrap items-center gap-3"><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">Platform fee: 3.5% per completed transfer</span>{status?.subscription_status !== 'active' && <button data-testid="button-start-subscription" onClick={begin} disabled={starting || !isStripeConfigured()} className="rounded-xl bg-[#0f766e] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0b625c] disabled:opacity-50">{starting ? 'Opening checkout…' : isStripeConfigured() ? 'Set up subscription' : 'Billing not configured'}</button>}</div></div>}</SectionFrame>;
}

function SectionFrame({ eyebrow, title, description, action, children }: { eyebrow: string; title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <div className="workspace-enter"><div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#0f766e]">{eyebrow}</div><h1 className="font-display text-3xl font-bold tracking-tight text-[#1e3142]">{title}</h1><p className="mt-2 text-sm text-slate-500">{description}</p></div>{action}</div><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{children}</div></div>;
}

function EmptyPanel({ icon, title, message }: { icon: React.ReactNode; title: string; message: string }) {
  return <div className="flex flex-col items-center justify-center px-6 py-16 text-center"><div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">{icon}</div><div className="font-semibold text-slate-700">{title}</div><p className="mt-1 max-w-sm text-sm text-slate-400">{message}</p></div>;
}

export default function App() {
  return <ToastProvider><AuthProvider><AppContent /></AuthProvider></ToastProvider>;
}