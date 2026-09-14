import { Building2, GraduationCap, ScrollText, User } from 'lucide-react';
import { Modal } from './ui/Modal';
import { initials } from '@/lib/utils';
import type { Candidate } from '@/types';

export function CandidateProfileModal({
  candidate,
  positionTitle,
  open,
  onClose,
}: {
  candidate: Candidate | null;
  positionTitle?: string;
  open: boolean;
  onClose: () => void;
}) {
  if (!candidate) return null;
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Candidate profile">
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="w-full shrink-0 sm:w-40">
          <div className="aspect-square overflow-hidden rounded-lg bg-charcoal-100">
            {candidate.imageUrl ? (
              <img src={candidate.imageUrl} alt={candidate.fullName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-amr-navy">
                <span className="font-display text-4xl font-bold text-white">
                  {initials(candidate.fullName)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl font-bold text-charcoal-900">{candidate.fullName}</h3>
          {positionTitle && (
            <p className="text-sm font-medium text-amr-navy">Running for {positionTitle}</p>
          )}
          {candidate.campaignSlogan && (
            <p className="mt-1 text-sm italic text-gold-700">“{candidate.campaignSlogan}”</p>
          )}

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-charcoal-600">
            {candidate.department && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 size={15} className="text-charcoal-400" /> {candidate.department}
              </span>
            )}
            {candidate.level && (
              <span className="inline-flex items-center gap-1.5">
                <GraduationCap size={15} className="text-charcoal-400" /> {candidate.level}
              </span>
            )}
          </div>
        </div>
      </div>

      {candidate.bio && (
        <section className="mt-5">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-charcoal-800">
            <User size={15} /> About
          </h4>
          <p className="mt-1.5 whitespace-pre-line text-sm text-charcoal-600">{candidate.bio}</p>
        </section>
      )}

      {candidate.manifesto && (
        <section className="mt-5">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-charcoal-800">
            <ScrollText size={15} /> Manifesto
          </h4>
          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-charcoal-600">
            {candidate.manifesto}
          </p>
        </section>
      )}
    </Modal>
  );
}
