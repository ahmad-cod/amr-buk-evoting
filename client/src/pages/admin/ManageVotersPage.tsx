import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Users, Search, CheckCircle2, XCircle, UserCheck, ShieldCheck } from 'lucide-react';
import { adminApi, qk } from '@/services/queries';
import { useToast } from '@/store/ToastContext';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { ApiError } from '@/lib/api';
import type { Student } from '@/types';

export function ManageVotersPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');

  const { data: election } = useQuery({
    queryKey: qk.adminElection(id),
    queryFn: () => adminApi.getElection(id),
    enabled: !!id,
  });

  const { data: stats } = useQuery({
    queryKey: qk.studentStats(),
    queryFn: () => adminApi.studentStats(),
  });

  const { data, isLoading } = useQuery({
    queryKey: qk.students(page, search, dept),
    queryFn: () => adminApi.listStudents(page, search || undefined, dept || undefined),
  });

  const toggle = useMutation({
    mutationFn: ({ studentId, isEligible }: { studentId: string; isEligible: boolean }) =>
      adminApi.toggleEligibility(studentId, isEligible),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: qk.studentStats() });
      toast.success('Voter eligibility updated.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Update failed'),
  });

  const columns: Column<Student>[] = [
    {
      key: 'name',
      header: 'Member',
      render: (s) => (
        <div>
          <p className="font-medium text-charcoal-900">{s.fullName}</p>
          <p className="font-mono text-xs text-charcoal-500">{s.email}</p>
          {s.serialNumber && (
            <p className="text-[11px] font-mono text-amr-teal">#{s.serialNumber}</p>
          )}
        </div>
      ),
    },
    {
      key: 'dept',
      header: 'Programme / Faculty',
      render: (s) => (
        <div>
          <p className="text-charcoal-700">{s.programme || s.department || 'AMR Club Member'}</p>
          {s.faculty && <p className="text-xs text-charcoal-400">{s.faculty}</p>}
        </div>
      ),
    },
    {
      key: 'registered',
      header: 'Account',
      align: 'center',
      render: (s) =>
        s.hasRegistered ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amr-navy">
            <UserCheck size={14} className="text-amr-teal" /> Registered
          </span>
        ) : (
          <span className="text-xs text-charcoal-400">Not registered</span>
        ),
    },
    {
      key: 'eligible',
      header: 'Eligibility',
      align: 'center',
      render: (s) =>
        s.isEligible !== false ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amr-pale-blue px-2 py-0.5 text-xs font-medium text-amr-navy">
            <CheckCircle2 size={13} className="text-amr-teal" /> Eligible
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-charcoal-100 px-2 py-0.5 text-xs font-medium text-charcoal-500">
            <XCircle size={13} /> Suspended
          </span>
        ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (s) => (
        <button
          className={s.isEligible !== false ? 'btn-ghost px-2.5 py-1 text-charcoal-600' : 'btn-ghost px-2.5 py-1 text-amr-navy font-semibold'}
          disabled={toggle.isPending}
          onClick={() => toggle.mutate({ studentId: s.id, isEligible: !(s.isEligible !== false) })}
        >
          {s.isEligible !== false ? 'Suspend' : 'Restore'}
        </button>
      ),
    },
  ];

  return (
    <div>
      <Link
        to="/admin/elections"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-charcoal-500 hover:text-charcoal-800"
      >
        <ArrowLeft size={16} /> Elections
      </Link>

      <div className="mt-4">
        <h2 className="font-display text-2xl font-bold text-charcoal-900">Voter register</h2>
        <p className="mt-1 text-sm text-charcoal-500">
          {election?.election.title} · accredited members eligible to register and vote.
        </p>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        <StatCard icon={<Users size={18} />} label="In register" value={stats?.total} />
        <StatCard icon={<ShieldCheck size={18} />} label="Eligible" value={stats?.eligible} />
        <StatCard icon={<UserCheck size={18} />} label="Registered accounts" value={stats?.registered} />
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-400" />
          <input
            className="input pl-9"
            placeholder="Search by name, email, or identifier"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={data?.data ?? []}
          loading={isLoading}
          rowKey={(s) => s.id}
          empty={{ icon: Users, title: 'No voters found', description: 'Try adjusting your search.' }}
        />
      </div>

      {data?.meta && (
        <div className="mt-6">
          <Pagination meta={data.meta} onPage={setPage} />
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value?: number }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-charcoal-400">{icon}</div>
      <p className="mt-2 font-display text-2xl font-bold tabular-nums text-charcoal-900">
        {value ?? '—'}
      </p>
      <p className="text-xs text-charcoal-500">{label}</p>
    </div>
  );
}
