import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldCheck, Shield, Pencil, Trash2, UserCog, CheckCircle2, XCircle } from 'lucide-react';
import { adminApi, qk } from '@/services/queries';
import { useToast } from '@/store/ToastContext';
import { useAuth } from '@/store/AuthContext';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { formatDateTime } from '@/lib/utils';
import { ApiError } from '@/lib/api';
import type { AdminUser, Role } from '@/types';

const createSchema = z.object({
  username: z.string().min(3, 'Username is required'),
  fullName: z.string().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['super_admin', 'election_admin']),
});
type CreateForm = z.infer<typeof createSchema>;

export function AdminsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { admin: current } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: qk.admins(),
    queryFn: () => adminApi.listAdmins(),
  });

  const del = useMutation({
    mutationFn: (id: string) => adminApi.deleteAdmin(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.admins() });
      toast.success('Administrator removed.');
      setDeleting(null);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Delete failed'),
  });

  const admins = data ?? [];

  const columns: Column<AdminUser>[] = [
    {
      key: 'user',
      header: 'Administrator',
      render: (a) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amr-pale-blue text-amr-navy">
            {a.role === 'super_admin' ? <ShieldCheck size={17} /> : <Shield size={17} />}
          </div>
          <div>
            <p className="font-medium text-charcoal-900">
              {a.fullName || a.username}
              {current?.id === a.id && (
                <span className="ml-2 rounded bg-charcoal-100 px-1.5 py-0.5 text-[10px] font-medium text-charcoal-500">
                  You
                </span>
              )}
            </p>
            <p className="text-xs text-charcoal-500">@{a.username}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (a) => (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            a.role === 'super_admin' ? 'bg-amr-pale-blue text-amr-navy font-semibold' : 'bg-charcoal-100 text-charcoal-700'
          }`}
        >
          {a.role === 'super_admin' ? 'Super Admin' : 'Election Admin'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (a) =>
        a.isActive !== false ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amr-navy font-semibold">
            <CheckCircle2 size={14} className="text-amr-teal" /> Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-charcoal-400">
            <XCircle size={14} /> Disabled
          </span>
        ),
    },
    {
      key: 'last',
      header: 'Last sign in',
      render: (a) => (
        <span className="text-xs text-charcoal-500">
          {a.lastLoginAt ? formatDateTime(a.lastLoginAt) : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (a) => (
        <div className="flex justify-end gap-1">
          <button className="btn-ghost px-2.5 py-1.5" onClick={() => setEditing(a)} aria-label="Edit admin">
            <Pencil size={16} />
          </button>
          {current?.id !== a.id && (
            <button
              className="btn-ghost px-2.5 py-1.5 text-red-600 hover:bg-red-50"
              onClick={() => setDeleting(a)}
              aria-label="Delete admin"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl font-bold text-charcoal-900">Administrators</h2>
          <p className="mt-1 text-sm text-charcoal-500">
            Manage who can access the committee portal and what they can do.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setCreateOpen(true)}>
          <Plus size={18} /> Add administrator
        </button>
      </div>

      <div className="mt-6 flex gap-3 rounded-lg border border-gold-500/30 bg-gold-50 p-4 text-sm text-gold-800">
        <UserCog size={18} className="mt-0.5 shrink-0" />
        <p>
          Super Admins have full control including managing administrators and importing students.
          Election Admins can manage elections, positions, candidates, and results.
        </p>
      </div>

      <div className="mt-6">
        <DataTable
          columns={columns}
          rows={admins}
          loading={isLoading}
          rowKey={(a) => a.id}
          empty={{ icon: ShieldCheck, title: 'No administrators', description: 'Add the first administrator.' }}
        />
      </div>

      {createOpen && (
        <CreateAdminModal
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: qk.admins() });
            setCreateOpen(false);
          }}
        />
      )}

      {editing && (
        <EditAdminModal
          admin={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: qk.admins() });
            setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Remove administrator"
        destructive
        message={
          <>
            Remove <strong>{deleting?.username}</strong>? They will immediately lose access to the
            portal.
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

function CreateAdminModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: 'election_admin' },
  });

  const create = useMutation({
    mutationFn: (values: CreateForm) => adminApi.createAdmin(values),
    onSuccess: () => {
      toast.success('Administrator created.');
      onSaved();
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to create administrator';
      if (msg.toLowerCase().includes('username')) setError('username', { message: msg });
      else toast.error(msg);
    },
  });

  return (
    <Modal open onClose={onClose} title="Add administrator">
      <form onSubmit={handleSubmit((v) => create.mutate(v))} noValidate className="space-y-4">
        <div>
          <label htmlFor="ausername" className="label">
            Username
          </label>
          <input id="ausername" className="input" autoComplete="off" {...register('username')} />
          {errors.username && <p className="field-error">{errors.username.message}</p>}
        </div>
        <div>
          <label htmlFor="afull" className="label">
            Full name (optional)
          </label>
          <input id="afull" className="input" {...register('fullName')} />
        </div>
        <div>
          <label htmlFor="apass" className="label">
            Temporary password
          </label>
          <input
            id="apass"
            type="text"
            className="input"
            autoComplete="off"
            placeholder="At least 8 characters"
            {...register('password')}
          />
          {errors.password && <p className="field-error">{errors.password.message}</p>}
        </div>
        <div>
          <label htmlFor="arole" className="label">
            Role
          </label>
          <select id="arole" className="input" {...register('role')}>
            <option value="election_admin">Election Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={create.isPending}>
            {create.isPending ? <LoadingSpinner size={16} className="text-white" /> : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditAdminModal({
  admin,
  onClose,
  onSaved,
}: {
  admin: AdminUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [role, setRole] = useState<Role>(admin.role);
  const [isActive, setIsActive] = useState<boolean>(admin.isActive !== false);
  const [password, setPassword] = useState('');

  const update = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { role, isActive };
      if (password.trim().length >= 8) body.password = password.trim();
      return adminApi.updateAdmin(admin.id, body);
    },
    onSuccess: () => {
      toast.success('Administrator updated.');
      onSaved();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Update failed'),
  });

  return (
    <Modal open onClose={onClose} title={`Edit ${admin.username}`}>
      <div className="space-y-4">
        <div>
          <label htmlFor="erole" className="label">
            Role
          </label>
          <select
            id="erole"
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="election_admin">Election Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-charcoal-300 text-amr-navy focus:ring-amr-navy"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span className="text-sm font-medium text-charcoal-800">Account active</span>
        </label>

        <div>
          <label htmlFor="epass" className="label">
            Reset password (optional)
          </label>
          <input
            id="epass"
            type="text"
            className="input"
            placeholder="Leave blank to keep current"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {password.length > 0 && password.length < 8 && (
            <p className="field-error">Password must be at least 8 characters.</p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={() => update.mutate()}
            disabled={update.isPending || (password.length > 0 && password.length < 8)}
          >
            {update.isPending ? <LoadingSpinner size={16} className="text-white" /> : 'Save changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
