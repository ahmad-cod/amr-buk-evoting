import { Check, AlertTriangle, ShieldCheck, CheckCircle2, Copy } from 'lucide-react';
import { Modal } from './ui/Modal';
import { LoadingSpinner } from './ui/LoadingSpinner';
import type { BallotPosition } from '@/types';
import { useToast } from '@/store/ToastContext';
import { formatDateTime } from '@/lib/utils';

export function VotingProgress({
  positions,
  selections,
}: {
  positions: BallotPosition[];
  selections: Record<string, string[]>;
}) {
  const total = positions.length;
  const done = positions.filter((p) => (selections[p.position.id]?.length ?? 0) > 0).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="rounded-lg border border-charcoal-200 bg-white p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-charcoal-800">Your progress</span>
        <span className="text-charcoal-500">
          {done} of {total} positions
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-charcoal-100">
        <div
          className="h-full rounded-full bg-amr-navy transition-all"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

export function BallotReview({
  positions,
  selections,
  onEdit,
}: {
  positions: BallotPosition[];
  selections: Record<string, string[]>;
  onEdit: (positionId: string) => void;
}) {
  return (
    <div className="space-y-2">
      {positions.map((p) => {
        const chosen = selections[p.position.id] ?? [];
        const names = chosen
          .map((id) => p.candidates.find((c) => c.id === id)?.fullName)
          .filter(Boolean);
        return (
          <div
            key={p.position.id}
            className="flex items-center justify-between rounded-md border border-charcoal-200 bg-white px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-charcoal-400">
                {p.position.title}
              </p>
              {names.length > 0 ? (
                <p className="mt-0.5 flex items-center gap-1.5 font-medium text-charcoal-900">
                  <Check size={15} className="text-amr-teal" /> {names.join(', ')}
                </p>
              ) : (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gold-700">
                  <AlertTriangle size={15} /> No selection (abstaining)
                </p>
              )}
            </div>
            <button onClick={() => onEdit(p.position.id)} className="text-sm font-semibold text-amr-navy hover:underline">
              Edit
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function VoteConfirmationModal({
  open,
  onClose,
  onConfirm,
  submitting,
  selectedCount,
  totalPositions,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
  selectedCount: number;
  totalPositions: number;
}) {
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Confirm your vote">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amr-pale-blue">
          <ShieldCheck size={20} className="text-amr-navy" />
        </div>
        <div className="text-sm text-charcoal-600">
          <p>
            You are about to submit your vote for{' '}
            <strong className="text-charcoal-900">
              {selectedCount} of {totalPositions}
            </strong>{' '}
            positions.
          </p>
          <p className="mt-2 font-medium text-charcoal-900">
            This action is final and cannot be undone.
          </p>
          <p className="mt-2">
            Your ballot will be recorded anonymously. No one will be able to see how you voted.
          </p>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button className="btn-secondary" onClick={onClose} disabled={submitting}>
          Review again
        </button>
        <button className="btn-primary" onClick={onConfirm} disabled={submitting}>
          {submitting ? <LoadingSpinner size={16} className="text-white" /> : 'Submit my vote'}
        </button>
      </div>
    </Modal>
  );
}

export function VoteReceiptCard({
  receiptCode,
  submittedAt,
  electionTitle,
  qrDataUrl,
}: {
  receiptCode: string;
  submittedAt?: string;
  electionTitle?: string;
  qrDataUrl?: string;
}) {
  const toast = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(receiptCode);
      toast.success('Receipt code copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="card overflow-hidden">
        <div className="flex flex-col items-center bg-navy-900 px-6 py-8 text-center text-white">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amr-teal/20 text-amr-teal">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="mt-4 font-display text-xl font-bold">Your vote is in!</h2>
          <p className="mt-1 text-sm text-amr-pale-blue">
            Thank you for voting{electionTitle ? ` in ${electionTitle}` : ''}.
          </p>
        </div>

        <div className="p-6">
          {qrDataUrl && (
            <div className="flex justify-center">
              <img
                src={qrDataUrl}
                alt="Receipt QR code"
                className="h-40 w-40 rounded-lg border border-charcoal-200"
              />
            </div>
          )}

          <div className="mt-5">
            <p className="text-center text-xs font-medium uppercase tracking-wide text-charcoal-400">
              Your receipt code
            </p>
            <div className="mt-2 flex items-center justify-center gap-2">
              <code className="rounded-md bg-charcoal-100 px-3 py-2 font-mono text-lg font-semibold tracking-wider text-charcoal-900">
                {receiptCode}
              </code>
              <button
                onClick={copy}
                className="rounded-md border border-charcoal-200 p-2 text-charcoal-500 hover:bg-charcoal-50"
                aria-label="Copy receipt code"
              >
                <Copy size={16} />
              </button>
            </div>
          </div>

          {submittedAt && (
            <p className="mt-4 text-center text-xs text-charcoal-400">
              Submitted {formatDateTime(submittedAt)}
            </p>
          )}

          <div className="mt-5 rounded-md border border-charcoal-200 bg-charcoal-50 p-3 text-center text-xs text-charcoal-500">
            Keep this code as proof that your vote was counted. It does not reveal your selections.
          </div>
        </div>
      </div>
    </div>
  );
}
