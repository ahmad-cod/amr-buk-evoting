import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, GraduationCap, ScrollText, User, Info } from 'lucide-react';
import { publicApi, qk } from '@/services/queries';
import { FullPageSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { initials, positionId } from '@/lib/utils';

export function CandidateProfilePage() {
  const { slug = '', candidateId = '' } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: qk.publicElection(slug),
    queryFn: () => publicApi.getElection(slug),
    enabled: !!slug,
  });

  if (isLoading) return <FullPageSpinner />;

  const candidate = data?.candidates.find((c) => c.id === candidateId);
  const position = data?.positions.find(
    (p) => candidate && p.id === positionId(candidate.positionId),
  );

  if (!candidate || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState
          icon={Info}
          title="Candidate not found"
          description="This candidate profile is unavailable."
          action={
            <Link to={`/elections/${slug}`} className="btn-secondary">
              Back to election
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link
        to={`/elections/${slug}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-charcoal-500 hover:text-charcoal-800"
      >
        <ArrowLeft size={16} /> {data.election.title}
      </Link>

      <div className="mt-6 grid gap-8 md:grid-cols-[240px_1fr]">
        <div>
          <div className="aspect-square overflow-hidden rounded-lg border border-charcoal-200 bg-charcoal-100">
            {candidate.imageUrl ? (
              <img src={candidate.imageUrl} alt={candidate.fullName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-green-600">
                <span className="font-display text-5xl font-bold text-white">
                  {initials(candidate.fullName)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div>
          <h1 className="font-display text-3xl font-bold text-charcoal-900">{candidate.fullName}</h1>
          {position && (
            <p className="mt-1 text-base font-medium text-green-700">Running for {position.title}</p>
          )}
          {candidate.campaignSlogan && (
            <p className="mt-2 text-lg italic text-gold-700">“{candidate.campaignSlogan}”</p>
          )}

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-charcoal-600">
            {candidate.department && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 size={16} className="text-charcoal-400" /> {candidate.department}
              </span>
            )}
            {candidate.level && (
              <span className="inline-flex items-center gap-1.5">
                <GraduationCap size={16} className="text-charcoal-400" /> {candidate.level}
              </span>
            )}
          </div>

          {candidate.bio && (
            <section className="mt-6">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-charcoal-900">
                <User size={18} /> About
              </h2>
              <p className="mt-2 whitespace-pre-line text-charcoal-600">{candidate.bio}</p>
            </section>
          )}

          {candidate.manifesto && (
            <section className="mt-6">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-charcoal-900">
                <ScrollText size={18} /> Manifesto
              </h2>
              <p className="mt-2 whitespace-pre-line leading-relaxed text-charcoal-600">
                {candidate.manifesto}
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
