import { Request, Response } from 'express';
import QRCode from 'qrcode';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok } from '../utils/respond';
import { Election } from '../models/Election';
import { Position } from '../models/Position';
import { Candidate } from '../models/Candidate';
import { VoteReceipt } from '../models/VoteReceipt';
import { Student } from '../models/Student';
import { CANDIDATE_STATUS } from '../config/constants';
import { votingWindow, effectiveStatus } from '../services/election.service';
import { castVote, getVoteStatus } from '../services/vote.service';

// The ballot: positions + approved candidates for the student to choose from.
export const getBallot = asyncHandler(async (req: Request, res: Response) => {
  const election = await Election.findOne({ slug: req.params.slug });
  if (!election) throw ApiError.notFound('Election not found');

  const student = await Student.findById(req.student!.id);
  if (!student) throw ApiError.unauthorized();

  // Programme / faculty eligibility (if configured).
  if (
    election.eligibleDepartments &&
    election.eligibleDepartments.length > 0 &&
    !election.eligibleDepartments.includes(student.programme || student.faculty || '')
  ) {
    throw ApiError.forbidden('Your programme/faculty is not eligible to vote in this election.');
  }

  const alreadyVoted = await VoteReceipt.exists({
    electionId: election._id,
    studentId: student._id,
  });

  const window = votingWindow(election);

  const positions = await Position.find({ electionId: election._id, isActive: true }).sort({
    displayOrder: 1,
    title: 1,
  });
  const candidates = await Candidate.find({
    electionId: election._id,
    status: CANDIDATE_STATUS.APPROVED,
  }).sort({ displayOrder: 1, fullName: 1 });

  const ballot = positions.map((p) => ({
    position: {
      id: p.id,
      title: p.title,
      description: p.description,
      maxVotesPerVoter: p.maxVotesPerVoter,
    },
    candidates: candidates
      .filter((c) => String(c.positionId) === p.id)
      .map((c) => ({
        id: c.id,
        fullName: c.fullName,
        department: c.department,
        level: c.level,
        campaignSlogan: c.campaignSlogan,
        manifesto: c.manifesto,
        imageUrl: c.imageUrl,
      })),
  }));

  ok(res, {
    election: {
      id: election.id,
      title: election.title,
      slug: election.slug,
      instructions: election.instructions,
      effectiveStatus: effectiveStatus(election),
      endDateTime: election.endDateTime,
    },
    ballot,
    votingOpen: window.open,
    votingClosedReason: window.open ? undefined : window.reason,
    hasVoted: Boolean(alreadyVoted),
  });
});

export const submitVote = asyncHandler(async (req: Request, res: Response) => {
  const { selections, idempotencyKey } = req.body as {
    selections: { positionId: string; candidateIds: string[] }[];
    idempotencyKey?: string;
  };

  const result = await castVote({
    electionSlug: req.params.slug,
    studentId: req.student!.id,
    selections,
    idempotencyKey,
    ip: req.clientIp,
    userAgent: req.headers['user-agent'],
  });

  ok(
    res,
    {
      receiptCode: result.receiptCode,
      submittedAt: result.submittedAt,
      alreadyVoted: Boolean(result.alreadyVoted),
      message: result.alreadyVoted
        ? 'You have already voted. Here is your existing receipt.'
        : 'Your vote has been recorded.',
    },
    result.alreadyVoted ? 200 : 201,
  );
});

export const voteStatus = asyncHandler(async (req: Request, res: Response) => {
  const status = await getVoteStatus(req.params.slug, req.student!.id);
  ok(res, status);
});

export const getReceipt = asyncHandler(async (req: Request, res: Response) => {
  const election = await Election.findOne({ slug: req.params.slug });
  if (!election) throw ApiError.notFound('Election not found');

  const receipt = await VoteReceipt.findOne({
    electionId: election._id,
    studentId: req.student!.id,
  });
  if (!receipt) throw ApiError.notFound('No vote receipt found for this election');

  // QR encodes only the receipt code + election — never the selections.
  const qrPayload = JSON.stringify({
    receipt: receipt.receiptCode,
    election: election.slug,
  });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 240 });

  ok(res, {
    receiptCode: receipt.receiptCode,
    submittedAt: receipt.submittedAt,
    election: { title: election.title, slug: election.slug },
    qrDataUrl,
  });
});
