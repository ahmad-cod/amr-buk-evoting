import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/store/AuthContext';
import { useToast } from '@/store/ToastContext';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { BrandMark } from '@/components/Brand';

const schema = z.object({
  username: z.string().min(3, 'Enter your username'),
  password: z.string().min(1, 'Enter your password'),
});
type Form = z.infer<typeof schema>;

export function AdminLoginPage() {
  const [show, setShow] = useState(false);
  const { admin, loginAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  if (admin) {
    navigate('/admin/dashboard', { replace: true });
  }

  const onSubmit = async (values: Form) => {
    try {
      await loginAdmin(values.username, values.password);
      toast.success('Signed in');
      navigate(location.state?.from || '/admin/dashboard', { replace: true });
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 401
          ? 'Incorrect username or password.'
          : err instanceof ApiError
            ? err.message
            : 'Sign in failed. Please try again.';
      setError('password', { message });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-900 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center">
          <div className="inline-flex rounded-full bg-white p-2 shadow-sm">
            <BrandMark size={52} />
          </div>
          <h1 className="mt-5 font-display text-2xl font-bold text-white">AMR IEC Portal</h1>
          <p className="mt-1 text-sm text-amr-pale-blue">
            Independent Electoral Committee — administrator access
          </p>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="mt-8 rounded-lg bg-white p-6 shadow-elevated"
        >
          <div>
            <label htmlFor="username" className="label">
              Username
            </label>
            <input
              id="username"
              className="input"
              placeholder="Enter username"
              autoComplete="username"
              aria-invalid={!!errors.username}
              {...register('username')}
            />
            {errors.username && <p className="field-error">{errors.username.message}</p>}
          </div>

          <div className="mt-4">
            <label htmlFor="password" className="label">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={show ? 'text' : 'password'}
                className="input pr-10"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-charcoal-400 hover:text-charcoal-700"
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && <p className="field-error">{errors.password.message}</p>}
          </div>

          <button type="submit" className="btn-primary mt-6 w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <LoadingSpinner size={18} className="text-white" />
            ) : (
              <>
                <LogIn size={18} /> Sign in to portal
              </>
            )}
          </button>
        </form>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-amr-pale-blue">
          <ShieldCheck size={14} /> All administrative actions are logged and audited.
        </p>
      </div>
    </div>
  );
}
