import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Vote,
  Users,
  CheckSquare,
  UserCheck,
  Clock,
  Plus,
  Activity,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import { adminApi, qk } from '@/services/queries';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ELECTION_STATUS_META, timeAgo } from '@/lib/utils';
import type { ElectionStatus } from '@/types';

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: qk.dashboard(),
    queryFn: () => adminApi.dashboard(),
  });

  const t = data?.totals;

  const cards = [
    { label: 'Total elections', value: t?.elections, icon: Vote, tone: 'text-amr-navy bg-amr-pale-blue' },
    { label: 'Active now', value: t?.activeElections, icon: Clock, tone: 'text-amr-teal bg-amr-teal/10' },
    { label: 'Registered voters', value: t?.registeredVoters, icon: Users, tone: 'text-charcoal-700 bg-charcoal-100' },
    { label: 'Votes cast', value: t?.votesCast, icon: CheckSquare, tone: 'text-amr-navy bg-amr-pale-blue' },
  ];

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl font-bold text-charcoal-900">Overview</h2>
          <p className="mt-1 text-sm text-charcoal-500">
            Summary of elections, voters, and activity across the platform.
          </p>
        </div>
        <Link to="/admin/elections/create" className="btn-primary">
          <Plus size={18} /> New election
        </Link>
      </div>

      {/* Stat cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-5">
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${c.tone}`}>
              <c.icon size={20} />
            </div>
            <p className="mt-3 font-display text-3xl font-bold tabular-nums text-charcoal-900">
              {isLoading ? '—' : (c.value ?? 0).toLocaleString()}
            </p>
            <p className="text-sm text-charcoal-500">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Turnout + eligibility */}
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-2 text-charcoal-500">
              <TrendingUp size={18} />
              <h3 className="text-sm font-semibold">Overall turnout</h3>
            </div>
            <p className="mt-3 font-display text-4xl font-bold text-amr-navy">
              {isLoading ? '—' : `${t?.turnoutPercentage ?? 0}%`}
            </p>
            <p className="text-sm text-charcoal-500">
              {t?.votesCast ?? 0} of {t?.eligibleVoters ?? 0} eligible voters
            </p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-charcoal-100">
              <div
                className="h-full rounded-full bg-amr-teal"
                style={{ width: `${Math.min(100, t?.turnoutPercentage ?? 0)}%` }}
              />
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 text-charcoal-500">
              <UserCheck size={18} />
              <h3 className="text-sm font-semibold">Candidates</h3>
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <p className="font-display text-3xl font-bold text-charcoal-900">
                  {t?.candidates ?? 0}
                </p>
                <p className="text-sm text-charcoal-500">Total candidates</p>
              </div>
              {(t?.pendingCandidates ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-50 px-2.5 py-1 text-xs font-medium text-gold-700">
                  <AlertCircle size={13} /> {t?.pendingCandidates} pending
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Status breakdown */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-charcoal-700">Elections by status</h3>
          <div className="mt-4 space-y-2">
            {data && Object.keys(data.statusBreakdown).length > 0 ? (
              Object.entries(data.statusBreakdown).map(([status, count]) => {
                const meta = ELECTION_STATUS_META[status as ElectionStatus] || {
                  label: status,
                  tone: 'charcoal' as const,
                };
                return (
                  <div key={status} className="flex items-center justify-between">
                    <StatusBadge label={meta.label} tone={meta.tone} />
                    <span className="font-semibold tabular-nums text-charcoal-900">{count}</span>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-charcoal-400">No elections yet.</p>
            )}
          </div>
        </div>

        {/* Recent activity */}
        <div className="card p-5">
          <div className="flex items-center gap-2 text-charcoal-700">
            <Activity size={18} />
            <h3 className="text-sm font-semibold">Recent activity</h3>
          </div>
          <div className="mt-4">
            {isLoading ? (
              <SkeletonRows rows={4} />
            ) : data && data.recentActivity.length > 0 ? (
              <ul className="space-y-3">
                {data.recentActivity.slice(0, 6).map((log) => (
                  <li key={log._id} className="text-sm">
                    <p className="font-medium text-charcoal-800">
                      {humanizeAction(log.action)}
                    </p>
                    <p className="text-xs text-charcoal-400">
                      {typeof log.adminId === 'object' && log.adminId
                        ? log.adminId.username
                        : log.actorLabel || 'system'}{' '}
                      · {timeAgo(log.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-charcoal-400">No activity recorded yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function humanizeAction(action: string): string {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bId\b/, 'ID');
}
