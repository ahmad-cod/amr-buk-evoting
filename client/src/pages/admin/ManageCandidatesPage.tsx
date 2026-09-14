import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Plus,
  Users,
  Check,
  X,
  Pencil,
  Trash2,
  ShieldQuestion,
} from 'lucide-react';
import { adminApi, qk } from '@/services/queries';
import { useToast } from '@/store/ToastContext';
import { FullPageSpinner } from '@/components/ui/LoadingSpinner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { ImageUploader } from '@/components/ImageUploader';
import { CANDIDATE_STATUS_META, initials, positionId } from '@/lib/utils';
import { ApiError, apiErrorMessage } from '@/lib/api';
import type { Candidate, CandidateStatus, Position } from '@/types';

const schema = z.object({
  positionId: z.string().min(1, 'Select a position'),
  fullName: z.string().min(2, 'Full name is required'),
  registrationNumber: z.string().min(4, 'Registration number is required'),
  department: z.string().optional(),
  level: z.string().optional(),
  campaignSlogan: z.string().optional(),
  manifesto: z.string().optional(),
  bio: z.string().optional(),
});
type Form = z.infer<typeof schema>;

export function ManageCandidatesPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [deleting, setDeleting] = useState<Candidate | null>(null);

  const { data: election, isLoading: le } = useQuery({
    queryKey: qk.adminElection(id),
    queryFn: () => adminApi.getElection(id),
    enabled: !!id,
  });

  const { data: candidates, isLoading: lc } = useQuery({
    queryKey: qk.candidates(id, filter),
    queryFn: () => adminApi.listCandidates(id, filter || undefined),
    enabled: !!id,
  });

  const positions = election?.positions ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ['candidates', id] });

  const approve = useMutation({
    mutationFn: (cid: string) => adminApi.approveCandidate(cid),
    onSuccess: () => {
      invalidate();
      toast.success('Candidate approved.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });
  const reject = useMutation({
    mutationFn: (cid: string) => adminApi.rejectCandidate(cid),
    onSuccess: () => {
      invalidate();
      toast.success('Candidate rejected.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });
  const del = useMutation({
    mutationFn: (cid: string) => adminApi.deleteCandidate(cid),
    onSuccess: () => {
      invalidate();
      toast.success('Candidate removed.');
      setDeleting(null);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Delete failed'),
  });

  const grouped = useMemo(() => {
    const list = candidates ?? [];
    return positions
      .slice()
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((pos) => ({
        position: pos,
        items: list.filter((c) => positionId(c.positionId) === pos.id),
      }));
  }, [candidates, positions]);

  if (le) return <FullPageSpinner />;

  const FILTERS = [
    { key: '', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
  ];

  return (
    <div>
      <Link
        to="/admin/elections"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-charcoal-500 hover:text-charcoal-800"
      >
        <ArrowLeft size={16} /> Elections
      </Link>

      <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl font-bold text-charcoal-900">Candidates</h2>
          <p className="mt-1 text-sm text-charcoal-500">{election?.election.title}</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          disabled={positions.length === 0}
        >
          <Plus size={18} /> Add candidate
        </button>
      </div>

      {positions.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={ShieldQuestion}
            title="Add positions first"
            description="You need at least one position before adding candidates."
            action={
              <Link to={`/admin/elections/${id}/positions`} className="btn-primary">
                Manage positions
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  filter === f.key
                    ? 'bg-amr-navy text-white'
                    : 'border border-charcoal-200 bg-white text-charcoal-600 hover:bg-charcoal-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-8">
            {lc ? (
              <FullPageSpinner />
            ) : (
              grouped.map(({ position, items }) => (
                <section key={position.id}>
                  <div className="flex items-baseline justify-between border-b border-charcoal-200 pb-2">
                    <h3 className="font-display text-lg font-semibold text-charcoal-900">
                      {position.title}
                    </h3>
                    <span className="text-sm text-charcoal-400">{items.length} candidates</span>
                  </div>

                  {items.length === 0 ? (
                    <p className="mt-3 rounded-md border border-dashed border-charcoal-300 bg-white px-4 py-5 text-center text-sm text-charcoal-400">
                      No candidates for this position{filter ? ` (${filter})` : ''}.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {items.map((c) => (
                        <CandidateRow
                          key={c.id}
                          candidate={c}
                          onEdit={() => {
                            setEditing(c);
                            setModalOpen(true);
                          }}
                          onApprove={() => approve.mutate(c.id)}
                          onReject={() => reject.mutate(c.id)}
                          onDelete={() => setDeleting(c)}
                          busy={approve.isPending || reject.isPending}
                        />
                      ))}
                    </div>
                  )}
                </section>
              ))
            )}
          </div>
        </>
      )}

      {modalOpen && (
        <CandidateFormModal
          electionId={id}
          positions={positions}
          candidate={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            invalidate();
            setModalOpen(false);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Remove candidate"
        destructive
        message={
          <>
            Remove <strong>{deleting?.fullName}</strong> from this election? This cannot be undone.
          </>
        }
        confirmLabel="Remove"
        loading={del.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
    </div>
  );
}

function CandidateRow({
  candidate,
  onEdit,
  onApprove,
  onReject,
  onDelete,
  busy,
}: {
  candidate: Candidate;
  onEdit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const meta = CANDIDATE_STATUS_META[candidate.status as CandidateStatus];
  return (
    <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-amr-navy">
          {candidate.imageUrl ? (
            <img src={candidate.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-white">
              {initials(candidate.fullName)}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-charcoal-900">{candidate.fullName}</p>
            <StatusBadge label={meta.label} tone={meta.tone} />
          </div>
          <p className="text-xs text-charcoal-500">
            {candidate.registrationNumber && <span className="font-mono mr-1">{candidate.registrationNumber}</span>}
            {candidate.programme || candidate.department ? `${candidate.programme || candidate.department}` : ''}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {candidate.status !== 'approved' && (
          <button
            className="btn-ghost px-2.5 py-1.5 text-amr-navy hover:bg-amr-pale-blue font-medium"
            onClick={onApprove}
            disabled={busy}
            title="Approve"
          >
            <Check size={16} /> Approve
          </button>
        )}
        {candidate.status !== 'rejected' && (
          <button
            className="btn-ghost px-2.5 py-1.5 text-charcoal-600"
            onClick={onReject}
            disabled={busy}
            title="Reject"
          >
            <X size={16} /> Reject
          </button>
        )}
        <button className="btn-ghost px-2.5 py-1.5" onClick={onEdit} aria-label="Edit candidate">
          <Pencil size={16} />
        </button>
        <button
          className="btn-ghost px-2.5 py-1.5 text-red-600 hover:bg-red-50"
          onClick={onDelete}
          aria-label="Delete candidate"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

function CandidateFormModal({
  electionId,
  positions,
  candidate,
  onClose,
  onSaved,
}: {
  electionId: string;
  positions: Position[];
  candidate: Candidate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const isEdit = !!candidate;
  const [savedCandidate, setSavedCandidate] = useState<Candidate | null>(candidate);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      positionId: candidate ? positionId(candidate.positionId) : positions[0]?.id || '',
      fullName: candidate?.fullName || '',
      registrationNumber: candidate?.registrationNumber || '',
      department: candidate?.department || '',
      level: candidate?.level || '',
      campaignSlogan: candidate?.campaignSlogan || '',
      manifesto: candidate?.manifesto || '',
      bio: candidate?.bio || '',
    },
  });

  const save = useMutation({
    mutationFn: (values: Form) =>
      isEdit
        ? adminApi.updateCandidate(candidate!.id, values)
        : adminApi.createCandidate(electionId, values),
    onSuccess: (c) => {
      setSavedCandidate(c as Candidate);
      toast.success(isEdit ? 'Candidate updated.' : 'Candidate added.');
      if (isEdit) onSaved();
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Save failed')),
  });

  const upload = useMutation({
    mutationFn: (file: File) => adminApi.uploadCandidateImage(savedCandidate!.id, file),
    onSuccess: (res) => {
      setSavedCandidate((prev) => (prev ? { ...prev, imageUrl: res.imageUrl } : prev));
      qc.invalidateQueries({ queryKey: ['candidates', electionId] });
      toast.success('Photo uploaded.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Upload failed'),
  });

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit candidate' : 'Add candidate'} size="lg">
      <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="cpos" className="label">
              Position
            </label>
            <select id="cpos" className="input" {...register('positionId')}>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            {errors.positionId && <p className="field-error">{errors.positionId.message}</p>}
          </div>

          <div>
            <label htmlFor="cname" className="label">
              Full name
            </label>
            <input id="cname" className="input" {...register('fullName')} />
            {errors.fullName && <p className="field-error">{errors.fullName.message}</p>}
          </div>
          <div>
            <label htmlFor="creg" className="label">
              Registration number
            </label>
            <input id="creg" className="input uppercase" {...register('registrationNumber')} />
            {errors.registrationNumber && (
              <p className="field-error">{errors.registrationNumber.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="cdept" className="label">
              Department
            </label>
            <input id="cdept" className="input" {...register('department')} />
          </div>
          <div>
            <label htmlFor="clevel" className="label">
              Level
            </label>
            <input id="clevel" className="input" placeholder="e.g. Level 3" {...register('level')} />
          </div>
        </div>

        <div>
          <label htmlFor="cslogan" className="label">
            Campaign slogan
          </label>
          <input id="cslogan" className="input" {...register('campaignSlogan')} />
        </div>
        <div>
          <label htmlFor="cmanifesto" className="label">
            Manifesto
          </label>
          <textarea id="cmanifesto" rows={4} className="input" {...register('manifesto')} />
        </div>

        {savedCandidate ? (
          <div className="rounded-md border border-charcoal-200 bg-charcoal-50 p-4">
            <p className="mb-2 text-sm font-medium text-charcoal-700">Candidate photo</p>
            <ImageUploader
              currentUrl={savedCandidate.imageUrl}
              onUpload={(file) => upload.mutate(file)}
              uploading={upload.isPending}
            />
          </div>
        ) : (
          <p className="rounded-md border border-charcoal-200 bg-charcoal-50 p-3 text-xs text-charcoal-500">
            Save the candidate first, then you can upload a photo.
          </p>
        )}

        <div className="flex justify-end gap-3 border-t border-charcoal-100 pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {savedCandidate ? 'Done' : 'Cancel'}
          </button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? (
              <LoadingSpinner size={16} className="text-white" />
            ) : isEdit ? (
              'Save changes'
            ) : savedCandidate ? (
              'Update details'
            ) : (
              'Save candidate'
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
