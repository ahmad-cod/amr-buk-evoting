import { useState } from 'react';
import { initials } from '@/lib/utils';
import { User } from 'lucide-react';

export type CandidateAvatarVariant = 'card' | 'avatar' | 'profile' | 'thumbnail';

interface CandidateAvatarProps {
  imageUrl?: string | null;
  fullName: string;
  variant?: CandidateAvatarVariant;
  className?: string;
}

/**
 * Robust candidate photo display with branded AMR Pale Blue fallback.
 * Automatically falls back to initials/placeholder if no photo is provided
 * or if image loading encounters an error.
 */
export function CandidateAvatar({
  imageUrl,
  fullName,
  variant = 'avatar',
  className = '',
}: CandidateAvatarProps) {
  const [hasError, setHasError] = useState(false);

  const showImage = Boolean(imageUrl && !hasError);

  // Variant styling presets
  const variantStyles = {
    // 4:3 aspect ratio container used in candidate overview cards
    card: 'aspect-[4/3] w-full',
    // Circular avatar used in ballot voting options and admin tables
    avatar: 'h-12 w-12 rounded-full shrink-0',
    // Square thumbnail used in compact selectors
    thumbnail: 'h-10 w-10 rounded-md shrink-0',
    // Large square container used on candidate profile pages
    profile: 'aspect-square w-full max-w-[240px] rounded-lg',
  };

  const textSizes = {
    card: 'text-4xl',
    avatar: 'text-sm',
    thumbnail: 'text-xs',
    profile: 'text-5xl',
  };

  return (
    <div
      className={`overflow-hidden border border-charcoal-200/60 bg-amr-pale-blue ${variantStyles[variant]} ${className}`}
      role="img"
      aria-label={fullName}
    >
      {showImage ? (
        <img
          src={imageUrl!}
          alt={fullName}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-amr-pale-blue text-amr-navy select-none">
          {fullName.trim() ? (
            <span className={`font-display font-bold tracking-wider ${textSizes[variant]}`}>
              {initials(fullName)}
            </span>
          ) : (
            <User className="text-amr-navy/60" size={variant === 'card' || variant === 'profile' ? 48 : 20} />
          )}
        </div>
      )}
    </div>
  );
}
