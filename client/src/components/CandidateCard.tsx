import { GraduationCap, Building2 } from 'lucide-react';
import { initials } from '@/lib/utils';

interface CandidateCardProps {
  fullName: string;
  department?: string;
  level?: string;
  campaignSlogan?: string;
  imageUrl?: string;
  onViewProfile?: () => void;
  footer?: React.ReactNode;
}

export function CandidateCard({
  fullName,
  department,
  level,
  campaignSlogan,
  imageUrl,
  onViewProfile,
  footer,
}: CandidateCardProps) {
  return (
    <article className="card overflow-hidden">
      <div className="aspect-[4/3] w-full bg-charcoal-100">
        {imageUrl ? (
          <img src={imageUrl} alt={fullName} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-amr-navy">
            <span className="font-display text-4xl font-bold text-white">{initials(fullName)}</span>
          </div>
        )}
      </div>
      <div className="p-4">
        <h4 className="font-display text-base font-semibold text-charcoal-900">{fullName}</h4>
        {campaignSlogan && (
          <p className="mt-0.5 text-sm italic text-gold-700">“{campaignSlogan}”</p>
        )}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-charcoal-500">
          {department && (
            <span className="inline-flex items-center gap-1">
              <Building2 size={13} /> {department}
            </span>
          )}
          {level && (
            <span className="inline-flex items-center gap-1">
              <GraduationCap size={13} /> {level}
            </span>
          )}
        </div>
        {onViewProfile && (
          <button onClick={onViewProfile} className="btn-secondary mt-4 w-full py-2">
            View profile
          </button>
        )}
        {footer}
      </div>
    </article>
  );
}
