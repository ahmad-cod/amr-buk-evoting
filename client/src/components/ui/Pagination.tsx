import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageMeta } from '@/types';

export function Pagination({
  meta,
  onPage,
}: {
  meta: PageMeta;
  onPage: (page: number) => void;
}) {
  if (meta.totalPages <= 1) return null;
  return (
    <nav className="flex items-center justify-between border-t border-charcoal-200 px-1 pt-4" aria-label="Pagination">
      <p className="text-sm text-charcoal-500">
        Page {meta.page} of {meta.totalPages} · {meta.total} total
      </p>
      <div className="flex gap-2">
        <button
          className="btn-secondary px-3 py-1.5"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
        >
          <ChevronLeft size={16} /> Prev
        </button>
        <button
          className="btn-secondary px-3 py-1.5"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPage(meta.page + 1)}
        >
          Next <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
}
