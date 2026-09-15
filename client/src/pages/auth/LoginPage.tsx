import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/store/AuthContext';
import { useToast } from '@/store/ToastContext';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { BrandWordmark } from '@/components/Brand';

const schema = z.object({
  identifier: z.string().min(3, 'Enter your email address or identifier'),
  password: z.string().min(1, 'Enter your password'),
});
type Form = z.infer<typeof schema>;

export function LoginPage() {
  const [show, setShow] = useState(false);
  const { loginStudent } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Form) => {
    try {
      await loginStudent(values.identifier, values.password);
      toast.success('Signed in');
      navigate(location.state?.from || '/elections');
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 401
          ? 'Incorrect email address or password.'
          : err instanceof ApiError
            ? err.message
            : 'Sign in failed. Please try again.';
      setError('password', { message });
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="text-center">
        <div className="flex justify-center">
          <BrandWordmark size={44} />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold text-charcoal-900">Voter sign in</h1>
        <p className="mt-1 text-sm text-charcoal-500">Access your ballot and voting history.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 card p-6">
        <div>
          <label htmlFor="identifier" className="label">
            Email address or voter identifier
          </label>
          <input
            id="identifier"
            className="input"
            placeholder="you@example.com"
            autoComplete="username"
            aria-invalid={!!errors.identifier}
            {...register('identifier')}
          />
          {errors.identifier && <p className="field-error">{errors.identifier.message}</p>}
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="label mb-0">
              Password
            </label>
            <Link to="/forgot-password" className="text-xs font-medium text-amr-navy hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative mt-1.5">
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
              <LogIn size={18} /> Sign in
            </>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-charcoal-500">
        Not registered yet?{' '}
        <Link to="/register" className="font-medium text-amr-navy hover:underline">
          Register to vote
        </Link>
      </p>
    </div>
  );
}
