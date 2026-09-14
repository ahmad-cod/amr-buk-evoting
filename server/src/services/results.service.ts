import { Types } from 'mongoose';
import { Election, ElectionDoc } from '../models/Election';
import { Position } from '../models/Position';
import { Candidate } from '../models/Candidate';
import { Ballot } from '../models/Ballot';
import { VoteReceipt } from '../models/VoteReceipt';
import { Student } from '../models/Student';
import { CANDIDATE_STATUS, ELECTION_STATUS } from '../config/constants';
import { effectiveStatus } from './election.service';

export interface CandidateResult {
  candidateId: string;
  fullName: string;
  imageUrl?: string;
  votes: number;
  percentage: number;
  isWinner: boolean;
}

export interface PositionResult {
  positionId: string;
  title: string;
  displayOrder: number;
  totalVotes: number;
  candidates: CandidateResult[];
}

export interface ElectionResults {
  election: {
    id: string;
    title: string;
    slug: string;
    status: string;
    finalResultsPublished: boolean;
    liveResultsEnabled: boolean;
  };
  turnout: {
    eligibleVoters: number;
    votesCast: number;
    turnoutPercentage: number;
  };
  positions: PositionResult[];
  isFinal: boolean;
  generatedAt: string;
}

/**
 * Builds full results by aggregating the anonymous Ballot collection.
 * Turnout uses VoteReceipt counts (how many people voted) and Student counts
 * (how many were eligible) — never any mapping between the two.
 * Winners are only marked when the election is closed and final results published.
 */
export async function computeResults(election: ElectionDoc): Promise<ElectionResults> {
  const electionId = election._id as Types.ObjectId;
  const status = effectiveStatus(election);
  const isClosed = status === ELECTION_STATUS.CLOSED || status === ELECTION_STATUS.ARCHIVED;
  const markWinners = isClosed && election.finalResultsPublished;

  const [positions, candidates, tallies, votesCast, eligibleVoters] = await Promise.all([
    Position.find({ electionId, isActive: true }).sort({ displayOrder: 1, title: 1 }),
    Candidate.find({ electionId, status: CANDIDATE_STATUS.APPROVED }),
    Ballot.aggregate<{ _id: { positionId: Types.ObjectId; candidateId: Types.ObjectId }; count: number }>([
      { $match: { electionId } },
      {
        $group: {
          _id: { positionId: '$positionId', candidateId: '$candidateId' },
          count: { $sum: 1 },
        },
      },
    ]),
    VoteReceipt.countDocuments({ electionId }),
    countEligibleVoters(election),
  ]);

  const tallyMap = new Map<string, number>();
  tallies.forEach((t) => {
    tallyMap.set(`${t._id.positionId}:${t._id.candidateId}`, t.count);
  });

  const candidatesByPosition = new Map<string, typeof candidates>();
  candidates.forEach((c) => {
    const key = String(c.positionId);
    if (!candidatesByPosition.has(key)) candidatesByPosition.set(key, []);
    candidatesByPosition.get(key)!.push(c);
  });

  const positionResults: PositionResult[] = positions.map((position) => {
    const posCandidates = candidatesByPosition.get(position.id) || [];
    const counted = posCandidates.map((c) => ({
      candidate: c,
      votes: tallyMap.get(`${position.id}:${c.id}`) || 0,
    }));

    const totalVotes = counted.reduce((sum, x) => sum + x.votes, 0);
    const maxVotes = counted.reduce((m, x) => Math.max(m, x.votes), 0);

    const candidateResults: CandidateResult[] = counted
      .map(({ candidate, votes }) => ({
        candidateId: candidate.id,
        fullName: candidate.fullName,
        imageUrl: candidate.imageUrl,
        votes,
        percentage: totalVotes ? Math.round((votes / totalVotes) * 1000) / 10 : 0,
        // Winner only when finalized, votes > 0, and unambiguous (no tie at the top).
        isWinner:
          markWinners &&
          votes > 0 &&
          votes === maxVotes &&
          counted.filter((x) => x.votes === maxVotes).length === 1,
      }))
      .sort((a, b) => b.votes - a.votes);

    return {
      positionId: position.id,
      title: position.title,
      displayOrder: position.displayOrder,
      totalVotes,
      candidates: candidateResults,
    };
  });

  return {
    election: {
      id: election.id,
      title: election.title,
      slug: election.slug,
      status,
      finalResultsPublished: election.finalResultsPublished,
      liveResultsEnabled: election.liveResultsEnabled,
    },
    turnout: {
      eligibleVoters,
      votesCast,
      turnoutPercentage: eligibleVoters ? Math.round((votesCast / eligibleVoters) * 1000) / 10 : 0,
    },
    positions: positionResults,
    isFinal: markWinners,
    generatedAt: new Date().toISOString(),
  };
}

/** Eligible voter pool: eligible voters in the election's eligible programmes/faculties. */
export async function countEligibleVoters(election: ElectionDoc): Promise<number> {
  const filter: Record<string, unknown> = { isEligible: true };
  if (election.eligibleDepartments && election.eligibleDepartments.length > 0) {
    filter.$or = [
      { programme: { $in: election.eligibleDepartments } },
      { faculty: { $in: election.eligibleDepartments } },
    ];
  }
  return Student.countDocuments(filter);
}

export async function getResultsBySlug(slug: string): Promise<{
  election: ElectionDoc;
  results: ElectionResults;
} | null> {
  const election = await Election.findOne({ slug });
  if (!election) return null;
  const results = await computeResults(election);
  return { election, results };
}
