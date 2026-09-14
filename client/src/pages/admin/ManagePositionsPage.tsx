import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Plus,
  ListChecks,
  Pencil,
  Trash2,
  Sparkles,
  GripVertical,
} from 'lucide-react';
import { adminApi, qk } from '@/services/queries';
import { useToast } from '@/store/ToastContext';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ApiError } from '@/lib/api';
import type { Position } from '@/types';

const schema = z.object({
  title: z.string().min(2, 'Position title is required'),
  description: z.string().optional(),
  maxVotesPerVoter: z.coerce.number().int().min(1).max(20),
  maxCandidates: z.coerce.number().int().min(1).max(100),
});
type Form = z.infer<typeof schema>;

export function ManagePositionsPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Position | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Position | null>(null);

  const { data: election } = useQuery({
    queryKey: qk.adminElection(id),
    queryFn: () => adminApi.getElection(id),
    enabled: !!id,
  });

  const { data: positions, isLoading } = useQuery({
    queryKey: qk.positions(id),
    queryFn: () => adminApi.listPositions(id),
    enabled: !!id,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: qk.positions(id) });

  const seed = useMutation({
    mutationFn: () => adminApi.seedPositions(id),
    onSuccess: () => {
      invalidate();
      toast.success('Default positions added.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed to seed positions'),
  });

  const del = useMutation({
    mutationFn: (positionId: string) => adminApi.deletePosition(positionId),
    onSuccess: () => {
      invalidate();
      toast.success('Position removed.');
      setDeleting(null);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Delete failed'),
  });

  const list = positions ?? [];

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
          <h2 className="font-display text-2xl font-bold text-charcoal-900">Positions</h2>
          <p className="mt-1 text-sm text-charcoal-500">
            {election?.election.title} · define the positions being contested.
          </p>
        </div>
        <div className="flex gap-2">
          {list.length === 0 && (
            <button className="btn-secondary" onClick={() => seed.mutate()} disabled={seed.isPending}>
              {seed.isPending ? <LoadingSpinner size={16} /> : <><Sparkles size={16} /> Add defaults</>}
            </button>
          )}
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={18} /> Add position
          </button>
        </div>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="card p-4">
            <SkeletonRows rows={5} />
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="No positions yet"
            description="Add the official AMR positions or create your own."
            action={
              <button className="btn-primary" onClick={() => seed.mutate()}>
                <Sparkles size={18} /> Add default positions
              </button>
            }
          />
        ) : (
          <div className="space-y-2">
            {list
              .slice()
              .sort((a, b) => a.displayOrder - b.displayOrder)
              .map((p) => (
                <div key={p.id} className="card flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <GripVertical size={18} className="text-charcoal-300" />
                    <div>
                      <p className="font-medium text-charcoal-900">{p.title}</p>
                      <p className="text-xs text-charcoal-500">
                        {p.description ? `${p.description} · ` : ''}
                        Choose {p.maxVotesPerVoter} · up to {p.maxCandidates} candidates
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button className="btn-ghost px-2.5 py-1.5" onClick={() => setEditing(p)} aria-label="Edit position">
                      <Pencil size={16} />
                    </button>
                    <button
                      className="btn-ghost px-2.5 py-1.5 text-red-600 hover:bg-red-50"
                      onClick={() => setDeleting(p)}
                      aria-label="Delete position"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {list.length > 0 && (
        <div className="mt-6 flex justify-end">
          <Link to={`/admin/elections/${id}/candidates`} className="btn-primary">
            Manage candidates
          </Link>
        </div>
      )}

      {(creating || editing) && (
        <PositionFormModal
          electionId={id}
          position={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            invalidate();
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Remove position"
        destructive
        message={
          <>
            Remove <strong>{deleting?.title}</strong>? This is only possible if no candidates are
            assigned to it.
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

function PositionFormModal({
  electionId,
  position,
  onClose,
  onSaved,
}: {
  electionId: string;
  position: Position | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isEdit = !!position;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: position?.title || '',
      description: position?.description || '',
      maxVotesPerVoter: position?.maxVotesPerVoter || 1,
      maxCandidates: position?.maxCandidates || 10,
    },
  });

  const save = useMutation({
    mutationFn: (values: Form) =>
      isEdit
        ? adminApi.updatePosition(position!.id, values)
        : adminApi.createPosition(electionId, values),
    onSuccess: () => {
      toast.success(isEdit ? 'Position updated.' : 'Position added.');
      onSaved();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Save failed'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Edit position' : 'Add position'}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="position-form" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? <LoadingSpinner size={16} className="text-white" /> : 'Save'}
          </button>
        </>
      }
    >
      <form id="position-form" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="space-y-4">
        <div>
          <label htmlFor="ptitle" className="label">
            Title
          </label>
          <input id="ptitle" className="input" placeholder="e.g. President" {...register('title')} />
          {errors.title && <p className="field-error">{errors.title.message}</p>}
        </div>
        <div>
          <label htmlFor="pdesc" className="label">
            Description (optional)
          </label>
          <input id="pdesc" className="input" {...register('description')} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="pmax" className="label">
              Votes per voter
            </label>
            <input id="pmax" type="number" min={1} className="input" {...register('maxVotesPerVoter')} />
            {errors.maxVotesPerVoter && (
              <p className="field-error">{errors.maxVotesPerVoter.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="pcand" className="label">
              Max candidates
            </label>
            <input id="pcand" type="number" min={1} className="input" {...register('maxCandidates')} />
          </div>
        </div>
      </form>
    </Modal>
  );
}
