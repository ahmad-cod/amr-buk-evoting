import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Upload,
  FileText,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowRight,
  Loader2,
  History,
  Database,
} from 'lucide-react';
import { adminApi, qk } from '@/services/queries';
import { useToast } from '@/store/ToastContext';
import { formatDateTime } from '@/lib/utils';
import { ApiError } from '@/lib/api';
import type { ImportOutcome, ImportPreview } from '@/types';

type Stage = 'select' | 'preview' | 'done';

export function StudentImportPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>('select');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [activate, setActivate] = useState(true);
  const [electionId, setElectionId] = useState<string>('');
  const [excludedRowNumbers, setExcludedRowNumbers] = useState<number[]>([]);

  const { data: electionsData } = useQuery({
    queryKey: ['admin-elections', 'active-scheduled'],
    queryFn: () => adminApi.listElections(),
  });

  const elections = electionsData?.data || [];

  // Automatically select the first active/scheduled election if not set
  if (!electionId && elections.length > 0) {
    setElectionId(elections[0].id);
  }

  const { data: history } = useQuery({
    queryKey: qk.importHistory(electionId || undefined),
    queryFn: () => adminApi.importHistory(electionId || undefined),
  });

  const previewMut = useMutation({
    mutationFn: (f: File) => adminApi.previewImport(f, electionId || undefined),
    onSuccess: (res) => {
      setPreview(res);
      setExcludedRowNumbers([]);
      setStage('preview');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not read file'),
  });

  const importMut = useMutation({
    mutationFn: () => {
      // If there are excluded row numbers, calculate confirmed row numbers
      const confirmedRows =
        preview?.importableRows
          ? preview.importableRows
              .map((r) => r.rowNum)
              .filter((r) => !excludedRowNumbers.includes(r))
          : undefined;

      return adminApi.runImport(file!, activate, electionId || undefined, confirmedRows);
    },
    onSuccess: (res) => {
      setOutcome(res);
      setStage('done');
      qc.invalidateQueries({ queryKey: ['import-history'] });
      qc.invalidateQueries({ queryKey: ['student-stats'] });
      qc.invalidateQueries({ queryKey: ['students'] });
      toast.success('Roster import committed successfully.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Import failed'),
  });

  const pick = (f?: File) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.csv') && !f.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('Please upload a .csv or .xlsx file.');
      return;
    }
    setFile(f);
    previewMut.mutate(f);
  };

  const reset = () => {
    setStage('select');
    setFile(null);
    setPreview(null);
    setOutcome(null);
    setExcludedRowNumbers([]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const toggleExcludeRow = (rowNum: number) => {
    setExcludedRowNumbers((prev) =>
      prev.includes(rowNum) ? prev.filter((r) => r !== rowNum) : [...prev, rowNum],
    );
  };

  return (
    <div>
      <div>
        <h2 className="font-display text-2xl font-bold text-charcoal-900">Voter Roster Import</h2>
        <p className="mt-1 text-sm text-charcoal-500">
          Import the AMR Club BUK accredited voter register. The approved roster is the authoritative source of voter eligibility.
        </p>
      </div>

      {/* Election Selector */}
      {stage !== 'done' && (
        <div className="mt-4 flex flex-col gap-1.5 sm:flex-row sm:items-center">
          <label htmlFor="election-select" className="text-xs font-semibold uppercase tracking-wider text-charcoal-600">
            Target Election:
          </label>
          <select
            id="election-select"
            className="input max-w-sm text-sm"
            value={electionId}
            onChange={(e) => setElectionId(e.target.value)}
            disabled={stage === 'preview' && previewMut.isPending}
          >
            {elections.map((el) => (
              <option key={el.id} value={el.id}>
                {el.title} ({el.status})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Stepper */}
      <ol className="mt-6 flex items-center gap-2 text-xs font-medium">
        <StepPill n={1} label="Select Roster" active={stage === 'select'} done={stage !== 'select'} />
        <span className="h-px w-6 bg-charcoal-200" />
        <StepPill n={2} label="Validate & Preview" active={stage === 'preview'} done={stage === 'done'} />
        <span className="h-px w-6 bg-charcoal-200" />
        <StepPill n={3} label="Transactional Commit" active={stage === 'done'} done={stage === 'done'} />
      </ol>

      <div className="mt-6">
        {stage === 'select' && (
          <div className="card p-8">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => pick(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={previewMut.isPending}
              className="flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-charcoal-300 bg-charcoal-50 px-6 py-12 text-center transition-colors hover:border-amr-teal hover:bg-amr-pale-blue"
            >
              {previewMut.isPending ? (
                <Loader2 size={36} className="animate-spin text-amr-teal" />
              ) : (
                <Upload size={36} className="text-charcoal-400" />
              )}
              <span className="mt-4 font-medium text-charcoal-800">
                {previewMut.isPending ? 'Validating Roster…' : 'Click to select the AMR Accredited Roster CSV'}
              </span>
              <span className="mt-1 text-sm text-charcoal-500">
                Expected columns: S/N, Full name, Gender, Email Address, Faculty, Program of Study
              </span>
            </button>
          </div>
        )}

        {stage === 'preview' && preview && (
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={22} className="text-amr-navy" />
                <div>
                  <p className="font-medium text-charcoal-900">{file?.name}</p>
                  <p className="text-xs text-charcoal-500">
                    Authoritative Roster Validation Report
                  </p>
                </div>
              </div>
              <button className="btn-ghost px-2 py-1.5 text-charcoal-500" onClick={reset} aria-label="Cancel">
                <X size={18} />
              </button>
            </div>

            {/* Roster Import Preview Metric Cards */}
            <div className="mt-6">
              <h3 className="font-display text-base font-bold text-charcoal-900">
                Roster Import Preview
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard label="Total rows detected" value={preview.totalRows} />
                <MetricCard label="Populated rows" value={preview.populatedRows} />
                <MetricCard label="Blank rows" value={preview.blankRows} />
                <MetricCard label="Valid emails" value={preview.validEmails} tone="green" />
                <MetricCard label="Invalid emails" value={preview.invalidEmails} tone={preview.invalidEmails > 0 ? 'red' : 'charcoal'} />
                <MetricCard label="Duplicate emails" value={preview.duplicateEmails} tone={preview.duplicateEmails > 0 ? 'amber' : 'charcoal'} />
                <MetricCard label="Duplicate serial numbers" value={preview.duplicateSerials} tone={preview.duplicateSerials > 0 ? 'amber' : 'charcoal'} />
                <MetricCard label="Importable records" value={preview.importableRecords} tone="navy" />
              </div>
              <div className="mt-2 text-right text-xs font-medium text-charcoal-600">
                Records requiring administrative review: <span className="font-bold text-amber-700">{preview.recordsRequiringReview}</span>
              </div>
            </div>

            {/* Conflicts Requiring Administrative Resolution */}
            {preview.conflicts.length > 0 && (
              <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
                <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
                  <AlertTriangle size={18} className="text-amber-700" />
                  Conflicts Requiring Administrative Resolution ({preview.conflicts.length})
                </div>
                <p className="mt-1 text-xs text-amber-800">
                  Per election security invariants, ambiguous identity records and shared emails are not automatically merged. Administrator confirmation is required.
                </p>

                <div className="mt-3 space-y-3">
                  {preview.conflicts.map((c, idx) => (
                    <div key={idx} className="rounded-md border border-amber-200 bg-white p-3 text-xs">
                      <div className="flex items-center justify-between font-semibold text-charcoal-900">
                        <span>
                          {c.type === 'DUPLICATE_EMAIL' ? 'Duplicate Email Conflict' : 'Duplicate Serial Number'}
                        </span>
                        <span className="font-mono text-amr-navy">{c.email || c.serialNumber}</span>
                      </div>
                      <p className="mt-1 text-charcoal-600">{c.actionRequired}</p>
                      <div className="mt-2 space-y-1">
                        {c.records.map((r) => (
                          <div key={r.row} className="flex items-center justify-between bg-charcoal-50 p-2 rounded">
                            <span>
                              <strong>Row {r.row}:</strong> S/N {r.serialNumber || '—'} — {r.fullName} ({r.email})
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleExcludeRow(r.row)}
                              className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                                excludedRowNumbers.includes(r.row)
                                  ? 'bg-red-50 text-red-700 border-red-200'
                                  : 'bg-white text-charcoal-700 border-charcoal-300 hover:bg-charcoal-100'
                              }`}
                            >
                              {excludedRowNumbers.includes(r.row) ? 'Excluded from Import' : 'Exclude Record'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Column mapping */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-charcoal-700">Detected column mapping</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {Object.entries(preview.mapping).map(([field, col]) => (
                  <div
                    key={field}
                    className="flex items-center justify-between rounded-md border border-charcoal-200 bg-charcoal-50 px-3 py-1.5 text-xs"
                  >
                    <span className="font-medium text-charcoal-700">{field}</span>
                    {col ? (
                      <span className="inline-flex items-center gap-1 text-amr-teal">
                        <CheckCircle2 size={13} /> {col}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-600">
                        <AlertTriangle size={13} /> missing
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <label className="mt-5 flex items-start gap-3 rounded-md border border-amr-teal/30 bg-amr-pale-blue p-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-charcoal-300 text-amr-navy focus:ring-amr-navy"
                checked={activate}
                onChange={(e) => setActivate(e.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium text-amr-navy">
                  Mark valid imported voters as accredited (PENDING verification) immediately
                </span>
                <span className="block text-xs text-charcoal-600">
                  Accredited voters will be eligible to receive email verification credentials.
                </span>
              </span>
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <button className="btn-secondary" onClick={reset} disabled={importMut.isPending}>
                Choose different file
              </button>
              <button
                className="btn-primary"
                onClick={() => importMut.mutate()}
                disabled={importMut.isPending || preview.importableRecords === 0}
              >
                {importMut.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Committing Transaction…
                  </>
                ) : (
                  <>
                    Commit {preview.importableRecords - excludedRowNumbers.length} Valid Records <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {stage === 'done' && outcome && (
          <div className="card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amr-pale-blue">
                <CheckCircle2 size={24} className="text-amr-teal" />
              </div>
              <div>
                <h3 className="font-display text-lg font-semibold text-charcoal-900">
                  Roster Import Committed
                </h3>
                <p className="text-sm text-charcoal-500">
                  Processed {outcome.totalRows} rows from {file?.name}. Database transaction committed.
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <OutcomeStat label="Inserted" value={outcome.inserted} tone="navy" />
              <OutcomeStat label="Updated" value={outcome.updated} tone="charcoal" />
              <OutcomeStat label="Skipped" value={outcome.skipped} tone="charcoal" />
              <OutcomeStat label="Invalid / Unresolved" value={outcome.invalid} tone={outcome.invalid > 0 ? 'gold' : 'charcoal'} />
            </div>

            {outcome.errors.length > 0 && (
              <div className="mt-5">
                <h4 className="flex items-center gap-1.5 text-sm font-semibold text-gold-700">
                  <AlertTriangle size={15} /> Records Requiring Review ({outcome.errors.length})
                </h4>
                <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-charcoal-200">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-charcoal-50 text-left text-charcoal-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Row</th>
                        <th className="px-3 py-2 font-medium">Identifier / Email</th>
                        <th className="px-3 py-2 font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-charcoal-100">
                      {outcome.errors.map((err, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 tabular-nums text-charcoal-600">{err.row}</td>
                          <td className="px-3 py-2 font-mono text-charcoal-600">
                            {err.identifier || err.registrationNumber || '—'}
                          </td>
                          <td className="px-3 py-2 text-charcoal-700">{err.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button className="btn-primary" onClick={reset}>
                Import Another Roster
              </button>
            </div>
          </div>
        )}
      </div>

      {/* History */}
      <div className="mt-10">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-charcoal-900">
          <History size={18} /> Import history
        </h3>
        <div className="mt-3">
          {!history || history.length === 0 ? (
            <div className="card flex items-center gap-3 p-5 text-sm text-charcoal-500">
              <Database size={18} className="text-charcoal-400" /> No imports yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-charcoal-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-charcoal-200 bg-charcoal-50 text-left text-xs uppercase tracking-wide text-charcoal-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">File</th>
                    <th className="px-4 py-3 text-right font-medium">Rows</th>
                    <th className="px-4 py-3 text-right font-medium">Inserted</th>
                    <th className="px-4 py-3 text-right font-medium">Updated</th>
                    <th className="px-4 py-3 text-right font-medium">Invalid</th>
                    <th className="px-4 py-3 font-medium">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-charcoal-100">
                  {history.map((h) => (
                    <tr key={h.historyId}>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-charcoal-800">
                          <FileSpreadsheet size={15} className="text-charcoal-400" />
                          {h.fileName || 'import.csv'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-charcoal-600">{h.totalRows}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-amr-navy font-semibold">{h.inserted}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-charcoal-600">{h.updated}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-charcoal-600">{h.invalid}</td>
                      <td className="px-4 py-3 text-xs text-charcoal-500">
                        {h.createdAt ? formatDateTime(h.createdAt) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepPill({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
          done ? 'bg-amr-teal text-white' : active ? 'bg-amr-navy text-white' : 'bg-charcoal-200 text-charcoal-600'
        }`}
      >
        {done ? <CheckCircle2 size={14} /> : n}
      </span>
      <span className={active || done ? 'text-charcoal-800' : 'text-charcoal-400'}>{label}</span>
    </li>
  );
}

function OutcomeStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'green' | 'navy' | 'gold' | 'charcoal';
}) {
  const toneClass =
    tone === 'navy' || tone === 'green'
      ? 'text-amr-navy'
      : tone === 'gold'
        ? 'text-gold-600'
        : 'text-charcoal-800';
  return (
    <div className="rounded-lg border border-charcoal-200 bg-charcoal-50 p-3 text-center">
      <p className={`font-display text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      <p className="text-xs text-charcoal-500">{label}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = 'charcoal',
}: {
  label: string;
  value: number;
  tone?: 'green' | 'navy' | 'red' | 'amber' | 'charcoal';
}) {
  const toneClass =
    tone === 'navy'
      ? 'text-amr-navy'
      : tone === 'green'
        ? 'text-emerald-700'
        : tone === 'red'
          ? 'text-red-700'
          : tone === 'amber'
            ? 'text-amber-700'
            : 'text-charcoal-800';

  return (
    <div className="rounded-lg border border-charcoal-200 bg-charcoal-50 p-3 text-center">
      <p className={`font-display text-xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      <p className="text-[11px] text-charcoal-500 mt-0.5">{label}</p>
    </div>
  );
}

