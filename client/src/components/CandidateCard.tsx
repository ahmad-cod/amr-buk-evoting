import { GraduationCap, Building2 } from 'lucide-react';
import { CandidateAvatar } from '@/components/CandidateAvatar';

interface CandidateCardProps {
  fullName: string;
  faculty?: string;
  department?: string;
  level?: string;
  campaignSlogan?: string;
  imageUrl?: string;
  onViewProfile?: () => void;
  footer?: React.ReactNode;
}

export function CandidateCard({
  fullName,
  faculty,
  department,
  level,
  campaignSlogan,
  imageUrl,
  onViewProfile,
  footer,
}: CandidateCardProps) {
  const metaDetails = [faculty, department, level].filter(Boolean).join(' · ');

  return (
    <article className="card overflow-hidden">
      <CandidateAvatar
        imageUrl={imageUrl}
        fullName={fullName}
        variant="card"
        className="border-0 rounded-none"
      />
      <div className="p-4">
        <h4 className="font-display text-base font-semibold text-charcoal-900">{fullName}</h4>
        {campaignSlogan && (
          <p className="mt-0.5 text-sm italic text-gold-700">“{campaignSlogan}”</p>
        )}
        {metaDetails && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-charcoal-500">
            <span className="inline-flex items-center gap-1">
              <Building2 size={13} /> {metaDetails}
            </span>
          </div>
        )}
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
