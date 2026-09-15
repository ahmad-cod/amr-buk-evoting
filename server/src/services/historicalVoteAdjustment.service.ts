import { Types } from 'mongoose';
import { Candidate } from '../models/Candidate';
import {
  HistoricalVoteAdjustment,
  HistoricalVoteAdjustmentDoc,
  HISTORICAL_ADJUSTMENT_STATUS,
} from '../models/HistoricalVoteAdjustment';
import { Position } from '../models/Position';
import { CANDIDATE_STATUS } from '../config/constants';
import { ApiError } from '../utils/ApiError';

export interface CreateHistoricalAdjustmentInput {
  electionId: Types.ObjectId;
  amount: number;
  reason: string;
  authorizedBy: string;
  metadata?: Record<string, unknown>;
  createdBy: Types.ObjectId;
}

/**
 * Creates administrative metadata for unrecoverable historical votes. It never writes
 * Ballot, VoteReceipt, Student, voter, receipt, or candidate-selection records.
 */
export async function createHistoricalVoteAdjustment(
  input: CreateHistoricalAdjustmentInput,
): Promise<HistoricalVoteAdjustmentDoc> {
  const [positions, candidates, existing] = await Promise.all([
    Position.find({ electionId: input.electionId, isActive: true }).select('_id'),
    Candidate.find({ electionId: input.electionId, status: CANDIDATE_STATUS.APPROVED }).select(
      'positionId',
    ),
    HistoricalVoteAdjustment.exists({
      electionId: input.electionId,
      status: HISTORICAL_ADJUSTMENT_STATUS.ACTIVE,
    }),
  ]);

  if (existing) throw ApiError.conflict('This election already has an active historical adjustment');
  if (positions.length === 0) throw ApiError.badRequest('The election has no active positions');

  const candidateCountByPosition = new Map<string, number>();
  candidates.forEach((candidate) => {
    const key = String(candidate.positionId);
    candidateCountByPosition.set(key, (candidateCountByPosition.get(key) || 0) + 1);
  });

  const ambiguousPosition = positions.find((position) => {
    const count = candidateCountByPosition.get(String(position._id)) || 0;
    return count > 0 && count !== 1;
  });

  if (ambiguousPosition) {
    throw ApiError.badRequest(
      'Historical adjustments require exactly one approved candidate for any position that has candidates; empty positions are ignored.',
    );
  }

  try {
    return await HistoricalVoteAdjustment.create(input);
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw ApiError.conflict('This election already has an active historical adjustment');
    }
    throw error;
  }
}

export async function getActiveHistoricalVoteAdjustment(electionId: Types.ObjectId) {
  return HistoricalVoteAdjustment.findOne({
    electionId,
    status: HISTORICAL_ADJUSTMENT_STATUS.ACTIVE,
  }).lean();
}

function isDuplicateKey(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: number }).code === 11000);
}