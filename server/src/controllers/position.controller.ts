import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok, created } from '../utils/respond';
import { Position } from '../models/Position';
import { Election } from '../models/Election';
import { Candidate } from '../models/Candidate';
import { DEFAULT_POSITIONS } from '../config/constants';
import { recordAudit } from '../services/audit.service';

async function ensureElection(id: string) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid election id');
  const election = await Election.findById(id);
  if (!election) throw ApiError.notFound('Election not found');
  return election;
}

export const listPositions = asyncHandler(async (req: Request, res: Response) => {
  const election = await ensureElection(req.params.electionId);
  const positions = await Position.find({ electionId: election._id }).sort({
    displayOrder: 1,
    title: 1,
  });
  ok(res, positions);
});

export const createPosition = asyncHandler(async (req: Request, res: Response) => {
  const election = await ensureElection(req.params.electionId);
  const body = req.body as Record<string, unknown>;

  const exists = await Position.findOne({ electionId: election._id, title: body.title });
  if (exists) throw ApiError.conflict('A position with this title already exists in this election');

  const position = await Position.create({ ...body, electionId: election._id });
  await recordAudit(req, {
    action: 'position.create',
    resourceType: 'Position',
    resourceId: position.id,
    details: { title: position.title, electionId: election.id },
  });
  created(res, position);
});

export const seedDefaultPositions = asyncHandler(async (req: Request, res: Response) => {
  const election = await ensureElection(req.params.electionId);
  const titles = (req.body?.titles as string[] | undefined) || DEFAULT_POSITIONS;

  const existing = new Set(
    (await Position.find({ electionId: election._id }).select('title')).map((p) =>
      p.title.toLowerCase(),
    ),
  );

  const toCreate = titles
    .filter((t) => !existing.has(t.toLowerCase()))
    .map((title, i) => ({
      electionId: election._id,
      title,
      displayOrder: existing.size + i,
      maxCandidates: 10,
      maxVotesPerVoter: 1,
      isActive: true,
    }));

  if (toCreate.length) await Position.insertMany(toCreate);

  await recordAudit(req, {
    action: 'position.seed',
    resourceType: 'Election',
    resourceId: election.id,
    details: { added: toCreate.length },
  });

  const positions = await Position.find({ electionId: election._id }).sort({ displayOrder: 1 });
  ok(res, positions);
});

export const updatePosition = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const position = await Position.findById(id);
  if (!position) throw ApiError.notFound('Position not found');

  Object.assign(position, req.body);
  await position.save();

  await recordAudit(req, {
    action: 'position.update',
    resourceType: 'Position',
    resourceId: position.id,
    details: { fields: Object.keys(req.body as object) },
  });
  ok(res, position);
});

export const deletePosition = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const position = await Position.findById(id);
  if (!position) throw ApiError.notFound('Position not found');

  const candidateCount = await Candidate.countDocuments({ positionId: position._id });
  if (candidateCount > 0) {
    throw ApiError.badRequest('Remove candidates from this position before deleting it');
  }

  await position.deleteOne();
  await recordAudit(req, {
    action: 'position.delete',
    resourceType: 'Position',
    resourceId: id,
    details: { title: position.title },
  });
  ok(res, { message: 'Position deleted' });
});
