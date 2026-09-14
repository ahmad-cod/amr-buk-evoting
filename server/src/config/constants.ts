export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ELECTION_ADMIN: 'election_admin',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ELECTION_STATUS = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  PAUSED: 'paused',
  CLOSED: 'closed',
  ARCHIVED: 'archived',
} as const;

export type ElectionStatus = (typeof ELECTION_STATUS)[keyof typeof ELECTION_STATUS];

export const CANDIDATE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
} as const;

export type CandidateStatus = (typeof CANDIDATE_STATUS)[keyof typeof CANDIDATE_STATUS];

export const ORGANIZATION_NAME = 'Antimicrobial Resistance (AMR) Club, Bayero University Kano';
export const ORGANIZATION_SHORT_NAME = 'AMR Club BUK';
export const ELECTORAL_COMMITTEE_NAME = 'AMR Independent Electoral Committee (AMR IEC)';
export const FACULTY_NAME = 'Bayero University Kano';
export const DEFAULT_TIMEZONE = 'Africa/Lagos';

export const DEFAULT_POSITIONS = [
  'President',
  'Vice President',
  'Secretary-General',
  'Assistant Secretary-General',
  'Financial Secretary',
  'Treasurer',
  'Director of Programs and Outreach',
  'Deputy Director of Programs and Outreach',
  'Public Relations Officer I',
  'Public Relations Officer II',
  'Research Coordinator',
  'Editor-in-Chief',
] as const;

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB
export const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB

