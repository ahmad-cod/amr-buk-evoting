import { parse } from 'csv-parse/sync';
import { Types } from 'mongoose';
import { Student, StudentDoc } from '../models/Student';
import { ImportHistory, ImportRowError } from '../models/ImportHistory';
import { FACULTY_NAME } from '../config/constants';
import {
  isValidEmailFormat,
  normalizeEmail,
  normalizeRegNumber,
  normalizeIdentifier,
} from '../utils/regNumber';
import { ApiError } from '../utils/ApiError';

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

// Header aliases -> canonical field. Matched case-insensitively, ignoring spaces.
const HEADER_ALIASES: Record<keyof ColumnMapping, string[]> = {
  serialNumber: ['sn', 'sno', 'serialnumber', 'serial', 'no', 'number'],
  fullName: ['fullname', 'name', 'votername', 'studentname', 'membername', 'candidatesname'],
  email: ['email', 'emailaddress', 'mail', 'voteremail'],
  gender: ['gender', 'sex'],
  programme: ['programme', 'program', 'course'],
  department: ['department', 'dept'],
  faculty: ['faculty', 'college', 'school'],
  registrationNumber: ['registrationnumber', 'regnumber', 'regno', 'matricnumber', 'registration'],
  phone: ['phonenumber', 'phone', 'mobile', 'telephone'],
  level: ['level', 'yearofstudy', 'year'],
};

const canon = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function resolveMapping(headers: string[], provided?: ColumnMapping): ColumnMapping {
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

export interface ParsedPreview {
  headers: string[];
  mapping: ColumnMapping;
  sampleRows: Record<string, string>[];
  totalRows: number;
}

export function parseCsvBuffer(buffer: Buffer): Record<string, string>[] {
  try {
    return parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
    }) as Record<string, string>[];
  } catch (err) {
    throw ApiError.badRequest('Could not parse CSV file. Ensure it is a valid CSV.');
  }
}

export function buildPreview(buffer: Buffer, provided?: ColumnMapping): ParsedPreview {
  const rows = parseCsvBuffer(buffer);
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const mapping = resolveMapping(headers, provided);
  return {
    headers,
    mapping,
    sampleRows: rows.slice(0, 10),
    totalRows: rows.length,
  };
}

export interface ImportOutcome {
  historyId: string;
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: number;
  invalid: number;
  errors: ImportRowError[];
}

interface ImportOptions {
  activateImmediately: boolean;
  updateExisting: boolean; // update dept/level/email on already-imported reg numbers
}

/**
 * Validates and imports accredited AMR Club BUK voter records from CSV.
 * Email is the primary unique identifier for voter authentication.
 */
export async function importStudents(
  buffer: Buffer,
  importedBy: string,
  fileName: string | undefined,
  provided: ColumnMapping | undefined,
  options: ImportOptions,
): Promise<ImportOutcome> {
  const rows = parseCsvBuffer(buffer);
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const mapping = resolveMapping(headers, provided);

  if (!mapping.email && !mapping.registrationNumber) {
    throw ApiError.badRequest(
      'Could not find an email or identifier column in the CSV. Provide a column mapping.',
    );
  }

  const batchId = new Types.ObjectId();
  const errors: ImportRowError[] = [];
  const seenInFile = new Set<string>();

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let invalid = 0;

  const get = (row: Record<string, string>, col?: string) =>
    col && row[col] !== undefined ? String(row[col]).trim() : '';

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNum = i + 2; // account for header line

    const rawEmail = get(row, mapping.email);
    const email = normalizeEmail(rawEmail);
    const rawReg = get(row, mapping.registrationNumber);
    const reg = normalizeRegNumber(rawReg);

    const primaryKey = email || reg;
    if (!primaryKey) {
      invalid += 1;
      errors.push({ row: rowNum, reason: 'Missing email address or voter identifier' });
      continue;
    }

    if (email && !isValidEmailFormat(email)) {
      invalid += 1;
      errors.push({ row: rowNum, identifier: email, reason: 'Invalid email address format' });
      continue;
    }

    if (seenInFile.has(primaryKey)) {
      skipped += 1;
      errors.push({ row: rowNum, identifier: primaryKey, reason: 'Duplicate within file' });
      continue;
    }
    seenInFile.add(primaryKey);

    const fullName = get(row, mapping.fullName) || 'AMR Club Member';
    const serialNumber = get(row, mapping.serialNumber);
    const gender = get(row, mapping.gender);
    const programme = get(row, mapping.programme) || get(row, mapping.department);
    const faculty = get(row, mapping.faculty) || FACULTY_NAME;

    const query: Record<string, unknown> = email ? { email } : { registrationNumber: reg };
    const existing = await Student.findOne(query);

    if (existing) {
      if (options.updateExisting) {
        if (fullName) existing.fullName = fullName;
        if (email) existing.email = email;
        if (serialNumber) existing.serialNumber = serialNumber;
        if (programme) existing.programme = programme;
        if (faculty) existing.faculty = faculty;
        if (gender) existing.gender = gender;
        existing.importBatchId = batchId;
        try {
          await existing.save();
          updated += 1;
        } catch (e) {
          invalid += 1;
          errors.push({ row: rowNum, identifier: primaryKey, reason: 'Update failed (duplicate email or DB error)' });
        }
      } else {
        skipped += 1;
      }
      continue;
    }

    try {
      await Student.create({
        fullName,
        email: email || `${primaryKey.toLowerCase()}@amrclub.buk.edu.ng`,
        serialNumber: serialNumber || undefined,
        programme: programme || undefined,
        faculty: faculty || undefined,
        gender: gender || undefined,
        isEligible: options.activateImmediately,
        isVerified: true,
        hasRegistered: false,
        importBatchId: batchId,
      });
      inserted += 1;
    } catch (e) {
      invalid += 1;
      errors.push({
        row: rowNum,
        identifier: primaryKey,
        reason: 'Could not insert record into database',
      });
    }
  }

  const history = await ImportHistory.create({
    _id: batchId,
    fileName,
    importedBy,
    totalRows: rows.length,
    inserted,
    updated,
    skipped,
    invalid,
    errors: errors.slice(0, 500),
    activateImmediately: options.activateImmediately,
  });

  return {
    historyId: history.id,
    totalRows: rows.length,
    inserted,
    updated,
    skipped,
    invalid,
    errors,
  };
}

/**
 * Verifies a voter's eligibility for registration.
 * Looks up by email, serial number, or registration number.
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
      { email: lookup },
      { serialNumber: lookup },
      { registrationNumber: lookup.toUpperCase() },
    ],
  });

  if (!student) {
    throw ApiError.forbidden(
      'Your email or identifier is not on the AMR Club BUK accredited voter register. Please contact the AMR IEC.',
    );
  }
  if (!student.isEligible) {
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
