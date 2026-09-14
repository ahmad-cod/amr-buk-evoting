import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, Search, ShieldCheck } from 'lucide-react';
import { adminApi, qk } from '@/services/queries';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { formatDateTime } from '@/lib/utils';
import type { AuditLog } from '@/types';

export function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: qk.auditLogs(page, search),
    queryFn: () => adminApi.auditLogs(page, search || undefined),
  });

  const columns: Column<AuditLog>[] = [
    {
      key: 'action',
      header: 'Action',
      render: (l) => (
        <div>
          <p className="font-medium text-charcoal-900">{humanize(l.action)}</p>
          {l.resourceType && (
            <p className="text-xs text-charcoal-400">
              {l.resourceType}
              {l.resourceId ? ` · ${String(l.resourceId).slice(-6)}` : ''}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (l) => {
        const name =
          typeof l.adminId === 'object' && l.adminId ? l.adminId.username : l.actorLabel || 'system';
        return (
          <span className="inline-flex items-center gap-1.5 text-charcoal-700">
            <ShieldCheck size={14} className="text-charcoal-400" /> {name}
          </span>
        );
      },
    },
    {
      key: 'ip',
      header: 'Source',
      render: (l) => <span className="font-mono text-xs text-charcoal-500">{l.ipAddress || '—'}</span>,
    },
    {
      key: 'time',
      header: 'Time',
      align: 'right',
      render: (l) => <span className="text-xs text-charcoal-500">{formatDateTime(l.createdAt)}</span>,
    },
  ];

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl font-bold text-charcoal-900">Audit logs</h2>
          <p className="mt-1 text-sm text-charcoal-500">
            A record of administrative actions taken across the platform.
          </p>
        </div>
        <div className="relative sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-400" />
          <input
            className="input pl-9"
            placeholder="Search actions or actors"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="mt-6">
        <DataTable
          columns={columns}
          rows={data?.data ?? []}
          loading={isLoading}
          rowKey={(l) => l._id}
          empty={{ icon: ScrollText, title: 'No audit logs', description: 'Administrative actions will be recorded here.' }}
        />
      </div>

      {data?.meta && (
        <div className="mt-6">
          <Pagination meta={data.meta} onPage={setPage} />
        </div>
      )}
    </div>
  );
}

function humanize(action: string): string {
  return action
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bId\b/g, 'ID')
    .replace(/\bCsv\b/g, 'CSV');
}
