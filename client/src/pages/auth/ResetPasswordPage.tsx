import { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  KeyRound,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/store/ToastContext';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { BrandWordmark } from '@/components/Brand';

const schema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password is too long'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const toast = useToast();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    setError: setFormError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    let active = true;

    async function validateToken() {
      if (!token) {
        if (active) {
          setError('This recovery link is invalid or has expired.');
          setValidating(false);
        }
        return;
      }

      try {
        await api.post<{ valid: boolean }>('/auth/validate-recovery-token', { token });
        if (active) {
          setTokenValid(true);
          setValidating(false);
        }
      } catch (err) {
        if (active) {
          const msg =
            err instanceof ApiError && err.status === 400
              ? err.message
              : 'This recovery link is invalid or has expired.';
          setError(msg);
          setValidating(false);
        }
      }
    }

    validateToken();

    return () => {
      active = false;
    };
  }, [token]);

  const onSubmit = async (values: FormValues) => {
    if (!token) return;

    try {
      await api.post<{ message: string }>('/auth/reset-password', {
        token,
        password: values.password,
        confirmPassword: values.confirmPassword,
      });

      setIsSuccess(true);
      toast.success('Password reset. Log in.');
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Failed to reset password. Please try again.';
      toast.error(msg);
      if (/password/i.test(msg)) {
        setFormError('password', { message: msg });
      } else {
        setError(msg);
        setTokenValid(false);
      }
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="text-center">
        <div className="flex justify-center">
          <BrandWordmark size={44} />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold text-charcoal-900">
          {isSuccess
            ? 'Password reset'
            : !tokenValid && !validating
              ? 'Invalid link'
              : 'Set a new password'}
        </h1>
        <p className="mt-1 text-sm text-charcoal-500">
          {isSuccess
            ? 'Your account credential has been updated.'
            : !tokenValid && !validating
              ? 'This recovery session cannot be used.'
              : 'Enter your new password below.'}
        </p>
      </div>

      <div className="mt-8 card p-6">
        {validating && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <LoadingSpinner size={32} className="text-amr-teal" />
            <p className="mt-4 text-sm font-medium text-charcoal-700">
              Validating recovery link...
            </p>
            <p className="mt-1 text-xs text-charcoal-400">
              Confirming single-use security token and account eligibility.
            </p>
          </div>
        )}

        {!validating && (error || !tokenValid) && !isSuccess && (
          <div className="text-center py-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertCircle size={28} />
            </div>

            <h2 className="mt-4 font-display text-lg font-bold text-charcoal-900">
              Recovery Link Expired or Invalid
            </h2>

            <p className="mt-2 text-sm text-charcoal-600">
              {error || 'This recovery link is invalid or has expired.'}
            </p>

            <div className="mt-4 rounded-md border border-charcoal-200 bg-charcoal-50 p-3.5 text-left text-xs text-charcoal-500">
              <p className="font-semibold text-charcoal-700">Common reasons:</p>
              <ul className="mt-1.5 list-disc pl-4 space-y-1">
                <li>Recovery links expire after 30 minutes.</li>
                <li>Each link can only be used once.</li>
                <li>A newer recovery link may have been requested.</li>
              </ul>
            </div>

            <div className="mt-6 flex flex-col gap-2.5">
              <Link
                to="/forgot-password"
                className="btn-primary w-full inline-flex items-center justify-center gap-2"
              >
                Request a new link <ArrowRight size={16} />
              </Link>

              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-1.5 text-xs text-charcoal-500 hover:text-charcoal-800 py-1"
              >
                Back to sign in
              </Link>
            </div>
          </div>
        )}

        {!validating && isSuccess && (
          <div className="text-center py-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={28} />
            </div>

            <h2 className="mt-4 font-display text-lg font-bold text-charcoal-900">
              Password reset. Log in.
            </h2>

            <p className="mt-2 text-sm text-charcoal-600">
              Your password has been successfully updated. Please sign in to continue.
            </p>

            <div className="mt-6">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="btn-primary w-full inline-flex items-center justify-center gap-2"
              >
                Sign in <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {!validating && tokenValid && !isSuccess && (
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="flex items-start gap-3 rounded-md bg-amr-pale-blue p-3.5 text-sm text-amr-navy">
              <KeyRound size={18} className="mt-0.5 shrink-0 text-amr-teal" />
              <div>
                <p className="font-medium">Set a new password</p>
                <p className="mt-0.5 text-xs text-charcoal-600">
                  Choose a secure password of at least 8 characters. This updates your account credential without affecting any ballots or votes.
                </p>
              </div>
            </div>

            <div className="mt-5">
              <label htmlFor="password" className="label">
                New Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  aria-invalid={!!errors.password}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-charcoal-400 hover:text-charcoal-700"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="field-error">{errors.password.message}</p>}
            </div>

            <div className="mt-4">
              <label htmlFor="confirmPassword" className="label">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="Repeat your new password"
                  autoComplete="new-password"
                  aria-invalid={!!errors.confirmPassword}
                  {...register('confirmPassword')}
                />
              </div>
              {errors.confirmPassword && (
                <p className="field-error">{errors.confirmPassword.message}</p>
              )}
            </div>

            <button type="submit" className="btn-primary mt-6 w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <LoadingSpinner size={18} className="text-white" />
              ) : (
                'Set new password'
              )}
            </button>

            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-charcoal-400">
              <ShieldCheck size={13} /> After resetting, you will be redirected to normal login.
            </p>
          </form>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-charcoal-500">
        Remembered your password?{' '}
        <Link to="/login" className="font-medium text-amr-navy hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
