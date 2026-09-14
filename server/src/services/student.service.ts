import crypto from 'crypto';
import { parse } from 'csv-parse/sync';
import mongoose, { Types } from 'mongoose';
import { Student, StudentDoc, Voter, VoterDoc, VoterStatus } from '../models/Student';
import { ImportHistory, ImportRowError, ImportConflict } from '../models/ImportHistory';
import { Election } from '../models/Election';
import { FACULTY_NAME } from '../config/constants';
import {
  isValidEmailFormat,
  normalizeEmail,
  normalizeRegNumber,
  normalizeIdentifier,
} from '../utils/regNumber';
import { ApiError } from '../utils/ApiError';
import { supportsTransactions } from '../config/db';
import { env } from '../config/env';
import { sendVerificationEmail } from './email.service';
import { maskEmail } from '../utils/maskEmail';

export interface ColumnMapping {
  serialNumber?: string;
  fullName?: string;
  email?: string;
  gender?: string;
  programme?: string;
  department?: string;
  faculty?: string;
  registrationNumber?: string;
  phone?: string;
  level?: string;
}

// Header aliases -> canonical field. Matched case-insensitively, ignoring non-alphanumerics.
const HEADER_ALIASES: Record<keyof ColumnMapping, string[]> = {
  serialNumber: ['sn', 'sno', 'serialnumber', 'serial', 'no', 'number'],
  fullName: ['fullname', 'name', 'votername', 'studentname', 'membername', 'candidatesname'],
  email: ['email', 'emailaddress', 'mail', 'voteremail'],
  gender: ['gender', 'sex'],
  programme: ['programme', 'program', 'programofstudy', 'course', 'courseofstudy'],
  department: ['department', 'dept'],
  faculty: ['faculty', 'college', 'school'],
  registrationNumber: ['registrationnumber', 'regnumber', 'regno', 'matricnumber', 'registration'],
  phone: ['phonenumber', 'phone', 'mobile', 'telephone'],
  level: ['level', 'yearofstudy', 'year'],
};

const canon = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function resolveMapping(headers: string[], provided?: ColumnMapping): ColumnMapping {
  const mapping: ColumnMapping = { ...provided };
  const canonHeaders = headers.map((h) => ({ raw: h, key: canon(h) }));

  (Object.keys(HEADER_ALIASES) as (keyof ColumnMapping)[]).forEach((field) => {
    if (mapping[field]) return; // respect admin-provided mapping
    const aliases = HEADER_ALIASES[field];
    const found = canonHeaders.find((h) => aliases.includes(h.key));
    if (found) mapping[field] = found.raw;
  });

  return mapping;
}

export function parseCsvBuffer(buffer: Buffer): Record<string, string>[] {
  try {
    return parse(buffer, {
      columns: true,
      skip_empty_lines: false, // Do NOT skip empty lines immediately so we can accurately count blank rows
      trim: true,
      relax_column_count: true,
      bom: true,
    }) as Record<string, string>[];
  } catch (err) {
    throw ApiError.badRequest('Could not parse CSV file. Ensure it is a valid CSV.');
  }
}

export interface ValidatedRow {
  rowNum: number;
  serialNumber?: string;
  fullName: string;
  email: string;
  normalizedEmail: string;
  gender?: string;
  programme?: string;
  faculty?: string;
  status: 'VALID' | 'BLANK_ROW' | 'INVALID_EMAIL' | 'MISSING_EMAIL' | 'MISSING_REQUIRED_FIELD' | 'DUPLICATE_EMAIL' | 'DUPLICATE_SERIAL';
  issues: string[];
}

export interface RosterValidationReport {
  totalRows: number;
  populatedRows: number;
  blankRows: number;
  validEmails: number;
  invalidEmails: number;
  duplicateEmails: number;
  duplicateSerials: number;
  importableRecords: number;
  recordsRequiringReview: number;
  headers: string[];
  mapping: ColumnMapping;
  sampleRows: Record<string, string>[];
  conflicts: ImportConflict[];
  errors: ImportRowError[];
  importableRows: ValidatedRow[];
  rowsRequiringReview: ValidatedRow[];
}

/**
 * Stage 2 & 3: Parse and thoroughly validate roster records.
 * Identifies blank rows, missing/malformed emails, duplicate emails, duplicate S/Ns,
 * and surfaces conflicts requiring administrator resolution.
 */
export function validateRosterBuffer(
  buffer: Buffer,
  provided?: ColumnMapping,
): RosterValidationReport {
  const rawRows = parseCsvBuffer(buffer);
  const headers = rawRows.length ? Object.keys(rawRows[0]) : [];
  const mapping = resolveMapping(headers, provided);

  if (!mapping.email && !mapping.fullName) {
    throw ApiError.badRequest('Could not find required email or name columns in the CSV. Please provide a column mapping.');
  }

  const get = (row: Record<string, string>, col?: string) =>
    col && row[col] !== undefined ? String(row[col]).trim() : '';

  const validatedRows: ValidatedRow[] = [];
  const emailToRows = new Map<string, number[]>(); // normalizedEmail -> row numbers
  const serialToRows = new Map<string, number[]>(); // serialNumber -> row numbers

  let blankRowsCount = 0;

  for (let i = 0; i < rawRows.length; i += 1) {
    const row = rawRows[i];
    const rowNum = i + 2; // header is row 1

    const rawSerial = get(row, mapping.serialNumber);
    const rawName = get(row, mapping.fullName);
    const rawEmail = get(row, mapping.email);
    const rawGender = get(row, mapping.gender);
    const rawFaculty = get(row, mapping.faculty);
    const rawProgramme = get(row, mapping.programme) || get(row, mapping.department);

    // Detect blank / unpopulated rows (e.g. rows 292-300 in the 300-row AMR roster)
    const isAllBlank = Object.values(row).every((v) => !v || !String(v).trim());
    const isSerialOnly = Boolean(rawSerial && !rawName && !rawEmail && !rawGender && !rawFaculty && !rawProgramme);

    if (isAllBlank || isSerialOnly) {
      blankRowsCount += 1;
      validatedRows.push({
        rowNum,
        serialNumber: rawSerial,
        fullName: '',
        email: '',
        normalizedEmail: '',
        gender: '',
        faculty: '',
        programme: '',
        status: 'BLANK_ROW',
        issues: ['Blank or unpopulated row'],
      });
      continue;
    }

    const normEmail = normalizeEmail(rawEmail);
    const issues: string[] = [];

    if (!rawName) {
      issues.push('Missing member full name');
    }

    if (!rawEmail) {
      issues.push('Missing email address');
    } else if (!isValidEmailFormat(rawEmail)) {
      issues.push(`Invalid email address format: "${rawEmail}"`);
    }

    if (rawSerial) {
      const existingSerials = serialToRows.get(rawSerial) || [];
      existingSerials.push(rowNum);
      serialToRows.set(rawSerial, existingSerials);
    }

    if (normEmail) {
      const existingEmails = emailToRows.get(normEmail) || [];
      existingEmails.push(rowNum);
      emailToRows.set(normEmail, existingEmails);
    }

    validatedRows.push({
      rowNum,
      serialNumber: rawSerial,
      fullName: rawName,
      email: rawEmail,
      normalizedEmail: normEmail,
      gender: rawGender,
      faculty: rawFaculty,
      programme: rawProgramme,
      status: issues.length ? (issues.some((e) => e.includes('Invalid')) ? 'INVALID_EMAIL' : 'MISSING_REQUIRED_FIELD') : 'VALID',
      issues,
    });
  }

  // Second pass: cross-reference duplicates
  const conflicts: ImportConflict[] = [];
  const duplicateEmailRows = new Set<number>();
  const duplicateSerialRows = new Set<number>();

  // Check duplicate emails
  for (const [email, rowNums] of emailToRows.entries()) {
    if (rowNums.length > 1) {
      rowNums.forEach((r) => duplicateEmailRows.add(r));
      const records = rowNums.map((r) => {
        const v = validatedRows.find((row) => row.rowNum === r);
        return {
          row: r,
          serialNumber: v?.serialNumber,
          fullName: v?.fullName,
          email: v?.email,
        };
      });
      conflicts.push({
        type: 'DUPLICATE_EMAIL',
        email,
        records,
        actionRequired: 'Resolve duplicate email conflict before production import. Multiple members cannot share the same accredited voting email.',
      });
    }
  }

  // Check duplicate serial numbers
  for (const [serial, rowNums] of serialToRows.entries()) {
    if (rowNums.length > 1) {
      rowNums.forEach((r) => duplicateSerialRows.add(r));
      const records = rowNums.map((r) => {
        const v = validatedRows.find((row) => row.rowNum === r);
        return {
          row: r,
          serialNumber: serial,
          fullName: v?.fullName,
          email: v?.email,
        };
      });
      conflicts.push({
        type: 'DUPLICATE_SERIAL',
        serialNumber: serial,
        records,
        actionRequired: 'Resolve duplicate roster serial number before production import.',
      });
    }
  }

  // Mark duplicate status on affected rows
  for (const row of validatedRows) {
    if (row.status === 'BLANK_ROW') continue;
    if (duplicateEmailRows.has(row.rowNum)) {
      row.status = 'DUPLICATE_EMAIL';
      row.issues.push(`Duplicate email address "${row.normalizedEmail}" shared with other roster records.`);
    } else if (duplicateSerialRows.has(row.rowNum)) {
      row.status = 'DUPLICATE_SERIAL';
      row.issues.push(`Duplicate roster serial number "${row.serialNumber}" shared with other records.`);
    }
  }

  const populatedRows = rawRows.length - blankRowsCount;
  const importableRows = validatedRows.filter((r) => r.status === 'VALID');
  const rowsRequiringReview = validatedRows.filter((r) => r.status !== 'VALID' && r.status !== 'BLANK_ROW');

  const invalidEmailsCount = validatedRows.filter((r) => r.status === 'INVALID_EMAIL').length;
  const validEmailsCount = importableRows.length;
  const duplicateEmailsCount = duplicateEmailRows.size;
  const duplicateSerialsCount = duplicateSerialRows.size;

  const errors: ImportRowError[] = rowsRequiringReview.map((r) => ({
    row: r.rowNum,
    identifier: r.normalizedEmail || r.email,
    serialNumber: r.serialNumber,
    reason: r.issues.join('; '),
  }));

  return {
    totalRows: rawRows.length,
    populatedRows,
    blankRows: blankRowsCount,
    validEmails: validEmailsCount,
    invalidEmails: invalidEmailsCount,
    duplicateEmails: duplicateEmailsCount,
    duplicateSerials: duplicateSerialsCount,
    importableRecords: importableRows.length,
    recordsRequiringReview: rowsRequiringReview.length,
    headers,
    mapping,
    sampleRows: rawRows.slice(0, 10),
    conflicts,
    errors,
    importableRows,
    rowsRequiringReview,
  };
}

export function buildPreview(buffer: Buffer, provided?: ColumnMapping): RosterValidationReport {
  return validateRosterBuffer(buffer, provided);
}

export interface CommitRosterOptions {
  electionId?: string;
  importedBy: string;
  fileName?: string;
  activateImmediately?: boolean;
  updateExisting?: boolean;
  mapping?: ColumnMapping;
  confirmedRowNumbers?: number[]; // optional row filter if admin explicitly resolved and excluded conflicting rows
}

export interface ImportOutcome {
  historyId: string;
  totalRows: number;
  populatedRows: number;
  blankRows: number;
  validEmails: number;
  invalidEmails: number;
  duplicateEmails: number;
  duplicateSerials: number;
  importable: number;
  requiringReview: number;
  inserted: number;
  updated: number;
  skipped: number;
  invalid: number;
  errors: ImportRowError[];
  conflicts: ImportConflict[];
}

/**
 * Stage 6: Atomic, Transactional Commit of the validated voter roster.
 * Preserves existing VERIFIED state on re-import.
 * Runs inside a MongoDB transaction for strong ACID atomicity.
 */
export async function commitRosterImport(
  buffer: Buffer,
  options: CommitRosterOptions,
): Promise<ImportOutcome> {
  const report = validateRosterBuffer(buffer, options.mapping);

  let electionObjectId: Types.ObjectId | undefined;
  if (options.electionId) {
    if (mongoose.isValidObjectId(options.electionId)) {
      electionObjectId = new Types.ObjectId(options.electionId);
    } else {
      const elec = await Election.findOne({ slug: options.electionId });
      if (elec) electionObjectId = elec._id as Types.ObjectId;
    }
  }

  // Filter rows to import: only VALID rows (or explicitly confirmed row numbers)
  const rowsToImport = report.importableRows.filter((r) => {
    if (!options.confirmedRowNumbers || options.confirmedRowNumbers.length === 0) return true;
    return options.confirmedRowNumbers.includes(r.rowNum);
  });

  const batchId = new Types.ObjectId();
  const errors: ImportRowError[] = [...report.errors];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let invalid = report.rowsRequiringReview.length;

  const executeWrites = async (session?: mongoose.ClientSession) => {
    // Pre-fetch all existing voters for this election in one fast query
    const existingVoters = await Voter.find(
      electionObjectId ? { electionId: electionObjectId } : {},
    ).session(session || null);
    const existingMap = new Map(existingVoters.map((v) => [v.normalizedEmail, v]));

    const newDocs: any[] = [];
    const savePromises: Promise<any>[] = [];

    for (const row of rowsToImport) {
      const existing = existingMap.get(row.normalizedEmail);

      if (existing) {
        if (options.updateExisting !== false) {
          existing.fullName = row.fullName || existing.fullName;
          existing.name = row.fullName || existing.name;
          if (row.serialNumber) {
            existing.rosterSerialNumber = row.serialNumber;
            existing.serialNumber = row.serialNumber;
          }
          if (row.programme) existing.programme = row.programme;
          if (row.faculty) existing.faculty = row.faculty;
          if (row.gender) existing.gender = row.gender;
          existing.importBatchId = batchId;

          // Re-import safety invariant: NEVER silently overwrite or reset VERIFIED status
          if (existing.status !== 'VERIFIED') {
            existing.status = 'PENDING';
            existing.isEligible = options.activateImmediately !== false;
          }

          savePromises.push(existing.save({ session }));
          updated += 1;
        } else {
          skipped += 1;
        }
        continue;
      }

      // New Voter creation queued for batch insertion
      newDocs.push({
        electionId: electionObjectId,
        fullName: row.fullName,
        name: row.fullName,
        email: row.email,
        normalizedEmail: row.normalizedEmail,
        rosterSerialNumber: row.serialNumber,
        serialNumber: row.serialNumber,
        programme: row.programme,
        faculty: row.faculty || FACULTY_NAME,
        gender: row.gender,
        status: 'PENDING',
        isEligible: options.activateImmediately !== false,
        isVerified: false,
        hasRegistered: false,
        importBatchId: batchId,
      });
      inserted += 1;
    }

    if (savePromises.length > 0) {
      await Promise.all(savePromises);
    }

    if (newDocs.length > 0) {
      await Voter.insertMany(newDocs, { session });
    }

    const [history] = await ImportHistory.create(
      [
        {
          _id: batchId,
          electionId: electionObjectId,
          fileName: options.fileName,
          importedBy: new Types.ObjectId(options.importedBy),
          totalRows: report.totalRows,
          populatedRows: report.populatedRows,
          blankRows: report.blankRows,
          validEmails: report.validEmails,
          invalidEmails: report.invalidEmails,
          duplicateEmails: report.duplicateEmails,
          duplicateSerials: report.duplicateSerials,
          importable: report.importableRecords,
          requiringReview: report.recordsRequiringReview,
          inserted,
          updated,
          skipped,
          invalid,
          errors: errors.slice(0, 500),
          conflicts: report.conflicts.slice(0, 100),
          activateImmediately: options.activateImmediately !== false,
          createdAt: new Date(),
        },
      ],
      { session },
    );

    return history;
  };

  let historyDoc: any;

  if (supportsTransactions()) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        historyDoc = await executeWrites(session);
      });
    } finally {
      await session.endSession();
    }
  } else {
    historyDoc = await executeWrites();
  }

  return {
    historyId: historyDoc.id,
    totalRows: report.totalRows,
    populatedRows: report.populatedRows,
    blankRows: report.blankRows,
    validEmails: report.validEmails,
    invalidEmails: report.invalidEmails,
    duplicateEmails: report.duplicateEmails,
    duplicateSerials: report.duplicateSerials,
    importable: report.importableRecords,
    requiringReview: report.recordsRequiringReview,
    inserted,
    updated,
    skipped,
    invalid,
    errors,
    conflicts: report.conflicts,
  };
}

/**
 * Backward compatibility wrapper for legacy script/test invocations
 */
export async function importStudents(
  buffer: Buffer,
  importedBy: string,
  fileName: string | undefined,
  provided: ColumnMapping | undefined,
  options: { activateImmediately: boolean; updateExisting: boolean },
): Promise<ImportOutcome> {
  return commitRosterImport(buffer, {
    importedBy,
    fileName,
    mapping: provided,
    activateImmediately: options.activateImmediately,
    updateExisting: options.updateExisting,
  });
}

/**
 * Generates a cryptographically secure random verification token for a voter.
 * The raw 256-bit token is sent in the email link, and ONLY its SHA-256 hash is stored in the DB.
 */
export function generateVerificationTokenForVoter(
  voter: VoterDoc,
  expiresMinutes = env.VERIFICATION_TOKEN_EXPIRES_MINUTES || 1440, // default 24 hours
): { rawToken: string; tokenHash: string; expiresAt: Date } {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

  voter.verificationTokenHash = tokenHash;
  voter.verificationTokenExpires = expiresAt;
  voter.verificationTokenExpiresAt = expiresAt;
  voter.verificationTokenSentAt = new Date();
  voter.verificationAttempts = (voter.verificationAttempts || 0) + 1;

  return { rawToken, tokenHash, expiresAt };
}

/**
 * Dispatches verification emails to pending accredited voters for an election.
 */
export async function sendVerificationLinksToPending(
  electionId?: string,
): Promise<{ totalPending: number; sent: number; failed: number; simulated: boolean }> {
  const query: Record<string, unknown> = {
    status: 'PENDING',
    isEligible: true,
  };
  if (electionId && mongoose.isValidObjectId(electionId)) {
    query.electionId = new Types.ObjectId(electionId);
  }

  const pendingVoters = await Voter.find(query);
  let sent = 0;
  let failed = 0;
  let simulated = false;

  for (const voter of pendingVoters) {
    try {
      const { rawToken } = generateVerificationTokenForVoter(voter);
      await voter.save();
      const res = await sendVerificationEmail(voter.email, voter.fullName, rawToken);
      if (res.success) {
        sent += 1;
        if (res.simulated) simulated = true;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return {
    totalPending: pendingVoters.length,
    sent,
    failed,
    simulated,
  };
}

/**
 * Resends verification link to a single accredited voter with rate-limiting cooldown.
 */
export async function resendVerificationLinkToVoter(
  voterId: string,
  cooldownSeconds = 60,
): Promise<{ success: boolean; maskedEmail: string; simulated: boolean }> {
  const voter = await Voter.findById(voterId).select(
    '+verificationTokenHash +verificationTokenExpires +verificationTokenSentAt',
  );
  if (!voter) throw ApiError.notFound('Voter not found');
  if (!voter.isEligible) throw ApiError.forbidden('Voter eligibility is currently revoked.');
  if (voter.status === 'VERIFIED') throw ApiError.conflict('Voter is already verified.');

  // Enforce cooldown
  if (voter.verificationTokenSentAt) {
    const elapsedSeconds = (Date.now() - voter.verificationTokenSentAt.getTime()) / 1000;
    if (elapsedSeconds < cooldownSeconds) {
      throw ApiError.tooMany(
        `Please wait ${Math.ceil(cooldownSeconds - elapsedSeconds)} seconds before resending verification.`,
      );
    }
  }

  // Regenerate token (invalidates old token hash)
  const { rawToken } = generateVerificationTokenForVoter(voter);
  await voter.save();

  const res = await sendVerificationEmail(voter.email, voter.fullName, rawToken);
  return {
    success: res.success,
    maskedEmail: maskEmail(voter.email),
    simulated: Boolean(res.simulated),
  };
}

/**
 * Verifies a voter's eligibility for registration (legacy or direct check).
 */
export async function verifyEligibility(
  identifier: string,
  email?: string,
): Promise<{ student: StudentDoc; voter: StudentDoc }> {
  const norm = normalizeIdentifier(identifier);
  const normEmail = email ? normalizeEmail(email) : '';

  if (!norm && !normEmail) {
    throw ApiError.badRequest('Please enter a valid email address or voter identifier.');
  }

  const lookup = normEmail || norm;
  const student = await Student.findOne({
    $or: [
      { normalizedEmail: lookup },
      { email: lookup },
      { serialNumber: lookup },
      { rosterSerialNumber: lookup },
      { registrationNumber: lookup.toUpperCase() },
    ],
  });

  if (!student) {
    throw ApiError.forbidden(
      'Your email or identifier is not on the AMR Club BUK accredited voter register. Please contact the AMR IEC.',
    );
  }
  if (!student.isEligible || student.status === 'REVOKED') {
    throw ApiError.forbidden(
      'Your voter eligibility is currently inactive. Please contact the AMR IEC.',
    );
  }

  if (normEmail && student.email && normalizeEmail(student.email) !== normEmail) {
    throw ApiError.badRequest(
      'The email provided does not match our records for this voter.',
    );
  }

  return { student, voter: student };
}

