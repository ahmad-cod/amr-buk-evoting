import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  Tooltip,
  LabelList,
} from 'recharts';
import { Trophy } from 'lucide-react';
import type { PositionResult } from '@/types';
import { initials } from '@/lib/utils';

const GREEN = '#1f6a33';
const GOLD = '#c08f2d';

export function ResultsChart({ position }: { position: PositionResult }) {
  const data = position.candidates.map((c) => ({
    name: c.fullName,
    short: c.fullName.length > 16 ? c.fullName.slice(0, 15) + '…' : c.fullName,
    votes: c.votes,
    isWinner: c.isWinner,
  }));

  if (data.length === 0) {
    return <p className="text-sm text-charcoal-400">No candidates.</p>;
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#697070' }} />
          <YAxis
            type="category"
            dataKey="short"
            width={120}
            tick={{ fontSize: 12, fill: '#3f4343' }}
          />
          <Tooltip
            cursor={{ fill: '#f5f6f6' }}
            formatter={(v: number) => [`${v} votes`, 'Votes']}
            labelFormatter={(_, p) => p?.[0]?.payload?.name ?? ''}
          />
          <Bar dataKey="votes" radius={[0, 4, 4, 0]} barSize={26}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.isWinner ? GOLD : GREEN} />
            ))}
            <LabelList dataKey="votes" position="right" style={{ fontSize: 12, fill: '#3f4343' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ResultsTable({ position }: { position: PositionResult }) {
  return (
    <div className="overflow-hidden rounded-lg border border-charcoal-200">
      <table className="w-full text-sm">
        <thead className="bg-charcoal-50 text-left text-xs uppercase tracking-wide text-charcoal-500">
          <tr>
            <th className="px-4 py-2.5 font-medium">Candidate</th>
            <th className="px-4 py-2.5 text-right font-medium">Votes</th>
            <th className="px-4 py-2.5 text-right font-medium">Share</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-charcoal-100">
          {position.candidates.map((c) => (
            <tr key={c.candidateId} className={c.isWinner ? 'bg-gold-50/60' : ''}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-amr-navy text-xs font-semibold text-white">
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initials(c.fullName)
                    )}
                  </div>
                  <span className="font-medium text-charcoal-800">{c.fullName}</span>
                  {c.isWinner && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-700">
                      <Trophy size={12} /> Winner
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-charcoal-900">
                {c.votes}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-charcoal-600">
                {c.percentage}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
