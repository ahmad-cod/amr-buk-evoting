import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldCheck,
  Lock,
  UserCheck,
  FileCheck2,
  ArrowRight,
  ListChecks,
  Vote,
  ClipboardCheck,
} from 'lucide-react';
import { publicApi, qk } from '@/services/queries';
import { ElectionCard } from '@/components/ElectionCard';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BrandMark } from '@/components/Brand';

export function HomePage() {
  const { data, isLoading } = useQuery({
    queryKey: qk.publicElections('active', 1),
    queryFn: () => publicApi.listElections('active', 1),
  });

  const active = data?.data ?? [];

  return (
    <div>
      {/* Hero */}
      <section className="border-b border-navy-950 bg-navy-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <div className="flex items-center gap-3 text-amr-pale-blue">
            <div className="rounded-full bg-white p-1 shadow-sm">
              <BrandMark size={32} />
            </div>
            <span className="text-sm font-semibold tracking-wide">AMR IEC · Independent Electoral Committee</span>
          </div>
          <h1 className="mt-6 max-w-3xl font-display text-4xl font-bold leading-tight sm:text-5xl">
            Secure, transparent elections for AMR Club, Bayero University Kano
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-200">
            The official online election platform of the Antimicrobial Resistance (AMR) Club BUK.
            Authenticate with your approved member email and cast your secret ballot with confidence.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/elections" className="btn bg-white text-amr-navy hover:bg-amr-pale-blue font-semibold">
              View elections <ArrowRight size={18} />
            </Link>
            <Link
              to="/register"
              className="btn border border-white/40 text-white hover:bg-white/10"
            >
              Register to vote
            </Link>
          </div>
        </div>
      </section>

      {/* Active elections */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-navy-900">Active elections</h2>
            <p className="mt-1 text-charcoal-500">Elections currently open for voting.</p>
          </div>
          <Link to="/elections" className="hidden text-sm font-semibold text-amr-navy hover:underline sm:block">
            View all
          </Link>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : active.length === 0 ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <EmptyState
                icon={Vote}
                title="No active elections right now"
                description="Check back soon or browse scheduled and past elections."
                action={
                  <Link to="/elections" className="btn-secondary">
                    Browse all elections
                  </Link>
                }
              />
            </div>
          ) : (
            active.map((e) => <ElectionCard key={e.id} election={e} />)
          )}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-charcoal-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="font-display text-2xl font-bold text-navy-900">How voting works</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-4">
            {[
              { icon: UserCheck, title: 'Verify & enroll', text: 'Confirm your voter eligibility using your approved AMR roster email.' },
              { icon: ListChecks, title: 'Review candidates', text: 'Read manifestos and profiles for each position on the ballot.' },
              { icon: Vote, title: 'Cast your vote', text: 'Select candidate(s) per position and submit your anonymous ballot.' },
              { icon: ClipboardCheck, title: 'Get your receipt', text: 'Receive a cryptographic receipt code confirming your vote was counted.' },
            ].map((s, i) => (
              <div key={s.title} className="relative">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-amr-pale-blue">
                  <s.icon size={22} className="text-amr-navy" />
                </div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-amr-teal">
                  Step {i + 1}
                </p>
                <h3 className="mt-1 font-display text-base font-semibold text-charcoal-900">
                  {s.title}
                </h3>
                <p className="mt-1 text-sm text-charcoal-500">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl font-bold text-navy-900">
              Built for trust and ballot privacy
            </h2>
            <p className="mt-3 text-charcoal-600">
              Every safeguard in this platform exists to protect the integrity of your vote and the
              confidentiality of your choices. The electoral committee cannot see who you voted for — ballots
              are recorded separately from voter identities.
            </p>
            <ul className="mt-6 space-y-4">
              {[
                { icon: Lock, title: 'Anonymous ballots', text: 'Your selections are stored with no link to your identity. Nobody can trace a ballot back to you.' },
                { icon: ShieldCheck, title: 'One vote per member', text: 'Enforced structurally at the database level with unique indexes — duplicate voting is rejected.' },
                { icon: FileCheck2, title: 'Verified roster eligibility', text: 'Only members in the official AMR Club approved roster may participate in elections.' },
              ].map((f) => (
                <li key={f.title} className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amr-pale-blue">
                    <f.icon size={18} className="text-amr-navy" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-charcoal-900">{f.title}</h3>
                    <p className="text-sm text-charcoal-500">{f.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-8">
            <div className="flex items-center gap-3">
              <ShieldCheck size={28} className="text-amr-teal" />
              <h3 className="font-display text-lg font-semibold text-navy-900">
                Your privacy, guaranteed
              </h3>
            </div>
            <div className="mt-5 space-y-4 text-sm text-charcoal-600">
              <p className="rounded-md border border-charcoal-200 bg-amr-pale-blue/40 p-4">
                When you vote, the system records two separate records: a <strong>VoteReceipt</strong> that
                marks your participation, and an anonymous <strong>Ballot</strong> containing only
                your selections. These collections are never joined.
              </p>
              <p>
                This ensures turnout can be verified and results tallied accurately, while it
                remains architecturally impossible for anyone — including administrators — to connect any
                voter to their selections.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
