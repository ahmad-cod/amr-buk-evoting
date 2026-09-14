import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Mail,
  ArrowRight,
  RefreshCw,
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  Inbox,
  Clock,
  AlertTriangle,
  Search,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  LogIn,
  Send,
  UserCheck,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/store/ToastContext';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { BrandWordmark } from '@/components/Brand';
import type { RequestVerificationResponse, RosterHintMatch } from '@/types';

const requestVerificationSchema = z.object({
  email: z
    .string()
    .min(1, 'Email address is required')
    .email('Please enter a valid email address'),
});

type RequestVerificationForm = z.infer<typeof requestVerificationSchema>;

interface SubmittedState {
  email: string;
  status: 'DISPATCHED' | 'NOT_FOUND' | 'ALREADY_REGISTERED' | 'REVOKED';
  maskedEmail?: string;
  helpfulHint?: string;
}

export function RegisterPage() {
  const [submittedState, setSubmittedState] = useState<SubmittedState | null>(null);

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <div className="text-center">
        <div className="flex justify-center">
          <BrandWordmark size={44} />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold text-charcoal-900">
          {submittedState?.status === 'DISPATCHED'
            ? 'Check your inbox'
            : submittedState?.status === 'NOT_FOUND'
              ? 'Email not found'
              : 'Register to vote'}
        </h1>
        <p className="mt-1 text-sm text-charcoal-500">
          {submittedState?.status === 'DISPATCHED'
            ? 'We have sent a secure verification link to complete your voter registration.'
            : submittedState?.status === 'NOT_FOUND'
              ? 'Helpful tips to find your accredited email on the AMR Club BUK register.'
              : 'Verify your eligibility against the AMR Club BUK accredited voter register.'}
        </p>
      </div>

      {/* Stepper indicator */}
      <ol className="mt-8 flex items-center justify-center gap-2 text-xs font-medium">
        <Step
          active={!submittedState || submittedState.status === 'NOT_FOUND'}
          done={submittedState?.status === 'DISPATCHED'}
          label="Request link"
          n={1}
        />
        <span className="h-px w-8 bg-charcoal-200" />
        <Step
          active={submittedState?.status === 'DISPATCHED'}
          done={false}
          label="Verify & vote"
          n={2}
        />
      </ol>

      <div className="mt-6 card p-6">
        {!submittedState ? (
          <RequestStep onSent={(state) => setSubmittedState(state)} />
        ) : submittedState.status === 'NOT_FOUND' ? (
          <EmailNotFoundStep
            email={submittedState.email}
            hint={submittedState.helpfulHint}
            onReset={() => setSubmittedState(null)}
            onSent={(state) => setSubmittedState(state)}
          />
        ) : submittedState.status === 'ALREADY_REGISTERED' ? (
          <AlreadyRegisteredStep
            email={submittedState.email}
            onReset={() => setSubmittedState(null)}
          />
        ) : submittedState.status === 'REVOKED' ? (
          <RevokedStep
            email={submittedState.email}
            hint={submittedState.helpfulHint}
            onReset={() => setSubmittedState(null)}
          />
        ) : (
          <CheckInboxStep
            email={submittedState.maskedEmail || submittedState.email}
            rawEmail={submittedState.email}
            onReset={() => setSubmittedState(null)}
          />
        )}
      </div>

      <p className="mt-6 text-center text-sm text-charcoal-500">
        Already completed registration?{' '}
        <Link to="/login" className="font-medium text-amr-navy hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

function Step({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
          done
            ? 'bg-amr-teal text-white'
            : active
              ? 'bg-amr-navy text-white'
              : 'bg-charcoal-200 text-charcoal-600'
        }`}
      >
        {done ? <CheckCircle2 size={14} /> : n}
      </span>
      <span className={active || done ? 'text-charcoal-800' : 'text-charcoal-400'}>
        {label}
      </span>
    </li>
  );
}

function RequestStep({ onSent }: { onSent: (state: SubmittedState) => void }) {
  const toast = useToast();
  const [showLookup, setShowLookup] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RequestVerificationForm>({
    resolver: zodResolver(requestVerificationSchema),
  });

  const onSubmit = async (values: RequestVerificationForm) => {
    try {
      const email = values.email.trim();
      const res = await api.post<RequestVerificationResponse>('/auth/student/request-verification', {
        email,
      });

      if (res.status === 'NOT_FOUND' || res.inRegister === false) {
        onSent({
          email,
          status: 'NOT_FOUND',
          helpfulHint: res.helpfulHint,
        });
      } else if (res.status === 'ALREADY_REGISTERED') {
        onSent({
          email,
          status: 'ALREADY_REGISTERED',
          helpfulHint: res.helpfulHint,
        });
      } else if (res.status === 'REVOKED') {
        onSent({
          email,
          status: 'REVOKED',
          helpfulHint: res.helpfulHint,
        });
      } else {
        onSent({
          email,
          status: 'DISPATCHED',
          maskedEmail: res.maskedEmail,
          helpfulHint: res.helpfulHint,
        });
      }
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Unable to send verification link. Please try again.';
      toast.error(message);
      setError('email', { message });
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="flex items-start gap-3 rounded-md bg-amr-pale-blue p-3.5 text-sm text-amr-navy">
          <Mail size={18} className="mt-0.5 shrink-0 text-amr-teal" />
          <div>
            <p className="font-medium">Accredited Members Only</p>
            <p className="mt-0.5 text-xs text-charcoal-600">
              Enter the email address registered on the AMR Club BUK voter register. We will send a secure single-use verification link to your inbox.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <label htmlFor="email" className="label">
            Accredited Email Address
          </label>
          <input
            id="email"
            type="email"
            className="input"
            placeholder="e.g. member@gmail.com"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...register('email')}
          />
          {errors.email && <p className="field-error">{errors.email.message}</p>}
        </div>

        <button type="submit" className="btn-primary mt-6 w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <LoadingSpinner size={18} className="text-white" />
          ) : (
            <>
              Send verification link <ArrowRight size={18} />
            </>
          )}
        </button>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-charcoal-400">
          <ShieldCheck size={13} /> Only authorized voters receive valid links.
        </p>
      </form>

      {/* Forgot which email you registered with accordion */}
      <div className="mt-6 border-t border-charcoal-200 pt-4">
        <button
          type="button"
          onClick={() => setShowLookup(!showLookup)}
          className="flex w-full items-center justify-between text-xs font-semibold text-amr-navy hover:text-amr-teal transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <HelpCircle size={14} className="text-amr-teal" />
            Forgot which email you registered with?
          </span>
          {showLookup ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showLookup && (
          <div className="mt-3 rounded-lg border border-charcoal-200 bg-charcoal-50 p-3.5">
            <p className="text-xs text-charcoal-600">
              Look up your accredited email hint by entering your <strong>Full Name</strong> or <strong>Roster Serial Number (1–291)</strong>:
            </p>
            <div className="mt-2.5">
              <RosterHintLookup
                onSelectMatch={(match) => {
                  onSent({
                    email: match.maskedEmail,
                    status: 'DISPATCHED',
                    maskedEmail: match.maskedEmail,
                  });
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmailNotFoundStep({
  email,
  hint,
  onReset,
  onSent,
}: {
  email: string;
  hint?: string;
  onReset: () => void;
  onSent: (state: SubmittedState) => void;
}) {
  const [showLookup, setShowLookup] = useState(true);

  return (
    <div className="text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600 ring-8 ring-amber-50/50">
        <AlertTriangle size={28} />
      </div>

      <h2 className="mt-4 font-display text-lg font-bold text-charcoal-900">
        Email not on voter register
      </h2>

      <p className="mt-2 text-sm text-charcoal-600">
        We checked the official AMR Club BUK voter register, and this address was not found:
      </p>

      <div className="mt-3 inline-block max-w-full truncate rounded-md bg-charcoal-100 px-3.5 py-1.5 font-mono text-sm font-semibold text-charcoal-800">
        {email}
      </div>

      {/* Helpful suggestions */}
      <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50/60 p-4 text-left text-xs text-charcoal-700">
        <p className="font-semibold text-amber-900 flex items-center gap-1.5">
          <HelpCircle size={14} className="text-amber-700" />
          Helpful tips to find your registered email:
        </p>
        <ul className="mt-2 space-y-2 pl-4 list-disc text-charcoal-600">
          <li>
            <strong>Gmail vs. Student Email:</strong> Over 98% of accredited members registered with their personal <code>@gmail.com</code> address. If you tried a university <code>@buk.edu.ng</code> or work email, please try your personal Gmail.
          </li>
          <li>
            <strong>Alternate Addresses:</strong> You may have registered under another personal email when filling out the AMR Club membership form.
          </li>
          <li>
            <strong>Check for Typos:</strong> Double check that the email was entered without spelling errors or extra spaces.
          </li>
        </ul>
      </div>

      {/* Roster Name / SN Lookup Tool */}
      <div className="mt-5 rounded-lg border border-charcoal-200 bg-white p-4 text-left">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-charcoal-900 flex items-center gap-1.5">
            <Search size={14} className="text-amr-teal" />
            Find your registered email hint:
          </p>
          <button
            type="button"
            onClick={() => setShowLookup(!showLookup)}
            className="text-xs text-charcoal-400 hover:text-charcoal-700"
          >
            {showLookup ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {showLookup && (
          <div className="mt-3">
            <p className="text-xs text-charcoal-500 mb-2">
              Enter your <strong>Full Name</strong> or <strong>Roster Serial Number (1–291)</strong> as submitted to AMR IEC:
            </p>
            <RosterHintLookup
              onSelectMatch={(match) => {
                onSent({
                  email: match.maskedEmail,
                  status: 'DISPATCHED',
                  maskedEmail: match.maskedEmail,
                });
              }}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onReset}
          className="btn-primary w-full inline-flex items-center justify-center gap-2"
        >
          <ArrowLeft size={16} /> Try another email address
        </button>

        <a
          href="mailto:elections@contact.usetamreen.com?subject=AMR%20BUK%20Voter%20Eligibility%20Inquiry"
          className="inline-flex items-center justify-center gap-1.5 text-xs text-charcoal-500 hover:text-charcoal-800 py-1"
        >
          Contact AMR IEC Electoral Committee for help
        </a>
      </div>
    </div>
  );
}

function AlreadyRegisteredStep({
  email,
  onReset,
}: {
  email: string;
  onReset: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amr-pale-blue text-amr-teal">
        <CheckCircle2 size={28} />
      </div>

      <h2 className="mt-4 font-display text-lg font-bold text-charcoal-900">
        Account Already Registered
      </h2>

      <p className="mt-2 text-sm text-charcoal-600">
        An account has already been registered for:
      </p>

      <div className="mt-3 inline-block rounded-md bg-amr-pale-blue px-3.5 py-1.5 font-mono text-sm font-semibold text-amr-navy">
        {email}
      </div>

      <p className="mt-4 text-xs text-charcoal-500">
        Your email verification was completed previously. You can sign in directly to cast your ballot.
      </p>

      <div className="mt-6 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="btn-primary w-full inline-flex items-center justify-center gap-2"
        >
          <LogIn size={16} /> Sign in to vote
        </button>

        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center justify-center gap-1.5 text-xs text-charcoal-500 hover:text-charcoal-800 py-1"
        >
          <ArrowLeft size={13} /> Use a different email address
        </button>
      </div>
    </div>
  );
}

function RevokedStep({
  email,
  hint,
  onReset,
}: {
  email: string;
  hint?: string;
  onReset: () => void;
}) {
  return (
    <div className="text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
        <AlertTriangle size={28} />
      </div>

      <h2 className="mt-4 font-display text-lg font-bold text-charcoal-900">
        Voter Eligibility Inactive
      </h2>

      <p className="mt-2 text-sm text-charcoal-600">
        The accreditation status for <strong>{email}</strong> is currently inactive or revoked.
      </p>

      <div className="mt-4 rounded-md border border-charcoal-200 bg-charcoal-50 p-3.5 text-left text-xs text-charcoal-600">
        <p className="font-semibold text-charcoal-800">What to do next:</p>
        <p className="mt-1">
          {hint || 'Please contact the AMR IEC electoral committee to resolve your eligibility status.'}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onReset}
          className="btn-secondary w-full inline-flex items-center justify-center gap-2"
        >
          <ArrowLeft size={16} /> Try another email address
        </button>

        <a
          href="mailto:elections@contact.usetamreen.com?subject=AMR%20BUK%20Voter%20Eligibility%20Appeal"
          className="inline-flex items-center justify-center gap-1.5 text-xs text-charcoal-500 hover:text-charcoal-800 py-1"
        >
          Contact AMR IEC Committee
        </a>
      </div>
    </div>
  );
}

function CheckInboxStep({
  email,
  rawEmail,
  onReset,
}: {
  email: string;
  rawEmail: string;
  onReset: () => void;
}) {
  const [cooldown, setCooldown] = useState(60);
  const [resending, setResending] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    try {
      setResending(true);
      await api.post<{ message: string }>('/auth/student/request-verification', {
        email: rawEmail,
      });
      setCooldown(60);
      toast.success('Verification link resent. Please check your inbox.');
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Could not resend email. Please try again.';
      toast.error(message);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amr-pale-blue text-amr-teal">
        <Inbox size={28} />
      </div>

      <h2 className="mt-4 font-display text-lg font-bold text-charcoal-900">
        Verification link dispatched
      </h2>

      <p className="mt-2 text-sm text-charcoal-600">
        A secure single-use verification link has been sent to your accredited email:
      </p>

      <div className="mt-3 inline-block rounded-md bg-amr-pale-blue px-3.5 py-1.5 font-mono text-sm font-semibold text-amr-navy">
        {email}
      </div>

      <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-charcoal-500">
        <Clock size={13} className="text-amr-teal" />
        <span>Link expires in <strong>30 minutes</strong></span>
      </div>

      <div className="mt-5 rounded-md border border-charcoal-200 bg-charcoal-50 p-3.5 text-left text-xs text-charcoal-600">
        <p className="font-semibold text-charcoal-800">Didn't receive an email?</p>
        <ul className="mt-1.5 list-disc space-y-1.5 pl-4">
          <li>Check your <strong>Spam</strong>, <strong>Junk</strong>, or <strong>Promotions</strong> folder.</li>
          <li>Confirm this is the exact email address you submitted on the AMR voter register.</li>
          <li>If an account was already registered for this email, you can sign in directly.</li>
        </ul>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending}
          className="btn-secondary w-full inline-flex items-center justify-center gap-2"
        >
          {resending ? (
            <LoadingSpinner size={16} className="text-amr-navy" />
          ) : (
            <RefreshCw size={16} className={cooldown > 0 ? 'opacity-50' : ''} />
          )}
          <span>
            {cooldown > 0
              ? `Resend verification link (${cooldown}s)`
              : 'Resend verification link'}
          </span>
        </button>

        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center justify-center gap-1.5 text-xs text-charcoal-500 hover:text-charcoal-800 py-1"
        >
          <ArrowLeft size={13} />
          Use a different email address
        </button>
      </div>
    </div>
  );
}

function RosterHintLookup({
  onSelectMatch,
}: {
  onSelectMatch: (match: RosterHintMatch) => void;
}) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<RosterHintMatch[] | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const toast = useToast();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || q.length < 2) {
      toast.error('Please enter at least 2 characters.');
      return;
    }

    try {
      setSearching(true);
      const res = await api.post<{ matches: RosterHintMatch[] }>('/auth/student/lookup-hint', {
        query: q,
      });
      setResults(res.matches);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Lookup failed. Please try again.';
      toast.error(msg);
    } finally {
      setSearching(false);
    }
  };

  const handleSendToMatch = async (match: RosterHintMatch) => {
    try {
      setSendingId(match.id);
      await api.post<RequestVerificationResponse>('/auth/student/request-verification', {
        voterId: match.id,
      });
      toast.success(`Verification link sent to ${match.maskedEmail}!`);
      onSelectMatch(match);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to send verification email.';
      toast.error(msg);
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div>
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            className="input py-1.5 text-xs pl-8"
            placeholder="e.g. Abba Abubakar or 1"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Search size={14} className="absolute left-2.5 top-2.5 text-charcoal-400" />
        </div>
        <button
          type="submit"
          className="btn-secondary py-1.5 px-3 text-xs shrink-0"
          disabled={searching || !query.trim()}
        >
          {searching ? <LoadingSpinner size={14} /> : 'Search'}
        </button>
      </form>

      {results !== null && (
        <div className="mt-3 space-y-2">
          {results.length === 0 ? (
            <p className="text-xs text-charcoal-500 italic py-1 text-center">
              No matching accredited voter found for "{query}". Please check the spelling or S/N.
            </p>
          ) : (
            results.map((m) => (
              <div
                key={m.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md border border-charcoal-200 bg-white p-2.5 text-xs text-left"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-charcoal-900">{m.fullName}</span>
                    {m.serialNumber && (
                      <span className="rounded bg-charcoal-100 px-1.5 py-0.5 text-[10px] font-mono text-charcoal-600">
                        #{m.serialNumber}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-charcoal-500 mt-0.5">
                    Registered email:{' '}
                    <span className="font-mono font-medium text-amr-navy">{m.maskedEmail}</span>
                  </p>
                  {m.programme && (
                    <p className="text-[10px] text-charcoal-400 truncate max-w-xs">{m.programme}</p>
                  )}
                </div>

                <div className="shrink-0">
                  {m.alreadyRegistered ? (
                    <Link
                      to="/login"
                      className="inline-flex items-center gap-1 rounded bg-charcoal-100 px-2 py-1 text-[11px] font-medium text-charcoal-700 hover:bg-charcoal-200"
                    >
                      <UserCheck size={12} /> Sign In
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSendToMatch(m)}
                      disabled={sendingId === m.id}
                      className="btn-primary py-1 px-2.5 text-[11px] inline-flex items-center gap-1"
                    >
                      {sendingId === m.id ? (
                        <LoadingSpinner size={12} className="text-white" />
                      ) : (
                        <Send size={12} />
                      )}
                      Send link
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

