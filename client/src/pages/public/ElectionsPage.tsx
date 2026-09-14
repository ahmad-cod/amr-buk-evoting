import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Vote } from 'lucide-react';
import { publicApi, qk } from '@/services/queries';
import { ElectionCard } from '@/components/ElectionCard';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { cn } from '@/lib/utils';

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'scheduled', label: 'Upcoming' },
  { key: 'closed', label: 'Closed' },
];

export function ElectionsPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: qk.publicElections(status, page),
    queryFn: () => publicApi.listElections(status || undefined, page),
  });

  const elections = data?.data ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="border-b border-charcoal-200 pb-6">
        <h1 className="font-display text-3xl font-bold text-navy-900">Elections</h1>
        <p className="mt-1 text-charcoal-500">
          Browse all AMR Club BUK elections. Enroll and sign in to cast your secret ballot in active elections.
        </p>
      </header>

      <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Filter elections">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={status === f.key}
            onClick={() => {
              setStatus(f.key);
              setPage(1);
            }}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              status === f.key
                ? 'bg-amr-navy text-white shadow-sm'
                : 'border border-charcoal-200 bg-white text-charcoal-600 hover:bg-amr-pale-blue/50',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : elections.length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <EmptyState
              icon={Vote}
              title="No elections found"
              description="There are no elections matching this filter yet."
            />
          </div>
        ) : (
          elections.map((e) => <ElectionCard key={e.id} election={e} />)
        )}
      </div>

      {data?.meta && (
        <div className="mt-8">
          <Pagination meta={data.meta} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
