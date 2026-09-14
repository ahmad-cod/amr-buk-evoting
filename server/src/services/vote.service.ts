import crypto from 'crypto';
import mongoose, { Types } from 'mongoose';
import { Election } from '../models/Election';
import { Position } from '../models/Position';
import { Candidate } from '../models/Candidate';
import { VoteReceipt } from '../models/VoteReceipt';
import { Ballot } from '../models/Ballot';
import { Student } from '../models/Student';
import { CANDIDATE_STATUS } from '../config/constants';
import { votingWindow } from './election.service';
import { supportsTransactions } from '../config/db';
import { ApiError } from '../utils/ApiError';
import { generateReceiptCode } from '../utils/tokens';
import { env } from '../config/env';

export interface BallotSelection {
  positionId: string;
  candidateIds: string[];
}

export interface CastVoteInput {
  electionSlug: string;
  studentId: string;
  selections: BallotSelection[];
  idempotencyKey?: string;
  ip?: string;
  userAgent?: string;
}

export interface CastVoteResult {
  receiptCode: string;
  submittedAt: Date;
  alreadyVoted?: boolean;
}

function hashIp(ip?: string): string | undefined {
  if (!ip) return undefined;
  return crypto.createHash('sha256').update(ip + env.JWT_SECRET).digest('hex').slice(0, 32);
}

/**
 * Records a vote atomically. Guarantees:
 *  - the election is open (server time + toggles),
 *  - the student is eligible and hasn't already voted,
 *  - every selection targets an approved candidate for a valid position,
 *  - per-position vote limits are respected,
 *  - VoteReceipt (identity) and Ballots (anonymous) are written together,
 *  - a repeat submission (same student or idempotency key) never double-counts.
 */
export async function castVote(input: CastVoteInput): Promise<CastVoteResult> {
  const election = await Election.findOne({ slug: input.electionSlug });
  if (!election) throw ApiError.notFound('Election not found');

  const window = votingWindow(election);
  if (!window.open) throw ApiError.forbidden(window.reason || 'Voting is not open');

  const student = await Student.findById(input.studentId);
  if (!student) throw ApiError.unauthorized('Account not found');
  if (!student.isEligible || student.status === 'REVOKED') {
    throw ApiError.forbidden('Your voter eligibility is inactive or revoked.');
  }

  // Election scoping check: ensure voter is accredited for this specific election
  if (student.electionId && String(student.electionId) !== String(election._id)) {
    throw ApiError.forbidden('You are not accredited to vote in this election.');
  }

  // Programme / faculty eligibility check (remediated from audit Finding 2.1)
  if (
    election.eligibleDepartments &&
    election.eligibleDepartments.length > 0 &&
    !election.eligibleDepartments.includes(student.programme || student.faculty || '')
  ) {
    throw ApiError.forbidden('Your programme/faculty is not eligible to vote in this election.');
  }

  // Fast pre-check (the unique index is the real guard).
  const existing = await VoteReceipt.findOne({
    electionId: election._id,
    studentId: student._id,
  });
  if (existing) {
    return {
      receiptCode: existing.receiptCode,
      submittedAt: existing.submittedAt,
      alreadyVoted: true,
    };
  }

  // Idempotency: same key returns the prior receipt instead of voting again.
  if (input.idempotencyKey) {
    const byKey = await VoteReceipt.findOne({
      electionId: election._id,
      idempotencyKey: input.idempotencyKey,
    });
    if (byKey) {
      return { receiptCode: byKey.receiptCode, submittedAt: byKey.submittedAt, alreadyVoted: true };
    }
  }

  // ---- Validate selections against active positions and approved candidates ----
  const positions = await Position.find({ electionId: election._id, isActive: true });
  const positionMap = new Map(positions.map((p) => [p.id, p]));

  if (!input.selections.length) {
    throw ApiError.badRequest('Your ballot is empty');
  }

  const ballotDocs: {
    _id: Types.ObjectId;
    electionId: Types.ObjectId;
    positionId: Types.ObjectId;
    candidateId: Types.ObjectId;
  }[] = [];
  const seenPositions = new Set<string>();

  for (const sel of input.selections) {
    const position = positionMap.get(sel.positionId);
    if (!position) {
      throw ApiError.badRequest('Ballot contains an invalid or inactive position');
    }
    if (seenPositions.has(sel.positionId)) {
      throw ApiError.badRequest('Duplicate position in ballot');
    }
    seenPositions.add(sel.positionId);

    const uniqueCandidateIds = Array.from(new Set(sel.candidateIds));
    if (uniqueCandidateIds.length !== sel.candidateIds.length) {
      throw ApiError.badRequest('Duplicate candidate selected for a position');
    }
    if (uniqueCandidateIds.length > position.maxVotesPerVoter) {
      throw ApiError.badRequest(
        `You may select at most ${position.maxVotesPerVoter} candidate(s) for ${position.title}`,
      );
    }

    for (const candidateId of uniqueCandidateIds) {
      if (!mongoose.isValidObjectId(candidateId)) {
        throw ApiError.badRequest('Invalid candidate selection');
      }
      const candidate = await Candidate.findOne({
        _id: candidateId,
        electionId: election._id,
        positionId: position._id,
        status: CANDIDATE_STATUS.APPROVED,
      });
      if (!candidate) {
        throw ApiError.badRequest('A selected candidate is not valid for this position');
      }
      // Cryptographically random ObjectId to prevent BSON counter correlation (remediated from audit Finding 3.1)
      ballotDocs.push({
        _id: new Types.ObjectId(crypto.randomBytes(12)),
        electionId: election._id as Types.ObjectId,
        positionId: position._id as Types.ObjectId,
        candidateId: candidate._id as Types.ObjectId,
      });
    }
  }

  if (!ballotDocs.length) throw ApiError.badRequest('Your ballot has no valid selections');

  const receiptCode = generateReceiptCode();
  const receiptPayload = {
    electionId: election._id,
    studentId: student._id,
    receiptCode,
    idempotencyKey: input.idempotencyKey,
    ipHash: hashIp(input.ip),
    userAgent: input.userAgent,
    submittedAt: new Date(),
  };

  // ---- Atomic write ----
  if (supportsTransactions()) {
    const session = await mongoose.startSession();
    try {
      let result: CastVoteResult | undefined;
      await session.withTransaction(async () => {
        // Create receipt first; unique index rejects a concurrent double vote.
        const [receipt] = await VoteReceipt.create([receiptPayload], { session });
        await Ballot.insertMany(ballotDocs, { session });
        result = { receiptCode: receipt.receiptCode, submittedAt: receipt.submittedAt };
      });
      return result!;
    } catch (err) {
      if (isDuplicateKey(err)) {
        const prior = await VoteReceipt.findOne({
          electionId: election._id,
          studentId: student._id,
        });
        if (prior) {
          return { receiptCode: prior.receiptCode, submittedAt: prior.submittedAt, alreadyVoted: true };
        }
        throw ApiError.conflict('You have already voted in this election.');
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }

  // ---- Fallback (no replica set): receipt-first ordering keeps double voting out ----
  // The unique index on VoteReceipt still prevents two receipts. If ballot insert
  // fails after the receipt is written, the receipt code is still valid and the
  // vote is not lost from the voter's perspective; a background reconciler could
  // re-attempt ballots. In production, ALWAYS run a replica set for true atomicity.
  try {
    const receipt = await VoteReceipt.create(receiptPayload);
    await Ballot.insertMany(ballotDocs);
    return { receiptCode: receipt.receiptCode, submittedAt: receipt.submittedAt };
  } catch (err) {
    if (isDuplicateKey(err)) {
      const prior = await VoteReceipt.findOne({
        electionId: election._id,
        studentId: student._id,
      });
      if (prior) {
        return { receiptCode: prior.receiptCode, submittedAt: prior.submittedAt, alreadyVoted: true };
      }
      throw ApiError.conflict('You have already voted in this election.');
    }
    throw err;
  }
}

function isDuplicateKey(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: number }).code === 11000);
}

export async function getVoteStatus(electionSlug: string, studentId: string) {
  const election = await Election.findOne({ slug: electionSlug });
  if (!election) throw ApiError.notFound('Election not found');
  const receipt = await VoteReceipt.findOne({ electionId: election._id, studentId });
  return {
    hasVoted: Boolean(receipt),
    receiptCode: receipt?.receiptCode,
    submittedAt: receipt?.submittedAt,
  };
}
