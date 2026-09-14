import { cn } from '@/lib/utils';
import AmrLogo from '@/assets/amr-logo.svg';

/**
 * Official circular badge emblem for the AMR Club BUK e-voting platform.
 * Features the AMR mascot (capsule boxing a germ) and circular institutional crest.
 */
export function BrandMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <img
      src={AmrLogo}
      alt="AMR Club BUK emblem"
      width={size}
      height={size}
      className={cn('rounded-full object-contain shrink-0', className)}
    />
  );
}

export function BrandWordmark({
  size = 40,
  title = 'AMR Club BUK',
  subtitle = 'Bayero University Kano',
  className,
  compact,
}: {
  size?: number;
  title?: string;
  subtitle?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <BrandMark size={size} />
      {!compact && (
        <div className="leading-tight">
          <p className="font-display text-base font-bold tracking-tight text-navy-900">
            {title}
          </p>
          <p className="text-[11px] font-medium text-charcoal-500">{subtitle}</p>
        </div>
      )}
    </div>
  );
}
