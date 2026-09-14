import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok, created } from '../utils/respond';
import { Candidate } from '../models/Candidate';
import { Election } from '../models/Election';
import { Position } from '../models/Position';
import { CANDIDATE_STATUS } from '../config/constants';
import { recordAudit } from '../services/audit.service';
import { uploadCandidatePhoto, deleteCandidatePhoto } from '../services/storage.service';

async function ensureElection(id: string) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid election id');
  const election = await Election.findById(id);
  if (!election) throw ApiError.notFound('Election not found');
  return election;
}

export const listCandidates = asyncHandler(async (req: Request, res: Response) => {
  const election = await ensureElection(req.params.electionId);
  const filter: Record<string, unknown> = { electionId: election._id };
  if (req.query.positionId) filter.positionId = req.query.positionId;
  if (req.query.status) filter.status = req.query.status;

  const candidates = await Candidate.find(filter)
    .sort({ displayOrder: 1, fullName: 1 })
    .populate('positionId', 'title');
  ok(res, candidates);
});

export const createCandidate = asyncHandler(async (req: Request, res: Response) => {
  const election = await ensureElection(req.params.electionId);
  const body = req.body as Record<string, unknown>;

  const position = await Position.findOne({
    _id: body.positionId,
    electionId: election._id,
  });
  if (!position) throw ApiError.badRequest('Selected position does not belong to this election');

  const count = await Candidate.countDocuments({ positionId: position._id });
  if (count >= position.maxCandidates) {
    throw ApiError.badRequest(`This position already has the maximum of ${position.maxCandidates} candidates`);
  }

  const defaultStatus = election.requireCandidateApproval
    ? CANDIDATE_STATUS.PENDING
    : CANDIDATE_STATUS.APPROVED;

  const candidate = await Candidate.create({
    ...body,
    electionId: election._id,
    status: (body.status as string) || defaultStatus,
    createdBy: req.admin!.id,
  });

  await recordAudit(req, {
    action: 'candidate.create',
    resourceType: 'Candidate',
    resourceId: candidate.id,
    details: { fullName: candidate.fullName, electionId: election.id },
  });

  created(res, candidate);
});

export const updateCandidate = asyncHandler(async (req: Request, res: Response) => {
  const candidate = await findCandidate(req.params.id);
  const body = req.body as Record<string, unknown>;
  delete body.registrationNumber; // Ensure registration number cannot be written
  Object.assign(candidate, body);
  await candidate.save();

  await recordAudit(req, {
    action: 'candidate.update',
    resourceType: 'Candidate',
    resourceId: candidate.id,
    details: { fields: Object.keys(body) },
  });
  ok(res, candidate);
});

export const deleteCandidate = asyncHandler(async (req: Request, res: Response) => {
  const candidate = await findCandidate(req.params.id);
  const oldStorageKey = candidate.storageKey;
  await candidate.deleteOne();
  if (oldStorageKey) {
    await deleteCandidatePhoto(oldStorageKey);
  }

  await recordAudit(req, {
    action: 'candidate.delete',
    resourceType: 'Candidate',
    resourceId: req.params.id,
    details: { fullName: candidate.fullName },
  });
  ok(res, { message: 'Candidate deleted' });
});

export const approveCandidate = asyncHandler(async (req: Request, res: Response) => {
  const candidate = await findCandidate(req.params.id);
  candidate.status = CANDIDATE_STATUS.APPROVED;
  await candidate.save();
  await recordAudit(req, {
    action: 'candidate.approve',
    resourceType: 'Candidate',
    resourceId: candidate.id,
  });
  ok(res, candidate);
});

export const rejectCandidate = asyncHandler(async (req: Request, res: Response) => {
  const candidate = await findCandidate(req.params.id);
  candidate.status = CANDIDATE_STATUS.REJECTED;
  await candidate.save();
  await recordAudit(req, {
    action: 'candidate.reject',
    resourceType: 'Candidate',
    resourceId: candidate.id,
  });
  ok(res, candidate);
});

export const uploadImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('Please choose an image to upload');
  const candidate = await findCandidate(req.params.id);

  const oldStorageKey = candidate.storageKey;

  // 1. Upload new photo to Supabase Storage
  const { imageUrl, storageKey } = await uploadCandidatePhoto(req.file, candidate.id);

  // 2. Persist to database; if this fails, clean up the orphaned newly-uploaded object
  try {
    candidate.imageUrl = imageUrl;
    candidate.storageKey = storageKey;
    await candidate.save();
  } catch (err) {
    await deleteCandidatePhoto(storageKey);
    throw err;
  }

  // 3. Only delete old photo if upload and DB persistence succeeded
  if (oldStorageKey && oldStorageKey !== storageKey) {
    await deleteCandidatePhoto(oldStorageKey);
  }

  await recordAudit(req, {
    action: 'candidate.upload_image',
    resourceType: 'Candidate',
    resourceId: candidate.id,
  });

  ok(res, { imageUrl: candidate.imageUrl, candidate });
});

async function findCandidate(id: string) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid candidate id');
  const candidate = await Candidate.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  return candidate;
}
