import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BarChart3, Lock, Users, CheckCircle2, Clock } from 'lucide-react';
import { publicApi, qk } from '@/services/queries';
import { FullPageSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ResultsChart, ResultsTable } from '@/components/Results';
import { formatDateTime } from '@/lib/utils';

export function ResultsPage() {
  const { slug = '' } = useParams();
  const { data, isLoading } = useQuery({
    queryKey: qk.publicResults(slug),
    queryFn: () => publicApi.getResults(slug),
    enabled: !!slug,
    refetchInterval: 15_000, // keep live results fresh
  });

  if (isLoading) return <FullPageSpinner />;

  if (!data || !data.available) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState
          icon={Lock}
          title="Results are not available yet"
          description={
            data?.reason ||
            'The committee has not published results for this election. Please check back later.'
          }
          action={
            <Link to={`/elections/${slug}`} className="btn-secondary">
              <ArrowLeft size={16} /> Back to election
            </Link>
          }
        />
      </div>
    );
  }

  const { election, turnout, positions, isFinal } = data;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link
        to={`/elections/${slug}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-charcoal-500 hover:text-charcoal-800"
      >
        <ArrowLeft size={16} /> {election?.title}
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-charcoal-900">Results</h1>
          <p className="mt-1 text-charcoal-500">{election?.title}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
            isFinal ? 'bg-green-50 text-green-700' : 'bg-gold-50 text-gold-700'
          }`}
        >
          {isFinal ? <CheckCircle2 size={16} /> : <Clock size={16} />}
          {isFinal ? 'Final results' : 'Live results (provisional)'}
        </span>
      </div>

      {/* Turnout */}
      {turnout && (
        <div className="mt-6 grid grid-cols-3 gap-4">
          <Stat label="Votes cast" value={turnout.votesCast} icon={<BarChart3 size={18} />} />
          <Stat label="Eligible voters" value={turnout.eligibleVoters} icon={<Users size={18} />} />
          <Stat label="Turnout" value={`${turnout.turnoutPercentage}%`} icon={<CheckCircle2 size={18} />} />
        </div>
      )}

      {!isFinal && (
        <p className="mt-4 rounded-md border border-gold-500/30 bg-gold-50 px-4 py-3 text-sm text-gold-800">
          These results are provisional and may change until voting closes and the committee
          publishes final results.
        </p>
      )}

      {/* Positions */}
      <div className="mt-8 space-y-8">
        {positions?.map((p) => (
          <section key={p.positionId} className="card p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-semibold text-charcoal-900">{p.title}</h2>
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

      {data.generatedAt && (
        <p className="mt-6 text-center text-xs text-charcoal-400">
          Last updated {formatDateTime(data.generatedAt)}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-charcoal-400">{icon}</div>
      <p className="mt-2 font-display text-2xl font-bold text-charcoal-900 tabular-nums">{value}</p>
      <p className="text-xs text-charcoal-500">{label}</p>
    </div>
  );
}
