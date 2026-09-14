import { Link } from 'react-router-dom';
import { Calendar, ArrowRight, Vote } from 'lucide-react';
import type { Election } from '@/types';
import { StatusBadge } from './ui/StatusBadge';
import { ELECTION_STATUS_META, formatDateTime } from '@/lib/utils';

export function ElectionCard({ election }: { election: Election }) {
  const status = election.effectiveStatus || election.status;
  const meta = ELECTION_STATUS_META[status];
  const isActive = status === 'active';

  return (
    <article className="card flex flex-col overflow-hidden transition-shadow hover:shadow-elevated">
      <div className="flex items-center justify-between border-b border-charcoal-100 bg-charcoal-50 px-5 py-3">
        <StatusBadge label={meta.label} tone={meta.tone} />
        {isActive && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amr-teal">
            <Vote size={14} /> Voting open
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-lg font-semibold text-charcoal-900">{election.title}</h3>
        {election.description && (
          <p className="mt-1.5 line-clamp-2 text-sm text-charcoal-500">{election.description}</p>
        )}

        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-charcoal-600">
            <Calendar size={15} className="text-charcoal-400" />
            <dt className="sr-only">Voting window</dt>
            <dd>
              {formatDateTime(election.startDateTime)} — {formatDateTime(election.endDateTime)}
            </dd>
          </div>
        </dl>

        <div className="mt-5 flex gap-2">
          <Link to={`/elections/${election.slug}`} className="btn-secondary flex-1">
            View details
          </Link>
          {isActive && (
            <Link to={`/vote/${election.slug}`} className="btn-primary flex-1">
              Vote now <ArrowRight size={16} />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
