import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Info } from 'lucide-react';
import { adminApi, qk } from '@/services/queries';
import { useToast } from '@/store/ToastContext';
import { FullPageSpinner } from '@/components/ui/LoadingSpinner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ApiError } from '@/lib/api';

const schema = z
  .object({
    title: z.string().min(3, 'Title is required'),
    description: z.string().optional(),
    startDateTime: z.string().min(1, 'Start date is required'),
    endDateTime: z.string().min(1, 'End date is required'),
    instructions: z.string().optional(),
    registrationEnabled: z.boolean(),
    votingEnabled: z.boolean(),
    liveResultsEnabled: z.boolean(),
    requireCandidateApproval: z.boolean(),
    seedDefaultPositions: z.boolean().optional(),
  })
  .refine((d) => new Date(d.endDateTime) > new Date(d.startDateTime), {
    message: 'End time must be after start time',
    path: ['endDateTime'],
  });

type Form = z.infer<typeof schema>;

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
function toLocalInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

export function ElectionFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const isEdit = mode === 'edit';

  const { data: existing, isLoading } = useQuery({
    queryKey: qk.adminElection(id),
    queryFn: () => adminApi.getElection(id),
    enabled: isEdit && !!id,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      registrationEnabled: true,
      votingEnabled: true,
      liveResultsEnabled: false,
      requireCandidateApproval: true,
      seedDefaultPositions: true,
    },
  });

  useEffect(() => {
    if (existing?.election) {
      const e = existing.election;
      reset({
        title: e.title,
        description: e.description || '',
        startDateTime: toLocalInput(e.startDateTime),
        endDateTime: toLocalInput(e.endDateTime),
        instructions: e.instructions || '',
        registrationEnabled: e.registrationEnabled,
        votingEnabled: e.votingEnabled,
        liveResultsEnabled: e.liveResultsEnabled,
        requireCandidateApproval: e.requireCandidateApproval,
      });
    }
  }, [existing, reset]);

  const save = useMutation({
    mutationFn: (values: Form) => {
      const body = {
        title: values.title,
        description: values.description,
        startDateTime: new Date(values.startDateTime).toISOString(),
        endDateTime: new Date(values.endDateTime).toISOString(),
        instructions: values.instructions,
        registrationEnabled: values.registrationEnabled,
        votingEnabled: values.votingEnabled,
        liveResultsEnabled: values.liveResultsEnabled,
        requireCandidateApproval: values.requireCandidateApproval,
        ...(isEdit ? {} : { seedDefaultPositions: values.seedDefaultPositions }),
      };
      return isEdit ? adminApi.updateElection(id, body) : adminApi.createElection(body);
    },
    onSuccess: (election) => {
      qc.invalidateQueries({ queryKey: ['admin-elections'] });
      qc.invalidateQueries({ queryKey: qk.adminElection(id) });
      toast.success(isEdit ? 'Election updated.' : 'Election created.');
      navigate(`/admin/elections/${(election as { id: string }).id}/positions`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Save failed'),
  });

  if (isEdit && isLoading) return <FullPageSpinner />;

  const toggles: Array<{ name: keyof Form; label: string; help: string }> = [
    { name: 'registrationEnabled', label: 'Allow voter registration', help: 'Students can register accounts for this election.' },
    { name: 'votingEnabled', label: 'Allow voting', help: 'Master switch — voting is possible when the election is active.' },
    { name: 'liveResultsEnabled', label: 'Show live results', help: 'Publish provisional results while voting is open.' },
    { name: 'requireCandidateApproval', label: 'Require candidate approval', help: 'Candidates must be approved before appearing on the ballot.' },
  ];

  return (
    <div>
      <Link
        to={isEdit ? `/admin/elections` : '/admin/elections'}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-charcoal-500 hover:text-charcoal-800"
      >
        <ArrowLeft size={16} /> Elections
      </Link>

      <h2 className="mt-4 font-display text-2xl font-bold text-charcoal-900">
        {isEdit ? 'Edit election' : 'Create election'}
      </h2>
      <p className="mt-1 text-sm text-charcoal-500">
        {isEdit
          ? 'Update election details, schedule, and settings.'
          : 'Define the election details and voting window.'}
      </p>

      <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="mt-6 max-w-2xl space-y-6">
        <div className="card p-6">
          <div>
            <label htmlFor="title" className="label">
              Election title
            </label>
            <input
              id="title"
              className="input"
              placeholder="e.g. AMR Club BUK General Election 2026"
              {...register('title')}
            />
            {errors.title && <p className="field-error">{errors.title.message}</p>}
          </div>

          <div className="mt-4">
            <label htmlFor="description" className="label">
              Description
            </label>
            <textarea
              id="description"
              rows={3}
              className="input"
              placeholder="Brief description shown to voters"
              {...register('description')}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="start" className="label">
                Voting opens
              </label>
              <input id="start" type="datetime-local" className="input" {...register('startDateTime')} />
              {errors.startDateTime && <p className="field-error">{errors.startDateTime.message}</p>}
            </div>
            <div>
              <label htmlFor="end" className="label">
                Voting closes
              </label>
              <input id="end" type="datetime-local" className="input" {...register('endDateTime')} />
              {errors.endDateTime && <p className="field-error">{errors.endDateTime.message}</p>}
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="instructions" className="label">
              Voting instructions
            </label>
            <textarea
              id="instructions"
              rows={3}
              className="input"
              placeholder="Instructions shown on the ballot page"
              {...register('instructions')}
            />
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-sm font-semibold text-charcoal-800">Settings</h3>
          <div className="mt-4 space-y-4">
            {toggles.map((t) => (
              <label key={t.name} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-charcoal-300 text-amr-navy focus:ring-amr-navy"
                  {...register(t.name)}
                />
                <span>
                  <span className="block text-sm font-medium text-charcoal-800">{t.label}</span>
                  <span className="block text-xs text-charcoal-500">{t.help}</span>
                </span>
              </label>
            ))}
          </div>

          {!isEdit && (
            <div className="mt-5 rounded-md border border-amr-teal/30 bg-amr-pale-blue p-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-charcoal-300 text-amr-navy focus:ring-amr-navy"
                  {...register('seedDefaultPositions')}
                />
                <span>
                  <span className="block text-sm font-medium text-amr-navy">
                    Add official AMR Club executive positions
                  </span>
                  <span className="block text-xs text-charcoal-600">
                    Automatically initializes all 12 official positions (President, VP, Secretary General, Financial Secretary, Treasurer, Outreach, Research, PRO, and Editor-in-Chief).
                  </span>
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={isSubmitting || save.isPending}>
            {save.isPending ? (
              <LoadingSpinner size={18} className="text-white" />
            ) : (
              <>
                <Save size={18} /> {isEdit ? 'Save changes' : 'Create election'}
              </>
            )}
          </button>
          <Link to="/admin/elections" className="btn-secondary">
            Cancel
          </Link>
        </div>

        <p className="flex items-center gap-1.5 text-xs text-charcoal-400">
          <Info size={13} /> Times use your local timezone and are validated on the server.
        </p>
      </form>
    </div>
  );
}
