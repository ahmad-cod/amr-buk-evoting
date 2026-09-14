import { cn } from '@/lib/utils';

type Tone = 'green' | 'gold' | 'charcoal' | 'red' | 'blue';

const toneMap: Record<Tone, string> = {
  green: 'bg-amr-teal/15 text-navy-900 ring-amr-teal/30',
  gold: 'bg-gold-50 text-gold-700 ring-gold-500/30',
  charcoal: 'bg-charcoal-100 text-charcoal-700 ring-charcoal-500/20',
  red: 'bg-amr-red/10 text-amr-red ring-amr-red/20',
  blue: 'bg-amr-pale-blue text-amr-navy ring-amr-navy/20',
};

export function StatusBadge({
  label,
  tone = 'charcoal',
  dot = true,
}: {
  label: string;
  tone?: Tone;
  dot?: boolean;
}) {
  const dotColor: Record<Tone, string> = {
    green: 'bg-amr-teal',
    gold: 'bg-gold-500',
    charcoal: 'bg-charcoal-500',
    red: 'bg-amr-red',
    blue: 'bg-amr-navy',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        toneMap[tone],
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dotColor[tone])} />}
      {label}
    </span>
  );
}
