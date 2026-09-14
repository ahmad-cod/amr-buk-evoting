import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Users,
  Search,
  CheckCircle2,
  XCircle,
  UserCheck,
  ShieldCheck,
  Mail,
  Send,
  Clock,
  Eye,
  EyeOff,
  AlertCircle,
  RefreshCw,
  FileSpreadsheet,
} from 'lucide-react';
import { adminApi, qk } from '@/services/queries';
import { useToast } from '@/store/ToastContext';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ApiError } from '@/lib/api';
import type { Student } from '@/types';

export function ManageVotersPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [unmask, setUnmask] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const { data: election } = useQuery({
    queryKey: qk.adminElection(id),
    queryFn: () => adminApi.getElection(id),
    enabled: !!id,
  });

  const { data: stats } = useQuery({
    queryKey: qk.studentStats(id || undefined),
    queryFn: () => adminApi.studentStats(id || undefined),
  });

  const { data, isLoading } = useQuery({
    queryKey: qk.students(page, search, undefined, id || undefined, statusFilter || undefined, unmask),
    queryFn: () =>
      adminApi.listStudents(
        page,
        search || undefined,
        undefined,
        id || undefined,
        statusFilter || undefined,
        unmask,
      ),
  });

  const toggle = useMutation({
    mutationFn: ({ studentId, isEligible }: { studentId: string; isEligible: boolean }) =>
      adminApi.toggleEligibility(studentId, isEligible),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: qk.studentStats(id || undefined) });
      toast.success('Voter eligibility updated.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Update failed'),
  });

  const sendAll = useMutation({
    mutationFn: () => adminApi.sendVerificationLinks(id || undefined),
    onSuccess: (res) => {
      setConfirmModalOpen(false);
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: qk.studentStats(id || undefined) });
      toast.success(`Verification links sent to ${res.sent} pending voters.`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed to send verification links.'),
  });

  const resend = useMutation({
    mutationFn: (studentId: string) => adminApi.resendVerification(studentId),
    onMutate: (studentId) => setResendingId(studentId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['students'] });
      toast.success(`Link dispatched to ${res.maskedEmail}.`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed to resend link.'),
    onSettled: () => setResendingId(null),
  });

  const columns: Column<Student>[] = [
    {
      key: 'name',
      header: 'Member / Email',
      render: (s) => (
        <div>
          <p className="font-medium text-charcoal-900">{s.fullName}</p>
          <p className="font-mono text-xs text-charcoal-500">
            {unmask ? s.email : s.maskedEmail || s.email}
          </p>
          {s.serialNumber && (
            <span className="inline-block mt-0.5 text-[11px] font-mono font-medium text-amr-teal bg-amr-pale-blue px-1.5 py-0.2 rounded">
              S/N #{s.serialNumber}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'dept',
      header: 'Programme / Faculty',
      render: (s) => (
        <div>
          <p className="text-charcoal-700 text-sm">{s.programme || s.department || 'AMR Club Member'}</p>
          {s.faculty && <p className="text-xs text-charcoal-400">{s.faculty}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Verification Status',
      align: 'center',
      render: (s) => {
        const st = s.status || (s.hasRegistered ? 'VERIFIED' : 'PENDING');
        if (st === 'VERIFIED') {
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
              <CheckCircle2 size={13} className="text-emerald-600" /> Verified
            </span>
          );
        }
        if (st === 'REVOKED' || s.isEligible === false) {
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 border border-red-200">
              <XCircle size={13} /> Revoked
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
            <Clock size={13} /> Pending
          </span>
        );
      },
    },
    {
      key: 'action',
      header: 'Actions',
      align: 'right',
      render: (s) => (
        <div className="flex items-center justify-end gap-1.5">
          {s.status !== 'REVOKED' && s.isEligible !== false && (
            <button
              className="btn-ghost px-2 py-1 text-xs text-amr-navy font-medium inline-flex items-center gap-1"
              disabled={resendingId === s.id}
              onClick={() => resend.mutate(s.id)}
              title="Resend 30-minute verification link"
            >
              {resendingId === s.id ? (
                <LoadingSpinner size={12} />
              ) : (
                <Send size={12} className="text-amr-teal" />
              )}
              Resend
            </button>
          )}

          <button
            className={
              s.isEligible !== false && s.status !== 'REVOKED'
                ? 'btn-ghost px-2 py-1 text-xs text-charcoal-500 hover:text-red-600'
                : 'btn-ghost px-2 py-1 text-xs text-amr-navy font-semibold'
            }
            disabled={toggle.isPending}
            onClick={() => toggle.mutate({ studentId: s.id, isEligible: !(s.isEligible !== false) })}
          >
            {s.isEligible !== false && s.status !== 'REVOKED' ? 'Revoke' : 'Restore'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link
          to="/admin/elections"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-charcoal-500 hover:text-charcoal-800"
        >
          <ArrowLeft size={16} /> Elections
        </Link>
        <Link
          to="/admin/student-import"
          className="btn-secondary text-xs inline-flex items-center gap-1.5"
        >
          <FileSpreadsheet size={14} /> Import Roster
        </Link>
      </div>

      <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-charcoal-900">Voter Registry</h2>
          <p className="mt-1 text-sm text-charcoal-500">
            {election?.election.title ? (
              <>
                <span className="font-semibold text-charcoal-800">{election.election.title}</span> · Accredited members registry and email verification dispatch.
              </>
            ) : (
              'Accredited members registry and email verification dispatch.'
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setConfirmModalOpen(true)}
          disabled={sendAll.isPending || !stats?.pending}
          className="btn-primary inline-flex items-center gap-2 self-start md:self-auto text-sm"
        >
          {sendAll.isPending ? <LoadingSpinner size={16} className="text-white" /> : <Mail size={16} />}
          Send Links to All Pending ({stats?.pending ?? 0})
        </button>
      </div>

      {/* Stats Cards */}
      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Users size={18} />} label="Total on Roster" value={stats?.total} />
        <StatCard icon={<Clock size={18} className="text-amber-600" />} label="Pending Verification" value={stats?.pending} />
        <StatCard icon={<CheckCircle2 size={18} className="text-emerald-600" />} label="Verified Voters" value={stats?.verified} />
        <StatCard icon={<XCircle size={18} className="text-red-500" />} label="Revoked / Suspended" value={stats?.revoked} />
      </div>

      {/* Filters Toolbar */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-400" />
            <input
              className="input pl-9 text-sm"
              placeholder="Search by name, email, or serial #"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <select
            className="input w-40 text-sm"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="VERIFIED">Verified</option>
            <option value="REVOKED">Revoked</option>
          </select>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => setUnmask((v) => !v)}
            className="btn-ghost text-xs inline-flex items-center gap-1.5 text-charcoal-600 border border-charcoal-200"
            title={unmask ? 'Mask email addresses' : 'Unmask full email addresses'}
          >
            {unmask ? <EyeOff size={14} /> : <Eye size={14} />}
            {unmask ? 'Mask Emails' : 'Unmask Emails'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={data?.data ?? []}
          loading={isLoading}
          rowKey={(s) => s.id}
          empty={{ icon: Users, title: 'No voters found', description: 'Try adjusting your search or status filter.' }}
        />
      </div>

      {data?.meta && (
        <div className="mt-6">
          <Pagination meta={data.meta} onPage={setPage} />
        </div>
      )}

      {/* Send Links Confirmation Modal */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="card w-full max-w-md p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amr-pale-blue text-amr-navy">
                <Mail size={20} className="text-amr-teal" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-charcoal-900">
                  Send Verification Links
                </h3>
                <p className="mt-1 text-xs text-charcoal-500 leading-relaxed">
                  This will generate cryptographically secure, single-use 30-minute verification tokens
                  and email them to all <span className="font-bold text-charcoal-800">{stats?.pending ?? 0}</span> pending voters on the roster for this election.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-md border border-charcoal-200 bg-charcoal-50 p-3 text-xs text-charcoal-600">
              <p className="font-medium text-charcoal-800">Security Invariants:</p>
              <ul className="mt-1 list-disc pl-4 space-y-0.5 text-charcoal-500">
                <li>Tokens are hashed with SHA-256 at rest</li>
                <li>Single-use with atomic redemption</li>
                <li>Voters verify email ownership before accessing their ballot</li>
              </ul>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={sendAll.isPending}
                onClick={() => setConfirmModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary text-sm inline-flex items-center gap-2"
                disabled={sendAll.isPending}
                onClick={() => sendAll.mutate()}
              >
                {sendAll.isPending ? <LoadingSpinner size={16} className="text-white" /> : <Send size={14} />}
                Confirm & Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value?: number }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-charcoal-500">{label}</p>
        <span className="text-charcoal-400">{icon}</span>
      </div>
      <p className="mt-2 font-display text-2xl font-bold tabular-nums text-charcoal-900">
        {value ?? '—'}
      </p>
    </div>
  );
}

