import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ShieldCheck } from 'lucide-react';
import { useAuth, type UserRole } from '@/lib/AuthContext';

type RoleOption = {
  role: UserRole;
  label: string;
  shortLabel: string;
  description: string;
};

const ROLE_OPTIONS: RoleOption[] = [
  {
    role: 'pharmacist',
    label: 'Pharmacy operations',
    shortLabel: 'Pharmacy',
    description: 'Inventory, stockouts and transfers',
  },
  {
    role: 'admin',
    label: 'Hospital administrator',
    shortLabel: 'Hospital admin',
    description: 'Hospital governance and billing',
  },
  {
    role: 'network_admin',
    label: 'Network administrator',
    shortLabel: 'Network admin',
    description: 'Network-wide operations and rebalance',
  },
];

export default function RoleSwitcher({ onSwitched }: { onSwitched?: () => void }) {
  const { user, memberships, switchWorkspace } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!user) return null;

  const authorizedRoles = ROLE_OPTIONS.filter((option) => memberships.some((item) => item.role === option.role));
  const current = ROLE_OPTIONS.find((option) => option.role === user.role) ?? ROLE_OPTIONS[0];

  if (authorizedRoles.length <= 1) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <ShieldCheck className="h-4 w-4 text-[#0f766e]" />
        <span className="text-xs font-semibold text-slate-600">{current.shortLabel}</span>
      </div>
    );
  }

  const selectRole = (role: UserRole) => {
    if (role === user.role) {
      setOpen(false);
      return;
    }
    if (switchWorkspace(role)) {
      setOpen(false);
      onSwitched?.();
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        data-testid="button-role-switcher"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition-colors hover:border-[#b9dcd6] hover:bg-[#f7fbfa]"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#e7f4f1] text-[#0f766e]">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div className="hidden min-w-0 sm:block">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Workspace</div>
          <div className="max-w-[125px] truncate text-xs font-semibold text-slate-700">{current.shortLabel}</div>
        </div>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          data-testid="role-switcher-menu"
          className="absolute right-0 top-[calc(100%+8px)] z-[60] w-[290px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10"
        >
          <div className="px-3 pb-2 pt-2">
            <div className="text-xs font-bold text-slate-800">Switch workspace</div>
            <div className="mt-0.5 text-[11px] text-slate-400">Only roles assigned to this account are shown.</div>
          </div>
          <div className="space-y-1">
            {authorizedRoles.map((option) => {
              const active = option.role === user.role;
              return (
                <button
                  key={option.role}
                  type="button"
                  role="menuitem"
                  data-testid={`role-option-${option.role}`}
                  onClick={() => selectRole(option.role)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${active ? 'bg-[#e7f4f1]' : 'hover:bg-slate-50'}`}
                >
                  <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${active ? 'bg-white text-[#0f766e]' : 'bg-slate-100 text-slate-500'}`}>
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-semibold ${active ? 'text-[#0f766e]' : 'text-slate-700'}`}>{option.label}</div>
                    <div className="mt-0.5 text-[11px] leading-4 text-slate-400">{option.description}</div>
                  </div>
                  {active && <Check className="h-4 w-4 flex-shrink-0 text-[#0f766e]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
