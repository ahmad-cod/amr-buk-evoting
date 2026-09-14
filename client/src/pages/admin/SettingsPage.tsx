import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Shield,
  User,
  LogOut,
  Lock,
  Clock,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/store/AuthContext';
import { useToast } from '@/store/ToastContext';
import { formatDateTime } from '@/lib/utils';

export function SettingsPage() {
  const { admin, logoutAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const isSuper = admin?.role === 'super_admin';

  const signOut = async () => {
    await logoutAdmin();
    toast.success('Signed out');
    navigate('/admin/login', { replace: true });
  };

  const superCaps = [
    'Create, edit, and manage all elections',
    'Manage positions, candidates, and results',
    'Import and manage the student register',
    'Add and manage other administrators',
    'View audit logs',
  ];
  const electionCaps = [
    'Create, edit, and manage elections',
    'Manage positions and candidates',
    'Approve or reject candidates',
    'View and publish results',
    'View audit logs',
  ];

  return (
    <div className="max-w-3xl">
      <div>
        <h2 className="font-display text-2xl font-bold text-charcoal-900">Settings</h2>
        <p className="mt-1 text-sm text-charcoal-500">Your account and portal preferences.</p>
      </div>

      {/* Profile */}
      <section className="mt-6 card p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-charcoal-700">
          <User size={17} /> Account
        </h3>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amr-pale-blue text-amr-navy">
            {isSuper ? <ShieldCheck size={26} /> : <Shield size={26} />}
          </div>
          <div>
            <p className="font-display text-lg font-semibold text-charcoal-900">
              {admin?.fullName || admin?.username}
            </p>
            <p className="text-sm text-charcoal-500">@{admin?.username}</p>
          </div>
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-charcoal-200 bg-charcoal-50 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-charcoal-400">Role</dt>
            <dd className="mt-1 font-medium text-charcoal-800">
              {isSuper ? 'Super Admin' : 'Election Admin'}
            </dd>
          </div>
          <div className="rounded-md border border-charcoal-200 bg-charcoal-50 p-3">
            <dt className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-charcoal-400">
              <Clock size={12} /> Last sign in
            </dt>
            <dd className="mt-1 font-medium text-charcoal-800">
              {admin?.lastLoginAt ? formatDateTime(admin.lastLoginAt) : 'This session'}
            </dd>
          </div>
        </dl>
      </section>

      {/* Capabilities */}
      <section className="mt-6 card p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-charcoal-700">
          <KeyRound size={17} /> Your permissions
        </h3>
        <ul className="mt-4 space-y-2">
          {(isSuper ? superCaps : electionCaps).map((cap) => (
            <li key={cap} className="flex items-center gap-2 text-sm text-charcoal-700">
              <CheckCircle2 size={16} className="shrink-0 text-amr-teal" /> {cap}
            </li>
          ))}
        </ul>
      </section>

      {/* Security */}
      <section className="mt-6 card p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-charcoal-700">
          <Lock size={17} /> Security
        </h3>
        <div className="mt-4 space-y-3 text-sm text-charcoal-600">
          <p className="flex gap-2">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-amr-teal" />
            Every action you take in this portal is recorded in the audit log with a timestamp and
            source.
          </p>
          <p className="flex gap-2">
            <Lock size={16} className="mt-0.5 shrink-0 text-amr-teal" />
            Your session is protected with a secure, http-only cookie that cannot be read by scripts.
          </p>
          {!isSuper && (
            <p className="rounded-md border border-charcoal-200 bg-charcoal-50 p-3 text-xs text-charcoal-500">
              To change your password or role, contact a Super Admin.
            </p>
          )}
        </div>
      </section>

      <div className="mt-6">
        <button className="btn-danger" onClick={signOut}>
          <LogOut size={17} /> Sign out
        </button>
      </div>
    </div>
  );
}
