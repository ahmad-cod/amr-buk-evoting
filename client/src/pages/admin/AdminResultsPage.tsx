import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BarChart3,
  Download,
  Send,
  CheckCircle2,
  Clock,
  Users,
  Eye,
  AlertCircle,
} from 'lucide-react';
import { adminApi, qk } from '@/services/queries';
import { useToast } from '@/store/ToastContext';
import { FullPageSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ResultsChart, ResultsTable } from '@/components/Results';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useState } from 'react';
import { ApiError } from '@/lib/api';

export function AdminResultsPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmPublish, setConfirmPublish] = useState(false);

  const { data: election } = useQuery({
    queryKey: qk.adminElection(id),
    queryFn: () => adminApi.getElection(id),
    enabled: !!id,
  });

  const { data, isLoading } = useQuery({
    queryKey: qk.adminResults(id),
    queryFn: () => adminApi.adminResults(id),
    enabled: !!id,
    refetchInterval: 20_000,
  });

  const publish = useMutation({
    mutationFn: () => adminApi.lifecycle(id, 'publish-results'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.adminResults(id) });
      qc.invalidateQueries({ queryKey: qk.adminElection(id) });
      qc.invalidateQueries({ queryKey: ['admin-elections'] });
      toast.success('Final results published.');
      setConfirmPublish(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed to publish'),
  });

  if (isLoading) return <FullPageSpinner />;

  const el = election?.election;
  const published = el?.finalResultsPublished;

  return (
    <div>
      <Link
        to="/admin/elections"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-charcoal-500 hover:text-charcoal-800"
      >
        <ArrowLeft size={16} /> Elections
      </Link>

      <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h2 className="font-display text-2xl font-bold text-charcoal-900">Results</h2>
          <p className="mt-1 text-sm text-charcoal-500">{el?.title}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={adminApi.exportResultsUrl(id)}
            className="btn-secondary"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download size={16} /> Export CSV
          </a>
          {!published && (
            <button className="btn-primary" onClick={() => setConfirmPublish(true)}>
              <Send size={16} /> Publish results
            </button>
          )}
        </div>
      </div>

      {/* Admin preview banner */}
      <div className="mt-4 flex items-center gap-2 rounded-md border border-charcoal-200 bg-charcoal-50 px-4 py-2.5 text-sm text-charcoal-600">
        <Eye size={16} className="text-charcoal-400" />
        {published ? (
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 size={15} className="text-amr-teal" /> Final results are published and
            visible to voters.
          </span>
        ) : (
          <span>
            This is an administrator preview. Results are not public until you publish them.
          </span>
        )}
      </div>

      {!data || !data.positions || data.positions.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={BarChart3}
            title="No results to show yet"
            description="Results will appear here once votes have been cast."
          />
        </div>
      ) : (
        <>
          {data.turnout && (
            <div className="mt-6 grid grid-cols-3 gap-4">
              <Stat icon={<BarChart3 size={18} />} label="Votes cast" value={data.turnout.votesCast} />
              <Stat icon={<Users size={18} />} label="Eligible voters" value={data.turnout.eligibleVoters} />
              <Stat
                icon={<CheckCircle2 size={18} />}
                label="Turnout"
                value={`${data.turnout.turnoutPercentage}%`}
              />
            </div>
          )}

          <div className="mt-8 space-y-8">
            {data.positions.map((p) => (
              <section key={p.positionId} className="card p-5">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-display text-lg font-semibold text-charcoal-900">{p.title}</h3>
                  <span className="text-sm text-charcoal-400">{p.totalVotes} votes</span>
                </div>
                <div className="mt-4">
                  <ResultsChart position={p} />
                </div>
                <div className="mt-4">
                  <ResultsTable position={p} />
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmPublish}
        title="Publish final results"
        message={
          <>
            Publishing makes the results for <strong>{el?.title}</strong> permanently visible to all
            voters and the public. Make sure voting has closed and the tally is correct.
          </>
        }
        confirmLabel="Publish results"
        loading={publish.isPending}
        onCancel={() => setConfirmPublish(false)}
        onConfirm={() => publish.mutate()}
      />
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-charcoal-400">{icon}</div>
      <p className="mt-2 font-display text-2xl font-bold tabular-nums text-charcoal-900">{value}</p>
      <p className="text-xs text-charcoal-500">{label}</p>
    </div>
  );
}
