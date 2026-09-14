import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Info,
  Lock,
  Vote,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { voteApi, qk } from '@/services/queries';
import { ApiError } from '@/lib/api';
import { useToast } from '@/store/ToastContext';
import { FullPageSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { CountdownTimer } from '@/components/CountdownTimer';
import {
  VotingProgress,
  BallotReview,
  VoteConfirmationModal,
  VoteReceiptCard,
} from '@/components/Voting';
import { initials } from '@/lib/utils';
import type { BallotPosition } from '@/types';

type Phase = 'vote' | 'review';

export function VotingPage() {
  const { slug = '' } = useParams();
  const toast = useToast();
  const idempotencyKey = useRef<string>(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`,
  );

  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [phase, setPhase] = useState<Phase>('vote');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<{ receiptCode: string; submittedAt?: string } | null>(
    null,
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: qk.ballot(slug),
    queryFn: () => voteApi.getBallot(slug),
    enabled: !!slug,
    retry: false,
  });

  // If the student has already voted, load the receipt.
  const { data: receiptData } = useQuery({
    queryKey: qk.receipt(slug),
    queryFn: () => voteApi.receipt(slug),
    enabled: !!slug && !!data?.hasVoted,
  });

  const positions = useMemo<BallotPosition[]>(() => data?.ballot ?? [], [data]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [phase]);

  if (isLoading) return <FullPageSpinner />;

  if (isError) {
    const status = error instanceof ApiError ? error.status : 0;
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          icon={status === 403 ? Lock : Info}
          title={status === 403 ? 'You are not eligible to vote here' : 'Ballot unavailable'}
          description={
            error instanceof ApiError
              ? error.message
              : 'We could not load this ballot. Please try again later.'
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

  if (!data) return null;

  // Already voted → show receipt.
  if (data.hasVoted || receipt) {
    const code = receipt?.receiptCode || receiptData?.receiptCode || '—';
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <VoteReceiptCard
          receiptCode={code}
          submittedAt={receipt?.submittedAt || receiptData?.submittedAt}
          electionTitle={data.election.title}
          qrDataUrl={receiptData?.qrDataUrl}
        />
        <div className="mt-6 flex justify-center gap-3">
          <Link to={`/elections/${slug}`} className="btn-secondary">
            Back to election
          </Link>
          <Link to="/elections" className="btn-ghost">
            All elections
          </Link>
        </div>
      </div>
    );
  }

  // Voting not open.
  if (!data.votingOpen) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          icon={Clock}
          title="Voting is not open"
          description={
            data.votingClosedReason ||
            'This election is not currently accepting votes. Please check the schedule.'
          }
          action={
            <Link to={`/elections/${slug}`} className="btn-secondary">
              Back to election
            </Link>
          }
        />
      </div>
    );
  }

  const select = (positionId: string, candidateId: string, max: number) => {
    setSelections((prev) => {
      const current = prev[positionId] ?? [];
      // Single-choice behaviour when max is 1; toggle off if same.
      if (max <= 1) {
        return { ...prev, [positionId]: current[0] === candidateId ? [] : [candidateId] };
      }
      // Multi-choice up to max.
      if (current.includes(candidateId)) {
        return { ...prev, [positionId]: current.filter((id) => id !== candidateId) };
      }
      if (current.length >= max) {
        toast.info(`You can select up to ${max} for this position.`);
        return prev;
      }
      return { ...prev, [positionId]: [...current, candidateId] };
    });
  };

  const selectedCount = positions.filter((p) => (selections[p.position.id]?.length ?? 0) > 0).length;

  const submit = async () => {
    setSubmitting(true);
    try {
      const payload = positions
        .filter((p) => (selections[p.position.id]?.length ?? 0) > 0)
        .map((p) => ({ positionId: p.position.id, candidateIds: selections[p.position.id] }));

      const res = await voteApi.submit(slug, payload, idempotencyKey.current);
      setReceipt({ receiptCode: res.receiptCode, submittedAt: res.submittedAt });
      setConfirmOpen(false);
      toast.success(res.alreadyVoted ? 'You have already voted.' : 'Your vote has been recorded.');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to submit vote.';
      toast.error(message);
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        to={`/elections/${slug}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-charcoal-500 hover:text-charcoal-800"
      >
        <ArrowLeft size={16} /> {data.election.title}
      </Link>

      <div className="mt-4 flex flex-col gap-4 border-b border-charcoal-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal-900">
            {phase === 'vote' ? 'Cast your vote' : 'Review your ballot'}
          </h1>
          <p className="mt-1 text-sm text-charcoal-500">
            {phase === 'vote'
              ? 'Select one candidate for each position.'
              : 'Confirm your selections before submitting.'}
          </p>
        </div>
        <CountdownTimer target={data.election.endDateTime} label="Closes in" />
      </div>

      {data.election.instructions && phase === 'vote' && (
        <div className="mt-6 flex gap-3 rounded-lg border border-amr-teal/30 bg-amr-pale-blue p-4">
          <Info size={18} className="mt-0.5 shrink-0 text-amr-teal" />
          <p className="whitespace-pre-line text-sm text-amr-navy font-medium">
            {data.election.instructions}
          </p>
        </div>
      )}

      <div className="mt-6">
        <VotingProgress positions={positions} selections={selections} />
      </div>

      {phase === 'vote' ? (
        <>
          <div className="mt-6 space-y-8">
            {positions.map((p, idx) => (
              <fieldset key={p.position.id}>
                <legend className="flex w-full items-baseline justify-between border-b border-charcoal-200 pb-2">
                  <span className="font-display text-lg font-semibold text-charcoal-900">
                    {idx + 1}. {p.position.title}
                  </span>
                  {p.position.maxVotesPerVoter > 1 && (
                    <span className="text-xs text-charcoal-400">
                      Choose up to {p.position.maxVotesPerVoter}
                    </span>
                  )}
                </legend>
                {p.position.description && (
                  <p className="mt-2 text-sm text-charcoal-500">{p.position.description}</p>
                )}

                {p.candidates.length === 0 ? (
                  <p className="mt-4 text-sm text-charcoal-400">No candidates for this position.</p>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {p.candidates.map((c) => {
                      const checked = (selections[p.position.id] ?? []).includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                            checked
                              ? 'border-amr-navy bg-amr-pale-blue ring-1 ring-amr-navy'
                              : 'border-charcoal-200 bg-white hover:border-charcoal-300'
                          }`}
                        >
                          <input
                            type={p.position.maxVotesPerVoter > 1 ? 'checkbox' : 'radio'}
                            name={p.position.id}
                            className="sr-only"
                            checked={checked}
                            onChange={() =>
                              select(p.position.id, c.id, p.position.maxVotesPerVoter)
                            }
                          />
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-amr-navy">
                            {c.imageUrl ? (
                              <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-white">
                                {initials(c.fullName)}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-charcoal-900">{c.fullName}</p>
                            {c.campaignSlogan && (
                              <p className="truncate text-xs italic text-gold-700">
                                “{c.campaignSlogan}”
                              </p>
                            )}
                            {c.department && (
                              <p className="truncate text-xs text-charcoal-400">{c.department}</p>
                            )}
                          </div>
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                              checked ? 'border-amr-navy bg-amr-navy' : 'border-charcoal-300'
                            }`}
                          >
                            {checked && <CheckCircle2 size={14} className="text-white" />}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </fieldset>
            ))}
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-charcoal-200 pt-6">
            <p className="text-sm text-charcoal-500">
              {selectedCount} of {positions.length} positions selected
            </p>
            <button className="btn-primary" onClick={() => setPhase('review')}>
              Review ballot <ArrowRight size={18} />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-6">
            <BallotReview
              positions={positions}
              selections={selections}
              onEdit={() => setPhase('vote')}
            />
          </div>

          {selectedCount < positions.length && (
            <p className="mt-4 rounded-md border border-gold-500/30 bg-gold-50 px-4 py-3 text-sm text-gold-800">
              You have left {positions.length - selectedCount} position(s) blank. You can go back to
              make a selection, or submit and abstain on those positions.
            </p>
          )}

          <div className="mt-8 flex items-center justify-between border-t border-charcoal-200 pt-6">
            <button className="btn-secondary" onClick={() => setPhase('vote')}>
              <ArrowLeft size={18} /> Back to ballot
            </button>
            <button
              className="btn-primary"
              onClick={() => setConfirmOpen(true)}
              disabled={selectedCount === 0}
            >
              <Vote size={18} /> Submit vote
            </button>
          </div>
        </>
      )}

      <VoteConfirmationModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={submit}
        submitting={submitting}
        selectedCount={selectedCount}
        totalPositions={positions.length}
      />
    </div>
  );
}
