import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { created, ok } from '../utils/respond';
import { recordAudit } from '../services/audit.service';
import {
  createHistoricalVoteAdjustment,
  getActiveHistoricalVoteAdjustment,
} from '../services/historicalVoteAdjustment.service';

export const getHistoricalVoteAdjustment = asyncHandler(async (req: Request, res: Response) => {
  const electionId = parseElectionId(req.params.id);
  const adjustment = await getActiveHistoricalVoteAdjustment(electionId);
  ok(res, adjustment ? serialize(adjustment) : null);
});

export const createHistoricalVoteAdjustmentHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const electionId = parseElectionId(req.params.id);
    const adjustment = await createHistoricalVoteAdjustment({
      electionId,
      amount: req.body.amount,
      reason: req.body.reason,
      authorizedBy: req.body.authorizedBy,
      metadata: req.body.metadata,
      createdBy: new mongoose.Types.ObjectId(req.admin!.id),
    });

    await recordAudit(req, {
      action: 'historical-vote-adjustment.create',
      resourceType: 'HistoricalVoteAdjustment',
      resourceId: adjustment.id,
      details: {
        event: 'Historical Vote Adjustment',
        electionId: electionId.toString(),
        amount: adjustment.amount,
        reason: adjustment.reason,
        authorizedBy: adjustment.authorizedBy,
        statement: 'Administrative adjustment; not reconstructed ballots.',
      },
    });

    created(res, serialize(adjustment));
  },
);

function parseElectionId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid election id');
  return new mongoose.Types.ObjectId(id);
}

function serialize(adjustment: any) {
  return { ...adjustment.toObject?.() ?? adjustment, id: adjustment.id || String(adjustment._id) };
}