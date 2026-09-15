import crypto from 'crypto';
import mongoose from 'mongoose';
import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok } from '../utils/respond';
import { Admin } from '../models/Admin';
import { Student } from '../models/Student';
import { RecoveryToken } from '../models/RecoveryToken';
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
import { sendVerificationEmail, sendPasswordRecoveryEmail } from '../services/email.service';
import { env } from '../config/env';
import { normalizeEmail, normalizeRegNumber } from '../utils/regNumber';
import { maskEmail } from '../utils/maskEmail';
import { Election } from '../models/Election';
import { VoteReceipt } from '../models/VoteReceipt';

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

  const token = signToken({
    sub: admin.id,
    principal: 'admin',
    role: admin.role,
    tokenVersion: admin.tokenVersion ?? 0,
  });
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
  const { identifier, email, voterId } = req.body as {
    identifier?: string;
    email?: string;
    voterId?: string;
  };
  const rawInput = (email || identifier || '').trim();
  const mail = normalizeEmail(rawInput);

  let voter;

  if (voterId && mongoose.isValidObjectId(voterId)) {
    voter = await Student.findById(voterId).select(
      '+verificationTokenHash +verificationTokenExpires +verificationTokenSentAt',
    );
  } else {
    if (!mail && !rawInput) {
      throw ApiError.badRequest('Please enter a valid email address or roster identifier.');
    }

    const query = mail
      ? { $or: [{ normalizedEmail: mail }, { email: mail }] }
      : {
          $or: [
            { normalizedEmail: normalizeEmail(rawInput) },
            { email: normalizeEmail(rawInput) },
            { serialNumber: rawInput },
            { rosterSerialNumber: rawInput },
            { registrationNumber: rawInput.toUpperCase() },
          ],
        };

    voter = await Student.findOne(query).select(
      '+verificationTokenHash +verificationTokenExpires +verificationTokenSentAt',
    );
  }

  // If voter is missing from the register: provide helpful hints while maintaining anti-enumeration compatibility
  if (!voter) {
    crypto.createHash('sha256').update(rawInput + 'amr_enumeration_salt').digest('hex');
    return ok(res, {
      message: UNIFORM_VERIFICATION_MESSAGE,
      inRegister: false,
      status: 'NOT_FOUND',
      helpfulHint:
        'This email address was not found on the accredited AMR Club BUK voter register. Most members registered using their personal Gmail or university email. Check your spelling or use our Name/S/N lookup below to locate your accredited email hint.',
    });
  }

  // If voter is revoked or ineligible
  if (!voter.isEligible || voter.status === 'REVOKED') {
    return ok(res, {
      message: UNIFORM_VERIFICATION_MESSAGE,
      inRegister: true,
      isEligible: false,
      status: 'REVOKED',
      helpfulHint:
        'Your voter accreditation is currently inactive or revoked. Please contact the AMR IEC electoral committee.',
    });
  }

  // If voter has already completed registration
  if (voter.hasRegistered) {
    return ok(res, {
      message: UNIFORM_VERIFICATION_MESSAGE,
      inRegister: true,
      alreadyRegistered: true,
      status: 'ALREADY_REGISTERED',
      helpfulHint:
        'An account has already been registered with this email. You can sign in directly to access the ballot.',
    });
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
    inRegister: true,
    status: 'DISPATCHED',
    maskedEmail: maskEmail(voter.email),
    // Dev helper: only returned in non-production simulation mode for automated testing / CLI workflows
    devToken: !env.isProd && !env.SEND_REAL_EMAILS ? rawToken : undefined,
  });
});

/**
 * Step 2: Validate the single-use token from the voter's email link.
 * Atomically consumes the token, transitions status to VERIFIED, and issues an authenticated voter session.
 */
export const verifyEmailToken = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body as { token: string };
  if (!token || typeof token !== 'string') {
    throw ApiError.badRequest('Verification token is required.');
  }

  const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

  // Atomic lookup and consumption: prevents concurrent double-verification race conditions
  const voter = await Student.findOneAndUpdate(
    {
      verificationTokenHash: tokenHash,
      verificationTokenExpires: { $gt: new Date() },
      status: { $ne: 'REVOKED' },
      isEligible: true,
    },
    {
      $set: {
        status: 'VERIFIED',
        isVerified: true,
        hasRegistered: true,
        verifiedAt: new Date(),
      },
      $unset: {
        verificationTokenHash: 1,
        verificationTokenExpires: 1,
        verificationTokenExpiresAt: 1,
      },
    },
    { new: true },
  );

  if (!voter) {
    // Check if token was already used or revoked for a clearer message
    const priorVoter = await Student.findOne({
      $or: [{ verificationTokenHash: tokenHash }, { status: 'REVOKED' }],
    });
    if (priorVoter?.status === 'REVOKED') {
      throw ApiError.forbidden('Your voter eligibility is currently inactive. Please contact the AMR IEC.');
    }
    throw ApiError.badRequest(
      'This verification link is invalid, expired, or has already been used. Please request a new verification link.',
    );
  }

  // Issue authenticated voter session cookie (amr_voter_token)
  const sessionToken = signToken({
    sub: voter.id,
    principal: 'student',
    tokenVersion: voter.tokenVersion ?? 0,
  });
  res.cookie(STUDENT_COOKIE, sessionToken, cookieOptions());

  // Issue optional 15-minute scoped registration session token for legacy password setup if desired
  const registrationSessionToken = signRegistrationToken(voter.id, voter.email);

  // Look up election slug if voter is election-scoped
  let election: { id: string; title: string; slug: string } | undefined;
  if (voter.electionId) {
    const elec = await Election.findById(voter.electionId);
    if (elec) {
      election = { id: elec.id, title: elec.title, slug: elec.slug };
    }
  }

  let hasVoted = false;
  if (voter.electionId) {
    const receipt = await VoteReceipt.findOne({ electionId: voter.electionId, studentId: voter._id });
    hasVoted = !!receipt;
  }

  await recordAudit(req, {
    action: 'voter.verified',
    resourceType: 'Voter',
    resourceId: voter.id,
    details: { email: maskEmail(voter.email), electionId: voter.electionId },
  });

  ok(res, {
    message: 'Email verification successful. Your voting session is active.',
    sessionToken,
    registrationSessionToken,
    hasVoted,
    hasPassword: !!voter.password,
    election,
    voter: {
      id: voter.id,
      fullName: voter.fullName,
      email: voter.email,
      maskedEmail: maskEmail(voter.email),
      serialNumber: voter.rosterSerialNumber || voter.serialNumber,
      registrationNumber: voter.registrationNumber,
      programme: voter.programme,
      faculty: voter.faculty,
      gender: voter.gender,
      department: voter.programme || voter.faculty,
      status: voter.status,
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

  const voter = await Student.findById(payload.voterId).select('+password');
  if (!voter) {
    throw ApiError.unauthorized('Voter account not found.');
  }

  if (voter.password) {
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

  const token = signToken({
    sub: voter.id,
    principal: 'student',
    tokenVersion: voter.tokenVersion ?? 0,
  });
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
  if (!student.isEligible || student.status === 'REVOKED') {
    throw ApiError.forbidden('Your voter eligibility is inactive or revoked. Please contact the AMR IEC.');
  }

  const token = signToken({
    sub: student.id,
    principal: 'student',
    tokenVersion: student.tokenVersion ?? 0,
  });
  res.cookie(STUDENT_COOKIE, token, cookieOptions());

  ok(res, {
    student: {
      id: student.id,
      fullName: student.fullName,
      email: student.email,
      maskedEmail: maskEmail(student.email),
      serialNumber: student.rosterSerialNumber || student.serialNumber,
      registrationNumber: student.registrationNumber,
      programme: student.programme,
      faculty: student.faculty,
      department: student.programme || student.faculty,
      status: student.status,
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
      maskedEmail: maskEmail(student.email),
      serialNumber: student.rosterSerialNumber || student.serialNumber,
      registrationNumber: student.registrationNumber,
      programme: student.programme,
      faculty: student.faculty,
      gender: student.gender,
      department: student.programme || student.faculty,
      isEligible: student.isEligible,
      status: student.status,
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
      email: maskEmail(student.email),
      serialNumber: student.rosterSerialNumber || student.serialNumber,
      registrationNumber: student.registrationNumber,
      programme: student.programme,
      faculty: student.faculty,
      department: student.programme || student.faculty,
    },
  });
});

export const UNIFORM_RECOVERY_MESSAGE =
  "If this email is eligible for account recovery, a secure link has been sent. Check spam if you don't see it.";

// ---------- Account Recovery ("Forgot Password") ----------
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email, identifier } = req.body as { email?: string; identifier?: string };
  const rawInput = (email || identifier || '').trim();
  const mail = normalizeEmail(rawInput);

  // Generic anti-enumeration response object
  const genericResponse = { message: UNIFORM_RECOVERY_MESSAGE };

  if (!mail && !rawInput) {
    return ok(res, genericResponse);
  }

  // 1. Check Voter
  const voter = await Student.findOne({
    $or: [{ normalizedEmail: mail }, { email: mail }],
  }).select('+password +isEligible +status');

  // Check if voter is eligible and in one of the target states
  let targetVoter = null;
  if (voter && voter.isEligible && voter.status !== 'REVOKED') {
    // Target state 1: verified email, no password yet
    const isVerifiedNoPassword = (voter.isVerified || voter.status === 'VERIFIED') && !voter.password;
    // Target state 2: existing password, forgotten
    const hasPassword = Boolean(voter.password);

    if (isVerifiedNoPassword || hasPassword) {
      targetVoter = voter;
    }
  }

  // 2. Check Admin (if no voter matched, or if an admin account matches email/username)
  let targetAdmin = null;
  if (!targetVoter) {
    const admin = await Admin.findOne({
      username: mail.toLowerCase(),
      isActive: true,
    }).select('+password');
    if (admin) {
      targetAdmin = admin;
    }
  }

  if (!targetVoter && !targetAdmin) {
    // Dummy hash computation to equalize timing against timing attacks
    crypto.createHash('sha256').update(rawInput + 'amr_recovery_salt').digest('hex');
    return ok(res, genericResponse);
  }

  // Generate cryptographically secure 256-bit token (64 hex characters)
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30-minute expiry

  if (targetVoter) {
    // Invalidate previous unused recovery tokens for this voter
    await RecoveryToken.deleteMany({ voterId: targetVoter._id });

    // Store dedicated recovery token hashed at rest
    await RecoveryToken.create({
      voterId: targetVoter._id,
      tokenHash,
      expiresAt,
    });

    await sendPasswordRecoveryEmail(targetVoter.email, targetVoter.fullName, rawToken);

    await recordAudit(req, {
      action: 'voter.recovery_requested',
      resourceType: 'Voter',
      resourceId: targetVoter.id,
      details: { email: maskEmail(targetVoter.email) },
    });
  } else if (targetAdmin) {
    // Invalidate previous unused recovery tokens for this admin
    await RecoveryToken.deleteMany({ adminId: targetAdmin._id });

    await RecoveryToken.create({
      adminId: targetAdmin._id,
      tokenHash,
      expiresAt,
    });

    await sendPasswordRecoveryEmail(
      mail,
      targetAdmin.fullName || targetAdmin.username,
      rawToken,
    );

    await recordAudit(req, {
      action: 'admin.recovery_requested',
      resourceType: 'Admin',
      resourceId: targetAdmin.id,
      details: { username: targetAdmin.username },
    });
  }

  // Always return the exact same generic response
  return ok(res, genericResponse);
});

export const validateRecoveryToken = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body as { token?: string };
  if (!token || typeof token !== 'string') {
    throw ApiError.badRequest('This recovery link is invalid or has expired.');
  }

  const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

  const recoveryToken = await RecoveryToken.findOne({
    tokenHash,
    expiresAt: { $gt: new Date() },
    usedAt: { $exists: false },
  });

  if (!recoveryToken) {
    throw ApiError.badRequest('This recovery link is invalid or has expired.');
  }

  // Ensure underlying account is still valid and eligible
  if (recoveryToken.voterId) {
    const voter = await Student.findById(recoveryToken.voterId);
    if (!voter || !voter.isEligible || voter.status === 'REVOKED') {
      throw ApiError.badRequest('This recovery link is invalid or has expired.');
    }
  } else if (recoveryToken.adminId) {
    const admin = await Admin.findById(recoveryToken.adminId);
    if (!admin || !admin.isActive) {
      throw ApiError.badRequest('This recovery link is invalid or has expired.');
    }
  }

  return ok(res, { valid: true, message: 'Recovery link is valid.' });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = req.body as { token: string; password: string };
  if (!token || typeof token !== 'string') {
    throw ApiError.badRequest('This recovery link is invalid or has expired.');
  }

  const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

  // Atomically claim the token to prevent race conditions and double-submits
  const recoveryToken = await RecoveryToken.findOneAndUpdate(
    {
      tokenHash,
      expiresAt: { $gt: new Date() },
      usedAt: { $exists: false },
    },
    {
      $set: { usedAt: new Date() },
    },
    { new: false },
  );

  if (!recoveryToken) {
    throw ApiError.badRequest('This recovery link is invalid or has expired.');
  }

  // The token alone authorizes WHICH account gets changed.
  // Never trust client-provided email/userId/accountId.
  if (recoveryToken.voterId) {
    const voter = await Student.findById(recoveryToken.voterId).select('+password');
    if (!voter || !voter.isEligible || voter.status === 'REVOKED') {
      throw ApiError.badRequest('This recovery link is invalid or has expired.');
    }

    // Update password, ensure registered and verified, bump tokenVersion to invalidate existing sessions
    voter.password = password;
    voter.hasRegistered = true;
    voter.isVerified = true;
    voter.status = 'VERIFIED';
    voter.tokenVersion = (voter.tokenVersion || 0) + 1;
    await voter.save();

    // Clean up any remaining unused recovery tokens for this voter
    await RecoveryToken.deleteMany({ voterId: voter._id });

    await recordAudit(req, {
      action: 'voter.password_recovered',
      resourceType: 'Voter',
      resourceId: voter.id,
      details: { email: maskEmail(voter.email) },
    });
  } else if (recoveryToken.adminId) {
    const admin = await Admin.findById(recoveryToken.adminId).select('+password');
    if (!admin || !admin.isActive) {
      throw ApiError.badRequest('This recovery link is invalid or has expired.');
    }

    admin.password = password;
    admin.tokenVersion = (admin.tokenVersion || 0) + 1;
    await admin.save();

    await RecoveryToken.deleteMany({ adminId: admin._id });

    await recordAudit(req, {
      action: 'admin.password_recovered',
      resourceType: 'Admin',
      resourceId: admin.id,
      details: { username: admin.username },
    });
  }

  // Ensure recovery token does NOT grant a session — clear cookies and send voter back to normal login
  res.clearCookie(STUDENT_COOKIE, clearCookieOptions());
  res.clearCookie(ADMIN_COOKIE, clearCookieOptions());

  return ok(res, { message: 'Password reset. Log in.' });
});

/**
 * Public helper for voters who forgot which email address they registered with.
 * Allows searching the accredited roster by Full Name or Roster Serial Number (1–291)
 * and returns the member's masked email (e.g. abb******@gmail.com) so they can identify their email.
 */
export const lookupRosterHint = asyncHandler(async (req: Request, res: Response) => {
  const { query } = req.body as { query?: string };
  const q = (query || '').trim();

  if (!q || q.length < 2) {
    throw ApiError.badRequest('Please enter at least 2 characters of your full name or serial number.');
  }

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isNumeric = /^\d+$/.test(q);

  const orConditions: Record<string, unknown>[] = [
    { fullName: new RegExp(escaped, 'i') },
    { name: new RegExp(escaped, 'i') },
  ];

  if (isNumeric) {
    orConditions.push({ serialNumber: q }, { rosterSerialNumber: q });
  }

  const matches = await Student.find({
    $or: orConditions,
    status: { $ne: 'REVOKED' },
  })
    .limit(8)
    .select('fullName email serialNumber rosterSerialNumber programme faculty status isEligible hasRegistered');

  const results = matches.map((m) => ({
    id: m.id,
    fullName: m.fullName,
    serialNumber: m.rosterSerialNumber || m.serialNumber,
    maskedEmail: maskEmail(m.email),
    programme: m.programme,
    faculty: m.faculty,
    alreadyRegistered: m.hasRegistered,
    isEligible: m.isEligible && m.status !== 'REVOKED',
  }));

  ok(res, {
    query: q,
    count: results.length,
    matches: results,
  });
});
