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

  const { data: history } = useQuery({
    queryKey: qk.importHistory(),
    queryFn: () => adminApi.importHistory(),
  });

  const previewMut = useMutation({
    mutationFn: (f: File) => adminApi.previewImport(f),
    onSuccess: (res) => {
      setPreview(res);
      setStage('preview');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not read file'),
  });

  const importMut = useMutation({
    mutationFn: () => adminApi.runImport(file!, activate),
    onSuccess: (res) => {
      setOutcome(res);
      setStage('done');
      qc.invalidateQueries({ queryKey: qk.importHistory() });
      qc.invalidateQueries({ queryKey: qk.studentStats() });
      toast.success('Import complete.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Import failed'),
  });

  const pick = (f?: File) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.csv')) {
      toast.error('Please upload a .csv file.');
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
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <div>
        <h2 className="font-display text-2xl font-bold text-charcoal-900">Voter roster import</h2>
        <p className="mt-1 text-sm text-charcoal-500">
          Import the AMR Club BUK accredited voter register from a CSV file. Only imported members
          may register and vote.
        </p>
      </div>

      {/* Stepper */}
      <ol className="mt-6 flex items-center gap-2 text-xs font-medium">
        <StepPill n={1} label="Select file" active={stage === 'select'} done={stage !== 'select'} />
        <span className="h-px w-6 bg-charcoal-200" />
        <StepPill n={2} label="Preview" active={stage === 'preview'} done={stage === 'done'} />
        <span className="h-px w-6 bg-charcoal-200" />
        <StepPill n={3} label="Import" active={stage === 'done'} done={stage === 'done'} />
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
                {previewMut.isPending ? 'Reading file…' : 'Click to select a CSV file'}
              </span>
              <span className="mt-1 text-sm text-charcoal-500">
                Expected columns: Serial Number, Full Name, Email Address, Gender, Faculty, Programme
              </span>
            </button>
          </div>
        )}

        {stage === 'preview' && preview && (
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={20} className="text-amr-navy" />
                <div>
                  <p className="font-medium text-charcoal-900">{file?.name}</p>
                  <p className="text-xs text-charcoal-500">
                    {preview.totalRows} data rows detected
                  </p>
                </div>
              </div>
              <button className="btn-ghost px-2 py-1.5 text-charcoal-500" onClick={reset} aria-label="Cancel">
                <X size={18} />
              </button>
            </div>

            {/* Column mapping */}
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-charcoal-700">Detected column mapping</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {Object.entries(preview.mapping).map(([field, col]) => (
                  <div
                    key={field}
                    className="flex items-center justify-between rounded-md border border-charcoal-200 bg-charcoal-50 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-charcoal-700">{field}</span>
                    {col ? (
                      <span className="inline-flex items-center gap-1 text-amr-teal">
                        <CheckCircle2 size={14} /> {col}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-gold-600">
                        <AlertTriangle size={14} /> not found
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Sample rows */}
            {preview.sampleRows.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-charcoal-700">Sample rows</h3>
                <div className="mt-2 overflow-x-auto rounded-lg border border-charcoal-200">
                  <table className="w-full text-xs">
                    <thead className="bg-charcoal-50 text-left text-charcoal-500">
                      <tr>
                        {preview.headers.map((h) => (
                          <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-charcoal-100">
                      {preview.sampleRows.slice(0, 5).map((row, i) => (
                        <tr key={i}>
                          {preview.headers.map((h) => (
                            <td key={h} className="whitespace-nowrap px-3 py-2 text-charcoal-700">
                              {row[h]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <label className="mt-5 flex items-start gap-3 rounded-md border border-amr-teal/30 bg-amr-pale-blue p-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-charcoal-300 text-amr-navy focus:ring-amr-navy"
                checked={activate}
                onChange={(e) => setActivate(e.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium text-amr-navy">
                  Mark imported voters as eligible immediately
                </span>
                <span className="block text-xs text-charcoal-600">
                  Uncheck to import records without granting voting eligibility yet.
                </span>
              </span>
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <button className="btn-secondary" onClick={reset} disabled={importMut.isPending}>
                Choose different file
              </button>
              <button className="btn-primary" onClick={() => importMut.mutate()} disabled={importMut.isPending}>
                {importMut.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Importing…
                  </>
                ) : (
                  <>
                    Import {preview.totalRows} voters <ArrowRight size={16} />
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
                  Import complete
                </h3>
                <p className="text-sm text-charcoal-500">
                  Processed {outcome.totalRows} rows from {file?.name}.
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <OutcomeStat label="Inserted" value={outcome.inserted} tone="navy" />
              <OutcomeStat label="Updated" value={outcome.updated} tone="charcoal" />
              <OutcomeStat label="Skipped" value={outcome.skipped} tone="charcoal" />
              <OutcomeStat label="Invalid" value={outcome.invalid} tone={outcome.invalid > 0 ? 'gold' : 'charcoal'} />
            </div>

            {outcome.errors.length > 0 && (
              <div className="mt-5">
                <h4 className="flex items-center gap-1.5 text-sm font-semibold text-gold-700">
                  <AlertTriangle size={15} /> Rows with issues ({outcome.errors.length})
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
                Import another file
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
                          {h.filename || 'import.csv'}
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
