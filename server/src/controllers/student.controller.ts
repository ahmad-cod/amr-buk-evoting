import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok, paginated, pageMeta } from '../utils/respond';
import { Student } from '../models/Student';
import { ImportHistory } from '../models/ImportHistory';
import { Election } from '../models/Election';
import {
  validateRosterBuffer,
  commitRosterImport,
  sendVerificationLinksToPending,
  resendVerificationLinkToVoter,
} from '../services/student.service';
import { recordAudit } from '../services/audit.service';
import { ListQuery } from '../validators/schemas';
import { maskEmail } from '../utils/maskEmail';

// Preview a CSV before committing the import.
export const previewImport = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('Please upload a CSV file');
  const mapping = parseMapping(req.body?.mapping);
  const report = validateRosterBuffer(req.file.buffer, mapping);
  ok(res, report);
});

export const runImport = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('Please upload a CSV file');

  const activateImmediately = req.body?.activateImmediately !== 'false';
  const updateExisting = req.body?.updateExisting !== 'false';
  const mapping = parseMapping(req.body?.mapping);
  const electionId = req.body?.electionId;

  let confirmedRowNumbers: number[] | undefined;
  if (req.body?.confirmedRowNumbers) {
    try {
      confirmedRowNumbers = Array.isArray(req.body.confirmedRowNumbers)
        ? req.body.confirmedRowNumbers.map(Number)
        : JSON.parse(String(req.body.confirmedRowNumbers)).map(Number);
    } catch {
      confirmedRowNumbers = undefined;
    }
  }

  const outcome = await commitRosterImport(req.file.buffer, {
    electionId,
    importedBy: req.admin!.id,
    fileName: req.file.originalname,
    mapping,
    activateImmediately,
    updateExisting,
    confirmedRowNumbers,
  });

  await recordAudit(req, {
    action: 'voters.roster_imported',
    resourceType: 'ImportHistory',
    resourceId: outcome.historyId,
    details: {
      fileName: req.file.originalname,
      electionId,
      totalRows: outcome.totalRows,
      populatedRows: outcome.populatedRows,
      blankRows: outcome.blankRows,
      inserted: outcome.inserted,
      updated: outcome.updated,
      invalid: outcome.invalid,
      skipped: outcome.skipped,
      conflictsCount: outcome.conflicts.length,
    },
  });

  ok(res, outcome);
});

export const listStudents = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, search, department, status } = req.query as unknown as ListQuery & {
    electionId?: string;
    unmask?: string;
  };
  const electionId = (req.query.electionId as string) || undefined;
  const shouldUnmask = req.query.unmask === 'true';

  const filter: Record<string, unknown> = {};

  if (electionId && mongoose.isValidObjectId(electionId)) {
    filter.electionId = new Types.ObjectId(electionId);
  }

  if (status) {
    if (status.toUpperCase() === 'ELIGIBLE') {
      filter.isEligible = true;
      filter.status = { $ne: 'REVOKED' };
    } else {
      filter.status = status.toUpperCase();
    }
  }

  if (department) {
    filter.$or = [{ programme: department }, { faculty: department }];
  }

  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { fullName: rx },
      { name: rx },
      { email: rx },
      { normalizedEmail: rx },
      { rosterSerialNumber: rx },
      { serialNumber: rx },
      { registrationNumber: rx },
      { programme: rx },
      { faculty: rx },
    ];
  }

  const [rawItems, total] = await Promise.all([
    Student.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Student.countDocuments(filter),
  ]);

  const items = rawItems.map((s) => ({
    id: s.id,
    fullName: s.fullName || s.name,
    email: shouldUnmask ? s.email : maskEmail(s.email),
    maskedEmail: maskEmail(s.email),
    serialNumber: s.rosterSerialNumber || s.serialNumber,
    registrationNumber: s.registrationNumber,
    programme: s.programme,
    faculty: s.faculty,
    department: s.programme || s.faculty,
    gender: s.gender,
    status: s.status || (s.isVerified ? 'VERIFIED' : s.isEligible ? 'PENDING' : 'REVOKED'),
    isVerified: s.isVerified,
    isEligible: s.isEligible,
    hasRegistered: s.hasRegistered,
    verifiedAt: s.verifiedAt,
    verificationRevokedAt: s.verificationRevokedAt,
    createdAt: s.createdAt,
  }));

  paginated(res, items, pageMeta(page, limit, total));
});

export const toggleEligibility = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { isEligible } = req.body as { isEligible: boolean };

  const student = await Student.findById(id);
  if (!student) throw ApiError.notFound('Voter not found');

  student.isEligible = isEligible;
  if (!isEligible) {
    student.status = 'REVOKED';
    student.verificationRevokedAt = new Date();
    // Invalidate outstanding token
    student.verificationTokenHash = undefined;
    student.verificationTokenExpires = undefined;
    student.verificationTokenExpiresAt = undefined;
  } else {
    // Restore
    student.status = student.verifiedAt ? 'VERIFIED' : 'PENDING';
    student.verificationRevokedAt = undefined;
  }

  await student.save();

  await recordAudit(req, {
    action: isEligible ? 'voter.restored' : 'voter.revoked',
    resourceType: 'Voter',
    resourceId: student.id,
    details: { email: maskEmail(student.email), status: student.status, isEligible },
  });

  ok(res, {
    id: student.id,
    fullName: student.fullName,
    email: maskEmail(student.email),
    status: student.status,
    isEligible: student.isEligible,
    verifiedAt: student.verifiedAt,
  });
});

export const sendAllVerificationLinks = asyncHandler(async (req: Request, res: Response) => {
  const electionId = (req.body?.electionId as string) || (req.query?.electionId as string);
  const result = await sendVerificationLinksToPending(electionId);

  await recordAudit(req, {
    action: 'voters.bulk_verification_sent',
    resourceType: 'Election',
    resourceId: electionId,
    details: { totalPending: result.totalPending, sent: result.sent, failed: result.failed },
  });

  ok(res, {
    message: `Dispatched ${result.sent} verification links to pending voters (${result.failed} failed).`,
    ...result,
  });
});

export const resendVoterVerification = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await resendVerificationLinkToVoter(id);

  await recordAudit(req, {
    action: 'voter.verification_resent',
    resourceType: 'Voter',
    resourceId: id,
    details: { maskedEmail: result.maskedEmail },
  });

  ok(res, {
    message: `Verification link successfully resent to ${result.maskedEmail}.`,
    ...result,
  });
});

export const importHistory = asyncHandler(async (req: Request, res: Response) => {
  const electionId = req.query.electionId as string;
  const filter: Record<string, unknown> = {};
  if (electionId && mongoose.isValidObjectId(electionId)) {
    filter.electionId = new Types.ObjectId(electionId);
  }

  const history = await ImportHistory.find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('importedBy', 'username');
  ok(res, history);
});

export const studentStats = asyncHandler(async (req: Request, res: Response) => {
  const electionId = req.query.electionId as string;
  const filter: Record<string, unknown> = {};
  if (electionId && mongoose.isValidObjectId(electionId)) {
    filter.electionId = new Types.ObjectId(electionId);
  }

  const [total, eligible, pending, verified, revoked] = await Promise.all([
    Student.countDocuments(filter),
    Student.countDocuments({ ...filter, isEligible: true, status: { $ne: 'REVOKED' } }),
    Student.countDocuments({ ...filter, status: 'PENDING' }),
    Student.countDocuments({ ...filter, status: 'VERIFIED' }),
    Student.countDocuments({ ...filter, $or: [{ status: 'REVOKED' }, { isEligible: false }] }),
  ]);

  ok(res, {
    total,
    eligible,
    pending,
    verified,
    revoked,
    registered: verified,
  });
});

function parseMapping(raw: unknown) {
  if (!raw) return undefined;
  if (typeof raw === 'object') return raw as Record<string, string>;
  try {
    return JSON.parse(String(raw));
  } catch {
    return undefined;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
