import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Vote,
  Users,
  ShieldCheck,
  Upload,
  ScrollText,
  Settings,
  X,
} from 'lucide-react';
import { BrandMark } from '@/components/Brand';
import { useAuth } from '@/store/AuthContext';
import { cn } from '@/lib/utils';

const nav = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/elections', label: 'Elections', icon: Vote },
  { to: '/admin/student-import', label: 'Voter import', icon: Upload, superOnly: true },
  { to: '/admin/admins', label: 'Administrators', icon: ShieldCheck, superOnly: true },
  { to: '/admin/audit-logs', label: 'Audit logs', icon: ScrollText },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { admin } = useAuth();
  const isSuper = admin?.role === 'super_admin';

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
      isActive
        ? 'bg-white/10 text-white font-semibold'
        : 'text-slate-300 hover:bg-white/5 hover:text-white',
    );

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-charcoal-950/50 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-navy-900 transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <div className="flex items-center gap-2.5">
            <BrandMark size={32} />
            <div className="leading-tight">
              <p className="font-display text-sm font-bold text-white">AMR IEC</p>
              <p className="text-[10px] text-amr-teal">Electoral Committee</p>
            </div>
          </div>
          <button className="text-white lg:hidden" onClick={onClose} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {nav
            .filter((n) => !n.superOnly || isSuper)
            .map((n) => (
              <NavLink key={n.to} to={n.to} className={linkClass} onClick={onClose}>
                <n.icon size={18} />
                {n.label}
              </NavLink>
            ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          <p className="text-xs text-slate-300">
            Signed in as <span className="font-medium text-white">{admin?.username}</span>
          </p>
          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-amr-teal">
            {isSuper ? 'Super Admin' : 'Election Admin'}
          </p>
        </div>
      </aside>
    </>
  );
}
