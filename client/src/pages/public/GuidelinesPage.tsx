import { ShieldCheck, UserCheck, Vote, Lock, AlertTriangle, ScrollText } from 'lucide-react';

export function GuidelinesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <header className="border-b border-charcoal-200 pb-6">
        <div className="flex items-center gap-2 text-amr-navy">
          <ScrollText size={20} />
          <span className="text-sm font-semibold uppercase tracking-wide">AMR IEC</span>
        </div>
        <h1 className="mt-3 font-display text-3xl font-bold text-navy-900">
          Election guidelines
        </h1>
        <p className="mt-2 text-charcoal-600">
          Please read these guidelines before registering and voting. They exist to keep every AMR
          Club BUK election free, fair, and credible.
        </p>
      </header>

      <div className="mt-8 space-y-8">
        <Section
          icon={UserCheck}
          title="Eligibility"
          items={[
            'You must be a confirmed member of the Antimicrobial Resistance (AMR) Club, Bayero University Kano.',
            'Your name and email must appear in the official member eligibility roster approved by the electoral committee.',
            'Each eligible member may create only one voter account, verified by their roster email.',
          ]}
        />
        <Section
          icon={Vote}
          title="Voting"
          items={[
            'You may vote once in the election. Once submitted, your ballot is final and irreversible.',
            'Select one candidate per position, unless a position explicitly specifies multi-seat selection.',
            'Voting is only available while the election is active and within the authoritative voting window.',
            'After voting you will receive a cryptographic receipt code confirming your participation.',
          ]}
        />
        <Section
          icon={Lock}
          title="Ballot privacy"
          items={[
            'Your ballot is stored completely separately from your identity. No one can see how you voted.',
            'The electoral committee can confirm that you voted, but never which candidates you selected.',
            'Results are aggregated anonymously from the ballot box and only published when authorised by the committee.',
          ]}
        />
        <Section
          icon={ShieldCheck}
          title="Integrity"
          items={[
            'All administrative actions are permanently recorded in an append-only audit log.',
            'Attempts to authenticate with another member’s details or cast duplicate votes will be blocked.',
            'Suspected irregularities should be reported to the AMR Independent Electoral Committee (AMR IEC) immediately.',
          ]}
        />
      </div>

      <div className="mt-10 flex gap-3 rounded-lg border border-gold-500/30 bg-gold-50 p-4">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-gold-600" />
        <p className="text-sm text-gold-800">
          By authenticating and voting on this platform, you agree to abide by these guidelines and the
          decisions of the AMR Independent Electoral Committee (AMR IEC).
        </p>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  items,
}: {
  icon: typeof ShieldCheck;
  title: string;
  items: string[];
}) {
  return (
    <section>
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-charcoal-900">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amr-pale-blue">
          <Icon size={17} className="text-amr-navy" />
        </span>
        {title}
      </h2>
      <ul className="mt-3 space-y-2 pl-1">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-sm text-charcoal-600">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amr-teal" />
            {it}
          </li>
        ))}
      </ul>
    </section>
  );
}
