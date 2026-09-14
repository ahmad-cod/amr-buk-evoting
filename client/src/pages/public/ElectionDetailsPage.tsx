import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Vote, BarChart3, Info, Users, CalendarClock } from 'lucide-react';
import { publicApi, qk } from '@/services/queries';
import { FullPageSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CandidateCard } from '@/components/CandidateCard';
import { CandidateProfileModal } from '@/components/CandidateProfileModal';
import { CountdownTimer } from '@/components/CountdownTimer';
import { ELECTION_STATUS_META, formatDateTime, positionId } from '@/lib/utils';
import type { Candidate, Position } from '@/types';

export function ElectionDetailsPage() {
  const { slug = '' } = useParams();
  const [selected, setSelected] = useState<{ candidate: Candidate; positionTitle: string } | null>(
    null,
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: qk.publicElection(slug),
    queryFn: () => publicApi.getElection(slug),
    enabled: !!slug,
  });

  const grouped = useMemo(() => {
    if (!data) return [];
    return data.positions
      .slice()
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((pos) => ({
        position: pos,
        candidates: data.candidates.filter((c) => positionId(c.positionId) === pos.id),
      }));
  }, [data]);

  if (isLoading) return <FullPageSpinner />;
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState
          icon={Info}
          title="Election not found"
          description="This election may have been removed or is not publicly available."
          action={
            <Link to="/elections" className="btn-secondary">
              Back to elections
            </Link>
          }
        />
      </div>
    );
  }

  const { election } = data;
  const status = election.effectiveStatus || election.status;
  const meta = ELECTION_STATUS_META[status];
  const votingOpen = election.votingOpen ?? status === 'active';
  const showResults = election.finalResultsPublished || election.liveResultsEnabled;

  return (
    <div>
      <section className="border-b border-charcoal-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <Link
            to="/elections"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-charcoal-500 hover:text-charcoal-800"
          >
            <ArrowLeft size={16} /> All elections
          </Link>

          <div className="mt-4 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <StatusBadge label={meta.label} tone={meta.tone} />
              </div>
              <h1 className="mt-3 font-display text-3xl font-bold text-charcoal-900">
                {election.title}
              </h1>
              {election.description && (
                <p className="mt-2 max-w-2xl text-charcoal-600">{election.description}</p>
              )}
              <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-charcoal-600">
                <div className="flex items-center gap-2">
                  <CalendarClock size={16} className="text-charcoal-400" />
                  <dd>
                    {formatDateTime(election.startDateTime)} — {formatDateTime(election.endDateTime)}
                  </dd>
                </div>
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-charcoal-400" />
                  <dd>{data.positions.length} positions · {data.candidates.length} candidates</dd>
                </div>
              </dl>

              <div className="mt-6 flex flex-wrap gap-3">
                {votingOpen && (
                  <Link to={`/vote/${election.slug}`} className="btn-primary">
                    <Vote size={18} /> Vote now
                  </Link>
                )}
                {showResults && (
                  <Link to={`/elections/${election.slug}/results`} className="btn-secondary">
                    <BarChart3 size={18} /> View results
                  </Link>
                )}
              </div>
            </div>

            {status === 'active' && (
              <div className="shrink-0 rounded-lg border border-charcoal-200 bg-charcoal-50 p-4">
                <CountdownTimer target={election.endDateTime} label="Voting closes in" />
              </div>
            )}
            {status === 'scheduled' && (
              <div className="shrink-0 rounded-lg border border-charcoal-200 bg-charcoal-50 p-4">
                <CountdownTimer target={election.startDateTime} label="Voting opens in" />
              </div>
            )}
          </div>
        </div>
      </section>

      {election.instructions && (
        <div className="mx-auto max-w-5xl px-4 pt-8">
          <div className="flex gap-3 rounded-lg border border-green-600/20 bg-green-50 p-4">
            <Info size={20} className="mt-0.5 shrink-0 text-green-700" />
            <div>
              <h2 className="text-sm font-semibold text-green-900">Voting instructions</h2>
              <p className="mt-1 whitespace-pre-line text-sm text-green-800">
                {election.instructions}
              </p>
            </div>
          </div>
        </div>
      )}

      <section className="mx-auto max-w-5xl px-4 py-8">
        <h2 className="font-display text-2xl font-bold text-charcoal-900">Candidates</h2>

        {grouped.length === 0 ? (
          <div className="mt-6">
            <EmptyState icon={Users} title="No candidates yet" description="Candidates will appear here once approved." />
          </div>
        ) : (
          <div className="mt-6 space-y-10">
            {grouped.map(({ position, candidates }) => (
              <PositionSection
                key={position.id}
                position={position}
                candidates={candidates}
                onView={(c) => setSelected({ candidate: c, positionTitle: position.title })}
              />
            ))}
          </div>
        )}
      </section>

      <CandidateProfileModal
        open={!!selected}
        candidate={selected?.candidate ?? null}
        positionTitle={selected?.positionTitle}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function PositionSection({
  position,
  candidates,
  onView,
}: {
  position: Position;
  candidates: Candidate[];
  onView: (c: Candidate) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between border-b border-charcoal-200 pb-2">
        <h3 className="font-display text-lg font-semibold text-charcoal-900">{position.title}</h3>
        <span className="text-sm text-charcoal-400">{candidates.length} contesting</span>
      </div>
      {position.description && (
        <p className="mt-2 text-sm text-charcoal-500">{position.description}</p>
      )}
      {candidates.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-charcoal-300 bg-white px-4 py-6 text-center text-sm text-charcoal-400">
          No approved candidates for this position yet.
        </p>
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {candidates.map((c) => (
            <CandidateCard
              key={c.id}
              fullName={c.fullName}
              faculty={c.faculty}
              department={c.department}
              level={c.level}
              campaignSlogan={c.campaignSlogan}
              imageUrl={c.imageUrl}
              onViewProfile={() => onView(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
