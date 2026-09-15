import { z } from 'zod';
import { ELECTION_STATUS, CANDIDATE_STATUS, ROLES } from '../config/constants';

const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

// ---- Auth ----
export const adminLoginSchema = z.object({
  username: z.string().min(1, 'Username is required').max(60),
  password: z.string().min(1, 'Password is required').max(128),
});

export const requestVerificationSchema = z
  .object({
    email: z.string().email('Enter a valid email address').optional(),
    identifier: z.string().optional(),
  })
  .refine((d) => Boolean(d.email || d.identifier), {
    message: 'Enter your accredited email address or identifier',
  });

export const verifyEmailTokenSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

export const completeRegistrationSchema = z
  .object({
    registrationSessionToken: z.string().min(1, 'Registration session token is required'),
    password,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const studentRegisterSchema = z
  .object({
    registrationSessionToken: z.string().optional(),
    email: z.string().email('Enter a valid email address').optional(),
    registrationNumber: z.string().optional(),
    identifier: z.string().optional(),
    fullName: z.string().optional(),
    password,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const studentLoginSchema = z.object({
  identifier: z.string().min(1, 'Enter your email address or voter identifier'),
  password: z.string().min(1, 'Password is required'),
});

export const verifyEligibilitySchema = z
  .object({
    identifier: z.string().optional(),
    registrationNumber: z.string().optional(),
    email: z.string().optional(),
  })
  .refine((d) => Boolean(d.identifier || d.registrationNumber || d.email), {
    message: 'Enter your email address or voter identifier',
  });

export const forgotPasswordSchema = z
  .object({
    email: z.string().optional(),
    identifier: z.string().optional(),
  })
  .refine((d) => Boolean((d.email && d.email.trim()) || (d.identifier && d.identifier.trim())), {
    message: 'Enter your email address or voter identifier',
  });

export const validateRecoveryTokenSchema = z.object({
  token: z.string().min(1, 'Recovery token is required'),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Recovery token is required'),
    password,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// ---- Admin management ----
export const createAdminSchema = z.object({
  username: z.string().min(3).max(40),
  fullName: z.string().max(120).optional(),
  password,
  role: z.enum([ROLES.SUPER_ADMIN, ROLES.ELECTION_ADMIN]).default(ROLES.ELECTION_ADMIN),
});

export const updateAdminSchema = z.object({
  fullName: z.string().max(120).optional(),
  password: password.optional(),
  role: z.enum([ROLES.SUPER_ADMIN, ROLES.ELECTION_ADMIN]).optional(),
  isActive: z.boolean().optional(),
});

// ---- Elections ----
const isoDate = z.coerce.date();

export const createElectionSchema = z
  .object({
    title: z.string().min(3).max(160),
    slug: z.string().max(80).optional(),
    description: z.string().max(5000).optional(),
    startDateTime: isoDate,
    endDateTime: isoDate,
    instructions: z.string().max(5000).optional(),
    eligibleDepartments: z.array(z.string()).optional().default([]),
    registrationEnabled: z.boolean().optional(),
    votingEnabled: z.boolean().optional(),
    liveResultsEnabled: z.boolean().optional(),
    requireCandidateApproval: z.boolean().optional(),
    seedDefaultPositions: z.boolean().optional().default(false),
  })
  .refine((d) => d.endDateTime > d.startDateTime, {
    message: 'End date/time must be after start date/time',
    path: ['endDateTime'],
  });

export const updateElectionSchema = z.object({
  title: z.string().min(3).max(160).optional(),
  slug: z.string().max(80).optional(),
  description: z.string().max(5000).optional(),
  startDateTime: isoDate.optional(),
  endDateTime: isoDate.optional(),
  status: z.enum(Object.values(ELECTION_STATUS) as [string, ...string[]]).optional(),
  instructions: z.string().max(5000).optional(),
  eligibleDepartments: z.array(z.string()).optional(),
  registrationEnabled: z.boolean().optional(),
  votingEnabled: z.boolean().optional(),
  liveResultsEnabled: z.boolean().optional(),
  finalResultsPublished: z.boolean().optional(),
  requireCandidateApproval: z.boolean().optional(),
});

// ---- Positions ----
export const createPositionSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(1000).optional(),
  displayOrder: z.number().int().min(0).optional(),
  maxCandidates: z.number().int().min(1).max(100).optional(),
  maxVotesPerVoter: z.number().int().min(1).max(20).optional(),
  isActive: z.boolean().optional(),
});

export const updatePositionSchema = createPositionSchema.partial();

export const seedPositionsSchema = z.object({
  titles: z.array(z.string().min(2)).optional(),
});

// ---- Candidates ----
export const createCandidateSchema = z.object({
  positionId: objectId,
  fullName: z.string().min(2).max(160),
  faculty: z.string().optional(),
  department: z.string().optional(),
  programme: z.string().optional(),
  level: z.string().optional(),
  bio: z.string().max(3000).optional(),
  manifesto: z.string().max(8000).optional(),
  campaignSlogan: z.string().max(200).optional(),
  displayOrder: z.number().int().min(0).optional(),
  status: z.enum(Object.values(CANDIDATE_STATUS) as [string, ...string[]]).optional(),
});

export const updateCandidateSchema = createCandidateSchema.partial();

// ---- Voting ----
export const castVoteSchema = z.object({
  idempotencyKey: z.string().min(6).max(64).optional(),
  selections: z
    .array(
      z.object({
        positionId: objectId,
        candidateIds: z.array(objectId).min(1),
      }),
    )
    .min(1, 'Your ballot is empty'),
});

export const historicalVoteAdjustmentSchema = z.object({
  amount: z.number().int().positive().max(1000000),
  reason: z.string().trim().min(10).max(2000),
  authorizedBy: z.string().trim().min(3).max(200),
  metadata: z.record(z.unknown()).optional(),
});

// ---- Voter import / eligibility ----
export const importOptionsSchema = z.object({
  activateImmediately: z.coerce.boolean().optional().default(true),
  updateExisting: z.coerce.boolean().optional().default(true),
  mapping: z
    .object({
      serialNumber: z.string().optional(),
      fullName: z.string().optional(),
      email: z.string().optional(),
      gender: z.string().optional(),
      programme: z.string().optional(),
      faculty: z.string().optional(),
      registrationNumber: z.string().optional(),
      department: z.string().optional(),
      level: z.string().optional(),
      phone: z.string().optional(),
    })
    .optional(),
});

export const eligibilityToggleSchema = z.object({
  isEligible: z.boolean(),
});

// ---- Common list query ----
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  status: z.string().optional(),
  department: z.string().optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;
