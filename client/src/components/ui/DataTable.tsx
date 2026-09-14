import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { SkeletonRows } from './Skeleton';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  rowKey: (row: T) => string;
  empty?: { icon: LucideIcon; title: string; description?: string };
}

export function DataTable<T>({ columns, rows, loading, rowKey, empty }: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="card p-4">
        <SkeletonRows rows={6} />
      </div>
    );
  }

  if (rows.length === 0 && empty) {
    return <EmptyState icon={empty.icon} title={empty.title} description={empty.description} />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-charcoal-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-charcoal-200 bg-charcoal-50 text-left text-xs uppercase tracking-wide text-charcoal-500">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-4 py-3 font-medium ${
                    c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''
                  }`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal-100">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-charcoal-50/60">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-4 py-3 ${
                      c.align === 'right'
                        ? 'text-right'
                        : c.align === 'center'
                          ? 'text-center'
                          : ''
                    } ${c.className ?? ''}`}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
