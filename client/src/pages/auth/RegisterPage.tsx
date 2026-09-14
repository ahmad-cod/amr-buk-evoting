import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/store/ToastContext';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { BrandWordmark } from '@/components/Brand';

const requestVerificationSchema = z.object({
  email: z
    .string()
    .min(1, 'Email address is required')
    .email('Please enter a valid email address'),
});

type RequestVerificationForm = z.infer<typeof requestVerificationSchema>;

export function RegisterPage() {
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="text-center">
        <div className="flex justify-center">
          <BrandWordmark size={44} />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold text-charcoal-900">
          {submittedEmail ? 'Check your inbox' : 'Register to vote'}
        </h1>
        <p className="mt-1 text-sm text-charcoal-500">
          {submittedEmail
            ? 'We have sent a secure verification link to complete your voter registration.'
            : 'Verify your eligibility against the AMR Club BUK accredited voter register.'}
        </p>
      </div>

      {/* Stepper indicator */}
      <ol className="mt-8 flex items-center justify-center gap-2 text-xs font-medium">
        <Step active={!submittedEmail} done={!!submittedEmail} label="Request link" n={1} />
        <span className="h-px w-8 bg-charcoal-200" />
        <Step active={!!submittedEmail} done={false} label="Verify & set password" n={2} />
      </ol>

      <div className="mt-6 card p-6">
        {!submittedEmail ? (
          <RequestStep onSent={(email) => setSubmittedEmail(email)} />
        ) : (
          <CheckInboxStep email={submittedEmail} onReset={() => setSubmittedEmail(null)} />
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

function RequestStep({ onSent }: { onSent: (email: string) => void }) {
  const toast = useToast();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RequestVerificationForm>({
    resolver: zodResolver(requestVerificationSchema),
  });

  const onSubmit = async (values: RequestVerificationForm) => {
    try {
      await api.post<{ message: string }>('/auth/student/request-verification', {
        email: values.email.trim(),
      });
      onSent(values.email.trim());
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Unable to send verification link. Please try again.';
      toast.error(message);
      setError('email', { message });
    }
  };

  return (
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
          placeholder="e.g. member@amrclub.buk.edu.ng"
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
  );
}

function CheckInboxStep({
  email,
  onReset,
}: {
  email: string;
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
        email,
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
        If this email address is on the approved AMR Club BUK voter register and has not yet completed
        registration, a secure verification link has been sent to:
      </p>

      <div className="mt-3 inline-block rounded-md bg-amr-pale-blue px-3.5 py-1.5 font-mono text-sm font-semibold text-amr-navy">
        {email}
      </div>

      <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-charcoal-500">
        <Clock size={13} className="text-amr-teal" />
        <span>Link expires in <strong>15 minutes</strong></span>
      </div>

      <div className="mt-5 rounded-md border border-charcoal-200 bg-charcoal-50 p-3.5 text-left text-xs text-charcoal-600">
        <p className="font-semibold text-charcoal-800">Didn't receive an email?</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          <li>Check your spam, junk, or promotions folder.</li>
          <li>Ensure the email entered matches your accredited voter registration email exactly.</li>
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
