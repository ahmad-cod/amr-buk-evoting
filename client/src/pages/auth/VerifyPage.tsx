import { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Building2,
  GraduationCap,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/store/AuthContext';
import { useToast } from '@/store/ToastContext';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { BrandWordmark } from '@/components/Brand';

const passwordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type PasswordForm = z.infer<typeof passwordSchema>;

interface VerifiedVoter {
  id: string;
  fullName: string;
  email: string;
  serialNumber?: string;
  registrationNumber?: string;
  programme?: string;
  faculty?: string;
  department?: string;
  level?: string;
}

export function VerifyPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [voter, setVoter] = useState<VerifiedVoter | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const { completeRegistration } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    setError: setFormError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  });

  useEffect(() => {
    let active = true;

    async function verify() {
      if (!token) {
        if (active) {
          setError('Verification link is missing or invalid. Please request a new link.');
          setLoading(false);
        }
        return;
      }

      try {
        const res = await api.post<{
          message: string;
          registrationSessionToken: string;
          voter: VerifiedVoter;
        }>('/auth/student/verify-token', { token });

        if (!active) return;
        setSessionToken(res.registrationSessionToken);
        setVoter(res.voter);
        setLoading(false);
      } catch (err) {
        if (!active) return;
        const msg =
          err instanceof ApiError
            ? err.message
            : 'This verification link is invalid, expired, or has already been used.';
        setError(msg);
        setLoading(false);
      }
    }

    verify();

    return () => {
      active = false;
    };
  }, [token]);

  const onSetPassword = async (values: PasswordForm) => {
    if (!sessionToken) return;

    try {
      await completeRegistration({
        registrationSessionToken: sessionToken,
        password: values.password,
        confirmPassword: values.confirmPassword,
      });

      toast.success('Registration completed! You are now logged in.');
      navigate('/elections');
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Failed to complete registration. Please try again.';
      setFormError('password', { message: msg });
      toast.error(msg);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="text-center">
        <div className="flex justify-center">
          <BrandWordmark size={44} />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold text-charcoal-900">
          Voter Registration
        </h1>
        <p className="mt-1 text-sm text-charcoal-500">
          AMR Club Bayero University, Kano Chapter
        </p>
      </div>

      <div className="mt-6 card p-6">
        {loading && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <LoadingSpinner size={32} className="text-amr-teal" />
            <p className="mt-4 text-sm font-medium text-charcoal-700">
              Validating verification token...
            </p>
            <p className="mt-1 text-xs text-charcoal-400">
              Please wait while we confirm your eligibility.
            </p>
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertCircle size={24} />
            </div>
            <h2 className="mt-3 text-lg font-semibold text-charcoal-900">
              Verification Link Invalid or Expired
            </h2>
            <p className="mt-2 text-sm text-charcoal-600">{error}</p>
            <div className="mt-4 rounded-md border border-charcoal-200 bg-charcoal-50 p-3 text-xs text-charcoal-500 text-left">
              <p className="font-semibold text-charcoal-700">Why might this happen?</p>
              <ul className="mt-1 list-disc pl-4 space-y-1">
                <li>Verification links expire after 15 minutes for your security.</li>
                <li>Each link can only be used once.</li>
                <li>A newer verification link may have been requested.</li>
              </ul>
            </div>
            <Link
              to="/register"
              className="btn-primary mt-6 w-full inline-flex items-center justify-center gap-2"
            >
              Request a new verification link <ArrowRight size={16} />
            </Link>
          </div>
        )}

        {!loading && !error && voter && (
          <div>
            <div className="rounded-md border border-amr-teal/30 bg-amr-pale-blue p-4">
              <div className="flex items-center gap-2 text-amr-navy">
                <CheckCircle2 size={18} className="text-amr-teal" />
                <span className="text-sm font-semibold">Email Verified & Eligible</span>
              </div>
              <p className="mt-2 font-display text-lg font-semibold text-charcoal-900">
                {voter.fullName}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-charcoal-600">
                <span className="font-mono">{voter.email}</span>
                {(voter.programme || voter.department || voter.faculty) && (
                  <span className="inline-flex items-center gap-1">
                    <Building2 size={12} /> {voter.programme || voter.department || voter.faculty}
                  </span>
                )}
                {voter.serialNumber && (
                  <span className="inline-flex items-center gap-1">
                    <GraduationCap size={12} /> #{voter.serialNumber}
                  </span>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmit(onSetPassword)} className="mt-6" noValidate>
              <h3 className="font-display text-sm font-semibold text-charcoal-900">
                Create Your Account Password
              </h3>
              <p className="text-xs text-charcoal-500 mt-0.5">
                Set a secure password you will use to sign in and cast your ballot.
              </p>

              <div className="mt-4">
                <label htmlFor="password" className="label">
                  Create Password
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
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  aria-invalid={!!errors.confirmPassword}
                  {...register('confirmPassword')}
                />
                {errors.confirmPassword && (
                  <p className="field-error">{errors.confirmPassword.message}</p>
                )}
              </div>

              <button
                type="submit"
                className="btn-primary mt-6 w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <LoadingSpinner size={18} className="text-white" />
                ) : (
                  <>
                    Complete registration & sign in <ArrowRight size={18} />
                  </>
                )}
              </button>

              <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-charcoal-400">
                <ShieldCheck size={13} /> Your credentials are encrypted and securely stored.
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
