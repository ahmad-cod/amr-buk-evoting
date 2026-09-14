import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-charcoal-300 bg-white px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-charcoal-100">
        <Icon size={22} className="text-charcoal-500" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-charcoal-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-charcoal-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
