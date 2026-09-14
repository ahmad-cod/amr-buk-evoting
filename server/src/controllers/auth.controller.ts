import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok } from '../utils/respond';
import { Admin } from '../models/Admin';
import { Student } from '../models/Student';
import {
  ADMIN_COOKIE,
  STUDENT_COOKIE,
  cookieOptions,
  clearCookieOptions,
  signToken,
  signRegistrationToken,
  verifyRegistrationToken,
} from '../utils/jwt';
import { recordAudit } from '../services/audit.service';
import { verifyEligibility } from '../services/student.service';
import { sendVerificationEmail } from '../services/email.service';
import { env } from '../config/env';
import { normalizeEmail, normalizeRegNumber } from '../utils/regNumber';

// ---------- Admin ----------
export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = req.body as { username: string; password: string };
  const admin = await Admin.findOne({ username: username.toLowerCase().trim() }).select('+password');

  // Constant-ish failure path — same message whether user missing or wrong password.
  if (!admin || !admin.isActive || !(await admin.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid username or password');
  }

  admin.lastLoginAt = new Date();
  await admin.save();

  const token = signToken({ sub: admin.id, principal: 'admin', role: admin.role });
  res.cookie(ADMIN_COOKIE, token, cookieOptions());

  await recordAudit(
    { ...req, admin: { id: admin.id, username: admin.username, role: admin.role } } as Request,
    { action: 'admin.login', resourceType: 'Admin', resourceId: admin.id },
  );

  ok(res, {
    admin: { id: admin.id, username: admin.username, fullName: admin.fullName, role: admin.role },
  });
});

export const adminLogout = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie(ADMIN_COOKIE, clearCookieOptions());
  ok(res, { message: 'Signed out' });
});

export const adminMe = asyncHandler(async (req: Request, res: Response) => {
  const admin = await Admin.findById(req.admin!.id);
  if (!admin) throw ApiError.unauthorized();
  ok(res, {
    admin: { id: admin.id, username: admin.username, fullName: admin.fullName, role: admin.role },
  });
});

// ---------- Student / Voter Email Verification & Registration ----------

export const UNIFORM_VERIFICATION_MESSAGE =
  'If this email address is on the approved AMR Club BUK voter register and has not yet completed registration, a secure verification link has been sent to your inbox. Please check your spam/junk folder if you do not see it within a few minutes.';

/**
 * Step 1: Request a secure verification link sent to an accredited roster email.
 * Anti-enumeration: returns identical success response regardless of roster presence or registration state.
 */
export const requestVerification = asyncHandler(async (req: Request, res: Response) => {
  const { identifier, email } = req.body as { identifier?: string; email?: string };
  const rawInput = (email || identifier || '').trim();
  const mail = normalizeEmail(rawInput);

  if (!mail && !rawInput) {
    throw ApiError.badRequest('Please enter a valid email address.');
  }

  const query = mail
    ? { email: mail }
    : { $or: [{ email: normalizeEmail(rawInput) }, { serialNumber: rawInput }, { registrationNumber: rawInput.toUpperCase() }] };

  const voter = await Student.findOne(query).select(
    '+verificationTokenHash +verificationTokenExpires +verificationTokenSentAt',
  );

  // Anti-enumeration: if voter is missing, ineligible, or already registered,
  // perform a constant dummy hash calculation and return the identical success message.
  if (!voter || !voter.isEligible || voter.hasRegistered) {
    crypto.createHash('sha256').update(rawInput + 'amr_enumeration_salt').digest('hex');
    return ok(res, { message: UNIFORM_VERIFICATION_MESSAGE });
  }

  // Rate-limit resend: minimum 60-second cooldown between verification link dispatches for the same account
  if (voter.verificationTokenSentAt) {
    const elapsedSeconds = (Date.now() - voter.verificationTokenSentAt.getTime()) / 1000;
    if (elapsedSeconds < 60) {
      throw ApiError.tooMany(
        `Please wait ${Math.ceil(60 - elapsedSeconds)} seconds before requesting another verification email.`,
      );
    }
  }

  // Generate a cryptographically secure 256-bit random token (64 hex characters)
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresMinutes = env.VERIFICATION_TOKEN_EXPIRES_MINUTES || 15;

  voter.verificationTokenHash = tokenHash;
  voter.verificationTokenExpires = new Date(Date.now() + expiresMinutes * 60 * 1000);
  voter.verificationTokenSentAt = new Date();
  await voter.save();

  await sendVerificationEmail(voter.email, voter.fullName, rawToken);

  return ok(res, {
    message: UNIFORM_VERIFICATION_MESSAGE,
    // Dev helper: only returned in non-production simulation mode for automated testing / CLI workflows
    devToken: !env.isProd && !env.SEND_REAL_EMAILS ? rawToken : undefined,
  });
});

/**
 * Step 2: Validate the single-use token from the voter's email link.
 * Consumes the token immediately and issues a short-lived pre-auth registration session token.
 */
export const verifyEmailToken = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body as { token: string };
  if (!token || typeof token !== 'string') {
    throw ApiError.badRequest('Verification token is required.');
  }

  const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

  const voter = await Student.findOne({
    verificationTokenHash: tokenHash,
    verificationTokenExpires: { $gt: new Date() },
  }).select('+verificationTokenHash +verificationTokenExpires');

  if (!voter) {
    throw ApiError.badRequest(
      'This verification link is invalid, expired, or has already been used. Please request a new verification link.',
    );
  }

  if (voter.hasRegistered) {
    throw ApiError.conflict('An account has already been registered for this voter. Please sign in.');
  }

  if (!voter.isEligible) {
    throw ApiError.forbidden('Your voter eligibility is currently inactive. Please contact the AMR IEC.');
  }

  // Single-use guarantee: consume token immediately to prevent reuse or replay
  voter.verificationTokenHash = undefined;
  voter.verificationTokenExpires = undefined;
  await voter.save();

  // Issue a 15-minute scoped registration session token bound to this specific voter ID & email
  const registrationSessionToken = signRegistrationToken(voter.id, voter.email);

  ok(res, {
    registrationSessionToken,
    voter: {
      id: voter.id,
      fullName: voter.fullName,
      email: voter.email,
      serialNumber: voter.serialNumber,
      registrationNumber: voter.registrationNumber,
      programme: voter.programme,
      faculty: voter.faculty,
      gender: voter.gender,
      department: voter.programme || voter.faculty,
    },
  });
});

/**
 * Step 3: Complete registration and set voter password.
 * Strictly requires a valid pre-auth registrationSessionToken from step 2.
 */
export const completeRegistration = asyncHandler(async (req: Request, res: Response) => {
  const { registrationSessionToken, password } = req.body as {
    registrationSessionToken: string;
    password: string;
  };

  if (!registrationSessionToken) {
    throw ApiError.unauthorized('Registration session token is required.');
  }

  let payload;
  try {
    payload = verifyRegistrationToken(registrationSessionToken);
  } catch {
    throw ApiError.unauthorized(
      'Your registration session has expired or is invalid. Please request a new verification link.',
    );
  }

  const voter = await Student.findById(payload.voterId);
  if (!voter) {
    throw ApiError.unauthorized('Voter account not found.');
  }

  if (voter.hasRegistered) {
    throw ApiError.conflict('An account already exists for this voter. Please sign in.');
  }

  if (!voter.isEligible) {
    throw ApiError.forbidden('Your voter eligibility is currently inactive. Please contact the AMR IEC.');
  }

  // Cryptographic binding check: session email must match voter record
  if (normalizeEmail(voter.email) !== normalizeEmail(payload.email)) {
    throw ApiError.forbidden('Verification session does not match voter record.');
  }

  voter.password = password;
  voter.hasRegistered = true;
  voter.isVerified = true;
  voter.verificationTokenHash = undefined;
  voter.verificationTokenExpires = undefined;
  await voter.save();

  const token = signToken({ sub: voter.id, principal: 'student' });
  res.cookie(STUDENT_COOKIE, token, cookieOptions());

  ok(
    res,
    {
      student: {
        id: voter.id,
        fullName: voter.fullName,
        email: voter.email,
        serialNumber: voter.serialNumber,
        registrationNumber: voter.registrationNumber,
        programme: voter.programme,
        faculty: voter.faculty,
        gender: voter.gender,
        department: voter.programme || voter.faculty,
      },
    },
    201,
  );
});

/**
 * Legacy registration endpoint wrapper:
 * Forwards requests with registrationSessionToken to completeRegistration.
 * Rejects unverified direct registration attempts to close the account-takeover hole.
 */
export const studentRegister = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  if (req.body.registrationSessionToken) {
    return completeRegistration(req, res, next);
  }

  throw ApiError.forbidden(
    'Direct registration without email verification is disabled for security. Please request a verification link at /register.',
  );
});

export const studentLogin = asyncHandler(async (req: Request, res: Response) => {
  const { identifier, password } = req.body as { identifier: string; password: string };
  const value = identifier.trim();

  const query = value.includes('@')
    ? { email: normalizeEmail(value) }
    : {
        $or: [
          { email: normalizeEmail(value) },
          { serialNumber: value },
          { registrationNumber: normalizeRegNumber(value) },
        ],
      };

  const student = await Student.findOne(query).select('+password');
  if (!student || !student.hasRegistered || !(await student.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid credentials');
  }
  if (!student.isEligible) {
    throw ApiError.forbidden('Your voter eligibility is inactive. Please contact the AMR IEC.');
  }

  const token = signToken({ sub: student.id, principal: 'student' });
  res.cookie(STUDENT_COOKIE, token, cookieOptions());

  ok(res, {
    student: {
      id: student.id,
      fullName: student.fullName,
      email: student.email,
      serialNumber: student.serialNumber,
      registrationNumber: student.registrationNumber,
      programme: student.programme,
      faculty: student.faculty,
      department: student.programme || student.faculty,
    },
  });
});

export const studentLogout = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie(STUDENT_COOKIE, clearCookieOptions());
  ok(res, { message: 'Signed out' });
});

export const studentMe = asyncHandler(async (req: Request, res: Response) => {
  const student = await Student.findById(req.student!.id);
  if (!student) throw ApiError.unauthorized();
  ok(res, {
    student: {
      id: student.id,
      fullName: student.fullName,
      email: student.email,
      serialNumber: student.serialNumber,
      registrationNumber: student.registrationNumber,
      programme: student.programme,
      faculty: student.faculty,
      gender: student.gender,
      department: student.programme || student.faculty,
      isEligible: student.isEligible,
    },
  });
});

// Public: check eligibility (used on the registration page before submitting).
export const checkEligibility = asyncHandler(async (req: Request, res: Response) => {
  const { registrationNumber, email, identifier } = req.body as {
    registrationNumber?: string;
    email?: string;
    identifier?: string;
  };
  const lookup = email || identifier || registrationNumber || '';
  const { student } = await verifyEligibility(lookup, email);
  ok(res, {
    eligible: true,
    alreadyRegistered: student.hasRegistered,
    student: {
      fullName: student.fullName,
      email: student.email,
      serialNumber: student.serialNumber,
      registrationNumber: student.registrationNumber,
      programme: student.programme,
      faculty: student.faculty,
      department: student.programme || student.faculty,
    },
  });
});

// ---------- Password reset (token returned in dev; email out of scope) ----------
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { identifier } = req.body as { identifier: string };
  const value = identifier.trim();
  const query = value.includes('@')
    ? { email: normalizeEmail(value) }
    : {
        $or: [
          { email: normalizeEmail(value) },
          { serialNumber: value },
          { registrationNumber: normalizeRegNumber(value) },
        ],
      };

  const student = await Student.findOne(query);

  // Always respond the same way to avoid leaking which accounts exist.
  const genericResponse = {
    message: 'If an account exists, password reset instructions have been generated.',
  };

  if (!student || !student.hasRegistered) {
    return ok(res, genericResponse);
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  student.resetTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  student.resetTokenExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 min
  await student.save();

  // In production, email `rawToken` as a link. For local dev we return it directly.
  return ok(res, {
    ...genericResponse,
    devResetToken: process.env.NODE_ENV === 'production' ? undefined : rawToken,
  });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = req.body as { token: string; password: string };
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const student = await Student.findOne({
    resetTokenHash: tokenHash,
    resetTokenExpires: { $gt: new Date() },
  }).select('+resetTokenHash +resetTokenExpires');

  if (!student) throw ApiError.badRequest('This reset link is invalid or has expired');

  student.password = password;
  student.resetTokenHash = undefined;
  student.resetTokenExpires = undefined;
  await student.save();

  ok(res, { message: 'Your password has been reset. You can now sign in.' });
});
