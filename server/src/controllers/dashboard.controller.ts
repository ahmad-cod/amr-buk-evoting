import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ok, paginated, pageMeta } from '../utils/respond';
import { Election } from '../models/Election';
import { Candidate } from '../models/Candidate';
import { Student } from '../models/Student';
import { VoteReceipt } from '../models/VoteReceipt';
import { AuditLog } from '../models/AuditLog';
import { ELECTION_STATUS, CANDIDATE_STATUS } from '../config/constants';
import { effectiveStatus } from '../services/election.service';
import { ListQuery } from '../validators/schemas';

export const dashboardStats = asyncHandler(async (_req: Request, res: Response) => {
  const [
    totalElections,
    elections,
    totalStudents,
    eligibleStudents,
    totalVotes,
    totalCandidates,
    pendingCandidates,
    recentAudit,
  ] = await Promise.all([
    Election.countDocuments(),
    Election.find().select('title slug status startDateTime endDateTime'),
    Student.countDocuments(),
    Student.countDocuments({ isEligible: true }),
    VoteReceipt.countDocuments(),
    Candidate.countDocuments(),
    Candidate.countDocuments({ status: CANDIDATE_STATUS.PENDING }),
    AuditLog.find().sort({ createdAt: -1 }).limit(8).populate('adminId', 'username'),
  ]);

  const activeElections = elections.filter(
    (e) => effectiveStatus(e) === ELECTION_STATUS.ACTIVE,
  ).length;

  const turnoutPercentage = eligibleStudents
    ? Math.round((totalVotes / eligibleStudents) * 1000) / 10
    : 0;

  const statusBreakdown = elections.reduce<Record<string, number>>((acc, e) => {
    const s = effectiveStatus(e);
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  ok(res, {
    totals: {
      elections: totalElections,
      activeElections,
      registeredVoters: totalStudents,
      eligibleVoters: eligibleStudents,
      votesCast: totalVotes,
      candidates: totalCandidates,
      pendingCandidates,
      turnoutPercentage,
    },
    statusBreakdown,
    recentActivity: recentAudit,
  });
});

export const listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, search } = req.query as unknown as ListQuery;
  const filter: Record<string, unknown> = {};
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ action: rx }, { resourceType: rx }, { actorLabel: rx }];
  }

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('adminId', 'username'),
    AuditLog.countDocuments(filter),
  ]);

  paginated(res, items, pageMeta(page, limit, total));
});
