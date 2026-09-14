import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Vote,
  MoreVertical,
  Pencil,
  Users,
  BarChart3,
  ListChecks,
  Play,
  Pause,
  Square,
  Archive,
  Trash2,
  Send,
} from 'lucide-react';
import { adminApi, qk } from '@/services/queries';
import { useToast } from '@/store/ToastContext';
import { useAuth } from '@/store/AuthContext';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { ConfirmDialog } from '@/components/ui/Modal';
import { ELECTION_STATUS_META, formatDateTime } from '@/lib/utils';
import type { Election, ElectionStatus } from '@/types';
import { ApiError } from '@/lib/api';

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'active', label: 'Active' },
  { key: 'closed', label: 'Closed' },
  { key: 'archived', label: 'Archived' },
];

export function AdminElectionsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { admin } = useAuth();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ election: Election; action: 'delete' | 'archive' } | null>(
    null,
  );

  const { data, isLoading } = useQuery({
    queryKey: qk.adminElections(status, search, page),
    queryFn: () => adminApi.listElections(status || undefined, search || undefined, page),
  });

  const lifecycle = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      adminApi.lifecycle(id, action),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['admin-elections'] });
      toast.success(`Election ${labelForAction(v.action)}.`);
      setOpenMenu(null);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Action failed'),
  });

  const del = useMutation({
    mutationFn: (id: string) => adminApi.deleteElection(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-elections'] });
      toast.success('Election removed.');
      setConfirm(null);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Delete failed'),
  });

  const elections = data?.data ?? [];
  const isSuper = admin?.role === 'super_admin';

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl font-bold text-charcoal-900">Elections</h2>
          <p className="mt-1 text-sm text-charcoal-500">Create and manage elections and their lifecycle.</p>
        </div>
        <Link to="/admin/elections/create" className="btn-primary">
          <Plus size={18} /> New election
        </Link>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => {
                setStatus(f.key);
                setPage(1);
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                status === f.key
                  ? 'bg-amr-navy text-white'
                  : 'border border-charcoal-200 bg-white text-charcoal-600 hover:bg-charcoal-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-400" />
          <input
            className="input pl-9"
            placeholder="Search elections"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="card p-4">
            <SkeletonRows rows={6} />
          </div>
        ) : elections.length === 0 ? (
          <EmptyState
            icon={Vote}
            title="No elections yet"
            description="Create your first election to get started."
            action={
              <Link to="/admin/elections/create" className="btn-primary">
                <Plus size={18} /> New election
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {elections.map((e) => (
              <ElectionRow
                key={e.id}
                election={e}
                isSuper={isSuper}
                menuOpen={openMenu === e.id}
                onToggleMenu={() => setOpenMenu((v) => (v === e.id ? null : e.id))}
                onLifecycle={(action) => lifecycle.mutate({ id: e.id, action })}
                onConfirm={(action) => {
                  setConfirm({ election: e, action });
                  setOpenMenu(null);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {data?.meta && (
        <div className="mt-6">
          <Pagination meta={data.meta} onPage={setPage} />
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.action === 'delete' ? 'Remove election' : 'Archive election'}
        destructive={confirm?.action === 'delete'}
        message={
          confirm?.action === 'delete' ? (
            <>
              This will permanently remove <strong>{confirm?.election.title}</strong>. Elections with
              votes are archived instead. This cannot be undone.
            </>
          ) : (
            <>
              Archive <strong>{confirm?.election.title}</strong>? It will no longer appear in active
              listings.
            </>
          )
        }
        confirmLabel={confirm?.action === 'delete' ? 'Remove' : 'Archive'}
        loading={del.isPending || lifecycle.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.action === 'delete') del.mutate(confirm.election.id);
          else lifecycle.mutate({ id: confirm.election.id, action: 'archive' });
        }}
      />
    </div>
  );
}

function ElectionRow({
  election,
  isSuper,
  menuOpen,
  onToggleMenu,
  onLifecycle,
  onConfirm,
}: {
  election: Election;
  isSuper: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onLifecycle: (action: string) => void;
  onConfirm: (action: 'delete' | 'archive') => void;
}) {
  const status = (election.effectiveStatus || election.status) as ElectionStatus;
  const meta = ELECTION_STATUS_META[status];

  const actions = lifecycleActions(status);

  return (
    <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-display text-base font-semibold text-charcoal-900">
            {election.title}
          </h3>
          <StatusBadge label={meta.label} tone={meta.tone} />
        </div>
        <p className="mt-1 text-xs text-charcoal-500">
          {formatDateTime(election.startDateTime)} — {formatDateTime(election.endDateTime)}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Link to={`/admin/elections/${election.id}/positions`} className="btn-ghost px-2.5 py-1.5" title="Positions">
          <ListChecks size={16} />
        </Link>
        <Link to={`/admin/elections/${election.id}/candidates`} className="btn-ghost px-2.5 py-1.5" title="Candidates">
          <Users size={16} />
        </Link>
        <Link to={`/admin/elections/${election.id}/results`} className="btn-ghost px-2.5 py-1.5" title="Results">
          <BarChart3 size={16} />
        </Link>
        <Link to={`/admin/elections/${election.id}/edit`} className="btn-secondary px-3 py-1.5">
          <Pencil size={15} /> Edit
        </Link>

        <div className="relative">
          <button className="btn-ghost px-2 py-1.5" onClick={onToggleMenu} aria-label="More actions">
            <MoreVertical size={18} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-10 mt-1 w-48 rounded-md border border-charcoal-200 bg-white py-1 shadow-elevated">
              {actions.map((a) => (
                <button
                  key={a.action}
                  onClick={() => onLifecycle(a.action)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-charcoal-700 hover:bg-charcoal-50"
                >
                  <a.icon size={15} /> {a.label}
                </button>
              ))}
              <Link
                to={`/admin/elections/${election.id}/voters`}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-charcoal-700 hover:bg-charcoal-50"
              >
                <Users size={15} /> Voters
              </Link>
              {isSuper && (
                <>
                  <div className="my-1 border-t border-charcoal-100" />
                  <button
                    onClick={() => onConfirm('delete')}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={15} /> Remove
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function lifecycleActions(status: ElectionStatus) {
  const items: Array<{ action: string; label: string; icon: typeof Play }> = [];
  if (status === 'draft') items.push({ action: 'publish', label: 'Publish / schedule', icon: Send });
  if (status === 'scheduled') items.push({ action: 'publish', label: 'Re-publish', icon: Send });
  if (status === 'active') {
    items.push({ action: 'pause', label: 'Pause voting', icon: Pause });
    items.push({ action: 'close', label: 'Close election', icon: Square });
  }
  if (status === 'paused') {
    items.push({ action: 'resume', label: 'Resume voting', icon: Play });
    items.push({ action: 'close', label: 'Close election', icon: Square });
  }
  if (status === 'closed') {
    items.push({ action: 'publish-results', label: 'Publish results', icon: BarChart3 });
    items.push({ action: 'archive', label: 'Archive', icon: Archive });
  }
  return items;
}

function labelForAction(action: string): string {
  const map: Record<string, string> = {
    publish: 'published',
    pause: 'paused',
    resume: 'resumed',
    close: 'closed',
    archive: 'archived',
    'publish-results': 'results published',
  };
  return map[action] || 'updated';
}
