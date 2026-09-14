import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok, paginated, pageMeta } from '../utils/respond';
import { Student } from '../models/Student';
import { ImportHistory } from '../models/ImportHistory';
import { buildPreview, importStudents } from '../services/student.service';
import { recordAudit } from '../services/audit.service';
import { ListQuery } from '../validators/schemas';

// Preview a CSV before committing the import.
export const previewImport = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('Please upload a CSV file');
  const mapping = parseMapping(req.body?.mapping);
  const preview = buildPreview(req.file.buffer, mapping);
  ok(res, preview);
});

export const runImport = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('Please upload a CSV file');

  const activateImmediately = req.body?.activateImmediately !== 'false';
  const updateExisting = req.body?.updateExisting !== 'false';
  const mapping = parseMapping(req.body?.mapping);

  const outcome = await importStudents(
    req.file.buffer,
    req.admin!.id,
    req.file.originalname,
    mapping,
    { activateImmediately, updateExisting },
  );

  await recordAudit(req, {
    action: 'students.import',
    resourceType: 'ImportHistory',
    resourceId: outcome.historyId,
    details: {
      fileName: req.file.originalname,
      inserted: outcome.inserted,
      updated: outcome.updated,
      invalid: outcome.invalid,
      skipped: outcome.skipped,
    },
  });

  ok(res, outcome);
});

export const listStudents = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, search, department } = req.query as unknown as ListQuery;
  const filter: Record<string, unknown> = {};
  if (department) {
    filter.$or = [{ programme: department }, { faculty: department }];
  }
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { fullName: rx },
      { email: rx },
      { serialNumber: rx },
      { registrationNumber: rx },
      { programme: rx },
      { faculty: rx },
    ];
  }

  const [items, total] = await Promise.all([
    Student.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Student.countDocuments(filter),
  ]);

  paginated(res, items, pageMeta(page, limit, total));
});

export const toggleEligibility = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { isEligible } = req.body as { isEligible: boolean };

  const student = await Student.findByIdAndUpdate(id, { isEligible }, { new: true });
  if (!student) throw ApiError.notFound('Voter not found');

  await recordAudit(req, {
    action: 'voters.eligibility',
    resourceType: 'Voter',
    resourceId: student.id,
    details: { email: student.email, isEligible },
  });

  ok(res, student);
});

export const importHistory = asyncHandler(async (_req: Request, res: Response) => {
  const history = await ImportHistory.find()
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('importedBy', 'username');
  ok(res, history);
});

export const studentStats = asyncHandler(async (_req: Request, res: Response) => {
  const [total, eligible, registered] = await Promise.all([
    Student.countDocuments(),
    Student.countDocuments({ isEligible: true }),
    Student.countDocuments({ hasRegistered: true }),
  ]);
  ok(res, { total, eligible, registered });
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
