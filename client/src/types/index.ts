export type Role = 'super_admin' | 'election_admin';

export type ElectionStatus =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'closed'
  | 'archived';

export type CandidateStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface AdminUser {
  id: string;
  username: string;
  fullName?: string;
  role: Role;
  isActive?: boolean;
  lastLoginAt?: string;
  createdAt?: string;
}

export interface StudentUser {
  id: string;
  fullName: string;
  email: string;
  serialNumber?: string;
  registrationNumber?: string;
  programme?: string;
  faculty?: string;
  gender?: string;
  department?: string;
  level?: string;
  isEligible?: boolean;
}

export interface Student extends StudentUser {
  hasRegistered?: boolean;
  createdAt?: string;
}

export interface Election {
  id: string;
  title: string;
  slug: string;
  description?: string;
  bannerImage?: string;
  startDateTime: string;
  endDateTime: string;
  status: ElectionStatus;
  effectiveStatus?: ElectionStatus;
  votingOpen?: boolean;
  liveResultsEnabled: boolean;
  finalResultsPublished: boolean;
  registrationEnabled: boolean;
  votingEnabled: boolean;
  requireCandidateApproval: boolean;
  instructions?: string;
  eligibleDepartments: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Position {
  id: string;
  electionId: string;
  title: string;
  description?: string;
  displayOrder: number;
  maxCandidates: number;
  maxVotesPerVoter: number;
  isActive: boolean;
}

export interface Candidate {
  id: string;
  electionId: string;
  positionId: string | { id?: string; _id?: string; title: string };
  fullName: string;
  faculty?: string;
  department?: string;
  programme?: string;
  level?: string;
  bio?: string;
  manifesto?: string;
  campaignSlogan?: string;
  imageUrl?: string;
  status: CandidateStatus;
  displayOrder: number;
}

export interface BallotPosition {
  position: {
    id: string;
    title: string;
    description?: string;
    maxVotesPerVoter: number;
  };
  candidates: Array<{
    id: string;
    fullName: string;
    faculty?: string;
    department?: string;
    level?: string;
    campaignSlogan?: string;
    manifesto?: string;
    imageUrl?: string;
  }>;
}

export interface BallotResponse {
  election: {
    id: string;
    title: string;
    slug: string;
    instructions?: string;
    effectiveStatus: ElectionStatus;
    endDateTime: string;
  };
  ballot: BallotPosition[];
  votingOpen: boolean;
  votingClosedReason?: string;
  hasVoted: boolean;
}

export interface CandidateResult {
  candidateId: string;
  fullName: string;
  imageUrl?: string;
  votes: number;
  percentage: number;
  isWinner: boolean;
}

export interface PositionResult {
  positionId: string;
  title: string;
  displayOrder: number;
  totalVotes: number;
  candidates: CandidateResult[];
}

export interface ResultsResponse {
  available: boolean;
  reason?: string;
  previewOnly?: boolean;
  election?: {
    id: string;
    title: string;
    slug: string;
    status: ElectionStatus;
    finalResultsPublished: boolean;
    liveResultsEnabled: boolean;
  };
  turnout?: {
    eligibleVoters: number;
    votesCast: number;
    turnoutPercentage: number;
  };
  positions?: PositionResult[];
  isFinal?: boolean;
  generatedAt?: string;
}

export interface DashboardStats {
  totals: {
    elections: number;
    activeElections: number;
    registeredVoters: number;
    eligibleVoters: number;
    votesCast: number;
    candidates: number;
    pendingCandidates: number;
    turnoutPercentage: number;
  };
  statusBreakdown: Record<string, number>;
  recentActivity: AuditLog[];
}

export interface AuditLog {
  _id: string;
  adminId?: { username: string } | string;
  actorLabel?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export interface ImportOutcome {
  historyId: string;
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: number;
  invalid: number;
  errors: Array<{ row: number; identifier?: string; registrationNumber?: string; reason: string }>;
  filename?: string;
  createdAt?: string;
  importedBy?: string;
}

export interface ImportPreview {
  headers: string[];
  mapping: Record<string, string | undefined>;
  sampleRows: Record<string, string>[];
  totalRows: number;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}
