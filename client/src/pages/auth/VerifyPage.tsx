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
  Vote,
  ChevronDown,
  KeyRound,
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
  maskedEmail?: string;
  serialNumber?: string;
  registrationNumber?: string;
  programme?: string;
  faculty?: string;
  department?: string;
  level?: string;
  status?: string;
}

interface VerifyResponse {
  message: string;
  sessionToken?: string;
  registrationSessionToken?: string;
  hasVoted?: boolean;
  hasPassword?: boolean;
  election?: {
    id: string;
    title: string;
    slug: string;
  };
  voter: VerifiedVoter;
}

export function VerifyPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [voter, setVoter] = useState<VerifiedVoter | null>(null);
  const [election, setElection] = useState<{ id: string; title: string; slug: string } | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const { completeRegistration, refreshStudent } = useAuth();
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
        const res = await api.post<VerifyResponse>('/auth/student/verify-token', { token });

        if (!active) return;
        setSessionToken(res.registrationSessionToken || null);
        setVoter(res.voter);
        setElection(res.election || null);
        setHasVoted(!!res.hasVoted);

        try {
          await refreshStudent();
        } catch {
          // ignore session refresh error if background check races
        }

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

      setPasswordSaved(true);
      setShowPasswordSetup(false);
      toast.success('Password set successfully! You can now sign in with your email and password.');
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Failed to save password. Please try again.';
      setFormError('password', { message: msg });
      toast.error(msg);
    }
  };

  const ballotUrl = election ? `/vote/${election.slug}` : '/elections';

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="text-center">
        <div className="flex justify-center">
          <BrandWordmark size={44} />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold text-charcoal-900">
          Voter Verification
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
              Please wait while we confirm your eligibility and initialize your session.
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
                <li>Verification links expire after 30 minutes for your security.</li>
                <li>Each link can only be used once.</li>
                <li>A newer verification link may have been requested or re-sent.</li>
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

        {!loading && !error && hasVoted && (
          <div className="text-center py-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amr-pale-blue text-amr-navy">
              <ShieldCheck size={32} className="text-amr-teal" />
            </div>
            <h2 className="mt-3 font-display text-xl font-bold text-charcoal-900">
              Vote Already Recorded
            </h2>
            <p className="mt-2 text-sm text-charcoal-600 font-medium">
              Your vote has already been recorded for this election. Thank you for participating.
            </p>
            {voter && (
              <div className="mt-4 rounded-md border border-charcoal-200 bg-charcoal-50 p-3 text-xs text-charcoal-600 inline-block text-left">
                <p className="font-semibold text-charcoal-900">{voter.fullName}</p>
                <p className="font-mono text-charcoal-500">{voter.maskedEmail || voter.email}</p>
                {voter.serialNumber && (
                  <p className="text-amr-teal font-mono mt-0.5">Roster #{voter.serialNumber}</p>
                )}
              </div>
            )}
            <div className="mt-6 flex flex-col gap-2.5">
              {election ? (
                <Link
                  to={`/elections/${election.slug}/results`}
                  className="btn-primary w-full inline-flex items-center justify-center gap-2"
                >
                  View Election Results <ArrowRight size={16} />
                </Link>
              ) : (
                <Link
                  to="/elections"
                  className="btn-primary w-full inline-flex items-center justify-center gap-2"
                >
                  Browse Elections <ArrowRight size={16} />
                </Link>
              )}
            </div>
          </div>
        )}

        {!loading && !error && !hasVoted && voter && (
          <div>
            <div className="rounded-md border border-amr-teal/30 bg-amr-pale-blue p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amr-navy">
                  <CheckCircle2 size={18} className="text-amr-teal" />
                  <span className="text-sm font-semibold">Email Verified & Eligible</span>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                  Session Active
                </span>
              </div>
              <p className="mt-2 font-display text-lg font-semibold text-charcoal-900">
                {voter.fullName}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-charcoal-600">
                <span className="font-mono">{voter.maskedEmail || voter.email}</span>
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
              {election && (
                <div className="mt-2 pt-2 border-t border-amr-teal/20 text-xs font-medium text-amr-navy">
                  Accredited for: <span className="font-bold">{election.title}</span>
                </div>
              )}
            </div>

            {/* Direct Proceed to Ballot CTA */}
            <div className="mt-6">
              <Link
                to={ballotUrl}
                className="btn-primary w-full py-3 text-base font-semibold inline-flex items-center justify-center gap-2 shadow-sm"
              >
                <Vote size={20} /> Proceed to Ballot <ArrowRight size={18} />
              </Link>
              <p className="mt-2 text-center text-xs text-charcoal-500">
                Your authenticated session is active. You can vote immediately.
              </p>
            </div>

            {/* Optional Password Setup */}
            {sessionToken && (
              <div className="mt-6 border-t border-charcoal-200 pt-5">
                {passwordSaved ? (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <span>Password created. You can sign in with password in future sessions.</span>
                  </div>
                ) : !showPasswordSetup ? (
                  <button
                    type="button"
                    onClick={() => setShowPasswordSetup(true)}
                    className="w-full flex items-center justify-between p-3 rounded-lg border border-charcoal-200 hover:border-charcoal-300 hover:bg-charcoal-50 text-left transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <KeyRound size={16} className="text-charcoal-500" />
                      <div>
                        <p className="text-xs font-semibold text-charcoal-800">
                          Create password for future direct logins (Optional)
                        </p>
                        <p className="text-[11px] text-charcoal-500">
                          Enables password login without waiting for an email verification link
                        </p>
                      </div>
                    </div>
                    <ChevronDown size={16} className="text-charcoal-400" />
                  </button>
                ) : (
                  <div className="rounded-lg border border-charcoal-200 p-4 bg-charcoal-50/50">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-sm font-semibold text-charcoal-900 flex items-center gap-2">
                        <KeyRound size={15} className="text-amr-teal" /> Create Password (Optional)
                      </h3>
                      <button
                        type="button"
                        onClick={() => setShowPasswordSetup(false)}
                        className="text-xs text-charcoal-400 hover:text-charcoal-600"
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="text-xs text-charcoal-500 mt-1">
                      Set a password to log in directly next time. You do not need to do this now to vote.
                    </p>

                    <form onSubmit={handleSubmit(onSetPassword)} className="mt-3" noValidate>
                      <div>
                        <label htmlFor="password" className="label text-xs">
                          Password
                        </label>
                        <div className="relative">
                          <input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            className="input pr-10 text-sm"
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

                      <div className="mt-3">
                        <label htmlFor="confirmPassword" className="label text-xs">
                          Confirm Password
                        </label>
                        <input
                          id="confirmPassword"
                          type={showPassword ? 'text' : 'password'}
                          className="input text-sm"
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
                        className="btn-secondary mt-4 w-full py-2 text-xs font-semibold"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? (
                          <LoadingSpinner size={16} className="text-charcoal-700" />
                        ) : (
                          'Save Password'
                        )}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}

            <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-charcoal-400">
              <ShieldCheck size={13} /> Your ballot is anonymous. Voting records are decoupled from selections.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
