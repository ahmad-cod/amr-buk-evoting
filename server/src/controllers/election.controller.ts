import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok, created, paginated, pageMeta } from '../utils/respond';
import { Election, ElectionDoc } from '../models/Election';
import { Position } from '../models/Position';
import { Candidate } from '../models/Candidate';
import { VoteReceipt } from '../models/VoteReceipt';
import { Ballot } from '../models/Ballot';
import { ELECTION_STATUS, DEFAULT_POSITIONS, CANDIDATE_STATUS } from '../config/constants';
import { effectiveStatus, votingWindow, resultsVisibility } from '../services/election.service';
import { recordAudit } from '../services/audit.service';
import { slugify } from '../utils/tokens';
import { deleteCandidatePhoto } from '../services/storage.service';
import { ListQuery } from '../validators/schemas';

/** Serialize an election with derived, server-computed status for clients. */
function serialize(election: ElectionDoc) {
  const obj = election.toObject();
  return {
    ...obj,
    id: election.id,
    effectiveStatus: effectiveStatus(election),
    votingOpen: votingWindow(election).open,
  };
}

async function uniqueSlug(base: string, ignoreId?: string): Promise<string> {
  let slug = slugify(base) || `election-${Date.now()}`;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await Election.exists({ slug, _id: { $ne: ignoreId } })) {
    slug = `${slugify(base)}-${n}`;
    n += 1;
  }
  return slug;
}

// ---------- Public ----------
export const listPublicElections = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, status } = req.query as unknown as ListQuery;
  const filter: Record<string, unknown> = { status: { $ne: ELECTION_STATUS.DRAFT } };
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    Election.find(filter)
      .sort({ startDateTime: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Election.countDocuments(filter),
  ]);

  paginated(res, items.map(serialize), pageMeta(page, limit, total));
});

export const getPublicElection = asyncHandler(async (req: Request, res: Response) => {
  const election = await Election.findOne({ slug: req.params.slug });
  if (!election || election.status === ELECTION_STATUS.DRAFT) {
    throw ApiError.notFound('Election not found');
  }

  const positions = await Position.find({ electionId: election._id, isActive: true }).sort({
    displayOrder: 1,
    title: 1,
  });

  // Public sees approved candidates only.
  const candidates = await Candidate.find({
    electionId: election._id,
    status: CANDIDATE_STATUS.APPROVED,
  }).sort({ displayOrder: 1, fullName: 1 });

  ok(res, {
    election: serialize(election),
    positions,
    candidates,
  });
});

// ---------- Admin CRUD ----------
export const listElections = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, status, search } = req.query as unknown as ListQuery;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (search) filter.title = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  const [items, total] = await Promise.all([
    Election.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Election.countDocuments(filter),
  ]);

  paginated(res, items.map(serialize), pageMeta(page, limit, total));
});

export const getElection = asyncHandler(async (req: Request, res: Response) => {
  const election = await findByIdParam(req.params.id);
  const [positions, candidateCount, voteCount] = await Promise.all([
    Position.find({ electionId: election._id }).sort({ displayOrder: 1 }),
    Candidate.countDocuments({ electionId: election._id }),
    VoteReceipt.countDocuments({ electionId: election._id }),
  ]);
  ok(res, { election: serialize(election), positions, candidateCount, voteCount });
});

export const createElection = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const slug = await uniqueSlug((body.slug as string) || (body.title as string));

  const election = await Election.create({
    ...body,
    slug,
    status: ELECTION_STATUS.DRAFT,
    createdBy: req.admin!.id,
  });

  if (body.seedDefaultPositions) {
    await Position.insertMany(
      DEFAULT_POSITIONS.map((title, i) => ({
        electionId: election._id,
        title,
        displayOrder: i,
        maxCandidates: 10,
        maxVotesPerVoter: 1,
        isActive: true,
      })),
    );
  }

  await recordAudit(req, {
    action: 'election.create',
    resourceType: 'Election',
    resourceId: election.id,
    details: { title: election.title, slug: election.slug },
  });

  created(res, serialize(election));
});

export const updateElection = asyncHandler(async (req: Request, res: Response) => {
  const election = await findByIdParam(req.params.id);
  const body = req.body as Record<string, unknown>;

  // Once closed/archived, block edits to timing/status via generic update.
  if (
    (election.status === ELECTION_STATUS.CLOSED || election.status === ELECTION_STATUS.ARCHIVED) &&
    (body.startDateTime || body.endDateTime)
  ) {
    throw ApiError.badRequest('Cannot change dates on a closed or archived election');
  }

  if (body.slug && body.slug !== election.slug) {
    body.slug = await uniqueSlug(body.slug as string, election.id);
  }

  Object.assign(election, body);
  await election.save();

  await recordAudit(req, {
    action: 'election.update',
    resourceType: 'Election',
    resourceId: election.id,
    details: { fields: Object.keys(body) },
  });

  ok(res, serialize(election));
});

export const deleteElection = asyncHandler(async (req: Request, res: Response) => {
  const election = await findByIdParam(req.params.id);

  const votes = await VoteReceipt.countDocuments({ electionId: election._id });
  if (votes > 0 && election.status !== ELECTION_STATUS.ARCHIVED) {
    throw ApiError.badRequest(
      'This election has recorded votes. Archive it instead of deleting to preserve the record.',
    );
  }

  // Clean up candidate images and dependent records.
  const candidates = await Candidate.find({ electionId: election._id });
  await Promise.all(candidates.map((c) => deleteCandidatePhoto(c.storageKey)));
  await Promise.all([
    Candidate.deleteMany({ electionId: election._id }),
    Position.deleteMany({ electionId: election._id }),
    Ballot.deleteMany({ electionId: election._id }),
    VoteReceipt.deleteMany({ electionId: election._id }),
  ]);
  await election.deleteOne();

  await recordAudit(req, {
    action: 'election.delete',
    resourceType: 'Election',
    resourceId: election.id,
    details: { title: election.title },
  });

  ok(res, { message: 'Election deleted' });
});

// ---------- Lifecycle ----------
export const publishElection = asyncHandler(async (req: Request, res: Response) => {
  const election = await findByIdParam(req.params.id);
  if (election.status !== ELECTION_STATUS.DRAFT && election.status !== ELECTION_STATUS.SCHEDULED) {
    throw ApiError.badRequest('Only draft or scheduled elections can be published');
  }
  const positions = await Position.countDocuments({ electionId: election._id, isActive: true });
  if (positions === 0) throw ApiError.badRequest('Add at least one position before publishing');

  election.status = ELECTION_STATUS.SCHEDULED;
  await election.save();
  await audit(req, 'election.publish', election.id);
  ok(res, serialize(election));
});

export const pauseElection = asyncHandler(async (req: Request, res: Response) => {
  const election = await findByIdParam(req.params.id);
  const eff = effectiveStatus(election);
  if (eff !== ELECTION_STATUS.ACTIVE) throw ApiError.badRequest('Only an active election can be paused');
  election.status = ELECTION_STATUS.PAUSED;
  await election.save();
  await audit(req, 'election.pause', election.id);
  ok(res, serialize(election));
});

export const resumeElection = asyncHandler(async (req: Request, res: Response) => {
  const election = await findByIdParam(req.params.id);
  if (election.status !== ELECTION_STATUS.PAUSED) throw ApiError.badRequest('Election is not paused');
  // Resume back to scheduled/active depending on the clock.
  election.status = ELECTION_STATUS.SCHEDULED;
  await election.save();
  await audit(req, 'election.resume', election.id);
  ok(res, serialize(election));
});

export const closeElection = asyncHandler(async (req: Request, res: Response) => {
  const election = await findByIdParam(req.params.id);
  if (election.status === ELECTION_STATUS.ARCHIVED) throw ApiError.badRequest('Election is archived');
  election.status = ELECTION_STATUS.CLOSED;
  await election.save();
  await audit(req, 'election.close', election.id);
  ok(res, serialize(election));
});

export const archiveElection = asyncHandler(async (req: Request, res: Response) => {
  const election = await findByIdParam(req.params.id);
  election.status = ELECTION_STATUS.ARCHIVED;
  await election.save();
  await audit(req, 'election.archive', election.id);
  ok(res, serialize(election));
});

export const publishResults = asyncHandler(async (req: Request, res: Response) => {
  const election = await findByIdParam(req.params.id);
  const eff = effectiveStatus(election);
  if (eff !== ELECTION_STATUS.CLOSED && eff !== ELECTION_STATUS.ARCHIVED) {
    throw ApiError.badRequest('Close the election before publishing final results');
  }
  election.finalResultsPublished = true;
  await election.save();
  await audit(req, 'election.publish_results', election.id);
  ok(res, serialize(election));
});

// Destructive: reset an election's votes. Strong confirmation required client-side.
export const resetElection = asyncHandler(async (req: Request, res: Response) => {
  const election = await findByIdParam(req.params.id);
  const { confirm } = req.body as { confirm?: string };
  if (confirm !== election.slug) {
    throw ApiError.badRequest('Type the election slug to confirm this reset');
  }

  const [ballots, receipts] = await Promise.all([
    Ballot.deleteMany({ electionId: election._id }),
    VoteReceipt.deleteMany({ electionId: election._id }),
  ]);

  election.finalResultsPublished = false;
  await election.save();

  await recordAudit(req, {
    action: 'election.reset',
    resourceType: 'Election',
    resourceId: election.id,
    details: {
      title: election.title,
      ballotsDeleted: ballots.deletedCount,
      receiptsDeleted: receipts.deletedCount,
    },
  });

  ok(res, { message: 'Election votes reset', ballotsDeleted: ballots.deletedCount });
});

export const previewResultsVisibility = asyncHandler(async (req: Request, res: Response) => {
  const election = await findByIdParam(req.params.id);
  ok(res, resultsVisibility(election));
});

// ---------- helpers ----------
async function findByIdParam(id: string) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid election id');
  const election = await Election.findById(id);
  if (!election) throw ApiError.notFound('Election not found');
  return election;
}

async function audit(req: Request, action: string, id: string) {
  await recordAudit(req, { action, resourceType: 'Election', resourceId: id });
}
