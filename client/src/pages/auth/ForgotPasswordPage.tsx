import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, ArrowRight, ArrowLeft, Clock, ShieldCheck, Inbox } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/store/ToastContext';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { BrandWordmark } from '@/components/Brand';

const schema = z.object({
  email: z
    .string()
    .min(1, 'Email address is required')
    .email('Please enter a valid email address'),
});

type FormValues = z.infer<typeof schema>;

export function ForgotPasswordPage() {
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const toast = useToast();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const email = values.email.trim();
      await api.post<{ message: string }>('/auth/forgot-password', { email });
      setSubmittedEmail(email);
    } catch (err) {
      // In case of rate limiting or transport error, report cleanly
      const message =
        err instanceof ApiError ? err.message : 'Unable to process request. Please try again.';
      toast.error(message);
      setError('email', { message });
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="text-center">
        <div className="flex justify-center">
          <BrandWordmark size={44} />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold text-charcoal-900">
          Account recovery
        </h1>
        <p className="mt-1 text-sm text-charcoal-500">
          Reset your password or set one for your verified account.
        </p>
      </div>

      <div className="mt-8 card p-6">
        {!submittedEmail ? (
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="flex items-start gap-3 rounded-md bg-amr-pale-blue p-3.5 text-sm text-amr-navy">
              <Mail size={18} className="mt-0.5 shrink-0 text-amr-teal" />
              <div>
                <p className="font-medium">Voter &amp; Admin Password Recovery</p>
                <p className="mt-0.5 text-xs text-charcoal-600">
                  Enter your registered email address. If an eligible account exists, we will send a secure single-use link to set or reset your password.
                </p>
              </div>
            </div>

            <div className="mt-5">
              <label htmlFor="email" className="label">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder="you@example.com"
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
                  Send recovery link <ArrowRight size={18} />
                </>
              )}
            </button>

            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-charcoal-400">
              <ShieldCheck size={13} /> Only authorized recovery links can alter credentials.
            </p>
          </form>
        ) : (
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amr-pale-blue text-amr-teal">
              <Inbox size={28} />
            </div>

            <h2 className="mt-4 font-display text-lg font-bold text-charcoal-900">
              Check your inbox
            </h2>

            <p className="mt-2 text-sm text-charcoal-600">
              If this email is eligible for account recovery, a secure link has been sent. Check spam if you don't see it.
            </p>

            <div className="mt-3 inline-block rounded-md bg-amr-pale-blue px-3.5 py-1.5 font-mono text-sm font-semibold text-amr-navy">
              {submittedEmail}
            </div>

            <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-charcoal-500">
              <Clock size={13} className="text-amr-teal" />
              <span>
                Link expires in <strong>30 minutes</strong>
              </span>
            </div>

            <div className="mt-5 rounded-md border border-charcoal-200 bg-charcoal-50 p-3.5 text-left text-xs text-charcoal-600">
              <p className="font-semibold text-charcoal-800">Security &amp; Delivery Notes:</p>
              <ul className="mt-1.5 list-disc space-y-1.5 pl-4">
                <li>Check your <strong>Spam</strong> or <strong>Junk</strong> folder.</li>
                <li>Single-use link: requesting a new link invalidates any previous one.</li>
                <li>Voting state, ballots, and eligibility are never altered by password recovery.</li>
              </ul>
            </div>

            <div className="mt-6 flex flex-col gap-2.5">
              <Link
                to="/login"
                className="btn-primary w-full inline-flex items-center justify-center gap-2"
              >
                Back to sign in
              </Link>

              <button
                type="button"
                onClick={() => setSubmittedEmail(null)}
                className="inline-flex items-center justify-center gap-1.5 text-xs text-charcoal-500 hover:text-charcoal-800 py-1"
              >
                <ArrowLeft size={13} /> Try another email address
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-charcoal-500">
        Remember your password?{' '}
        <Link to="/login" className="font-medium text-amr-navy hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
