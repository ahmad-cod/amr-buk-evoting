import { api } from '@/lib/api';
import type {
  AdminUser,
  AuditLog,
  BallotResponse,
  Candidate,
  DashboardStats,
  Election,
  ImportOutcome,
  ImportPreview,
  Paginated,
  Position,
  ResultsResponse,
  Student,
} from '@/types';

// ---- Query keys ----
export const qk = {
  publicElections: (status?: string, page?: number) => ['public-elections', status, page] as const,
  publicElection: (slug: string) => ['public-election', slug] as const,
  publicResults: (slug: string) => ['public-results', slug] as const,
  ballot: (slug: string) => ['ballot', slug] as const,
  voteStatus: (slug: string) => ['vote-status', slug] as const,
  receipt: (slug: string) => ['receipt', slug] as const,
  dashboard: () => ['admin-dashboard'] as const,
  adminElections: (status?: string, search?: string, page?: number) =>
    ['admin-elections', status, search, page] as const,
  adminElection: (id: string) => ['admin-election', id] as const,
  positions: (electionId: string) => ['positions', electionId] as const,
  candidates: (electionId: string, status?: string) => ['candidates', electionId, status] as const,
  adminResults: (id: string) => ['admin-results', id] as const,
  students: (page?: number, search?: string, dept?: string) =>
    ['students', page, search, dept] as const,
  studentStats: () => ['student-stats'] as const,
  importHistory: () => ['import-history'] as const,
  admins: () => ['admins'] as const,
  auditLogs: (page?: number, search?: string) => ['audit-logs', page, search] as const,
};

const q = (params: Record<string, unknown>) => {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== null) s.set(k, String(v));
  });
  const str = s.toString();
  return str ? `?${str}` : '';
};

// ---- Public ----
export const publicApi = {
  listElections: (status?: string, page = 1) =>
    api.get<Paginated<Election>>(`/elections${q({ status, page, limit: 12 })}`),
  getElection: (slug: string) =>
    api.get<{ election: Election; positions: Position[]; candidates: Candidate[] }>(
      `/elections/${slug}`,
    ),
  getResults: (slug: string) => api.get<ResultsResponse>(`/elections/${slug}/results`),
};

// ---- Voting ----
export const voteApi = {
  getBallot: (slug: string) => api.get<BallotResponse>(`/elections/${slug}/ballot`),
  submit: (
    slug: string,
    selections: { positionId: string; candidateIds: string[] }[],
    idempotencyKey: string,
  ) =>
    api.post<{ receiptCode: string; submittedAt: string; alreadyVoted: boolean; message: string }>(
      `/elections/${slug}/vote`,
      { selections, idempotencyKey },
    ),
  status: (slug: string) =>
    api.get<{ hasVoted: boolean; receiptCode?: string; submittedAt?: string }>(
      `/elections/${slug}/vote-status`,
    ),
  receipt: (slug: string) =>
    api.get<{
      receiptCode: string;
      submittedAt: string;
      election: { title: string; slug: string };
      qrDataUrl: string;
    }>(`/elections/${slug}/receipt`),
};

// ---- Admin ----
export const adminApi = {
  dashboard: () => api.get<DashboardStats>('/admin/dashboard/stats'),

  listElections: (status?: string, search?: string, page = 1) =>
    api.get<Paginated<Election>>(`/admin/elections${q({ status, search, page, limit: 20 })}`),
  getElection: (id: string) =>
    api.get<{ election: Election; positions: Position[]; candidateCount: number; voteCount: number }>(
      `/admin/elections/${id}`,
    ),
  createElection: (body: unknown) => api.post<Election>('/elections', body),
  updateElection: (id: string, body: unknown) => api.patch<Election>(`/elections/${id}`, body),
  deleteElection: (id: string) => api.del(`/elections/${id}`),
  lifecycle: (id: string, action: string, body?: unknown) =>
    api.post<Election>(`/elections/${id}/${action}`, body),

  listPositions: (electionId: string) => api.get<Position[]>(`/elections/${electionId}/positions`),
  createPosition: (electionId: string, body: unknown) =>
    api.post<Position>(`/elections/${electionId}/positions`, body),
  seedPositions: (electionId: string) =>
    api.post<Position[]>(`/elections/${electionId}/positions/seed`, {}),
  updatePosition: (id: string, body: unknown) => api.patch<Position>(`/positions/${id}`, body),
  deletePosition: (id: string) => api.del(`/positions/${id}`),

  listCandidates: (electionId: string, status?: string) =>
    api.get<Candidate[]>(`/elections/${electionId}/candidates${q({ status })}`),
  createCandidate: (electionId: string, body: unknown) =>
    api.post<Candidate>(`/elections/${electionId}/candidates`, body),
  updateCandidate: (id: string, body: unknown) => api.patch<Candidate>(`/candidates/${id}`, body),
  deleteCandidate: (id: string) => api.del(`/candidates/${id}`),
  approveCandidate: (id: string) => api.post<Candidate>(`/candidates/${id}/approve`, {}),
  rejectCandidate: (id: string) => api.post<Candidate>(`/candidates/${id}/reject`, {}),
  uploadCandidateImage: (id: string, file: File) => {
    const form = new FormData();
    form.append('image', file);
    return api.postForm<{ imageUrl: string; candidate: Candidate }>(
      `/candidates/${id}/upload-image`,
      form,
    );
  },

  adminResults: (id: string) => api.get<ResultsResponse>(`/admin/elections/${id}/results`),
  exportResultsUrl: (id: string) => `/api/admin/elections/${id}/export-results`,

  listStudents: (page = 1, search?: string, department?: string) =>
    api.get<Paginated<Student>>(`/admin/students${q({ page, search, department, limit: 20 })}`),
  studentStats: () => api.get<{ total: number; eligible: number; registered: number }>(
    '/admin/students/stats',
  ),
  toggleEligibility: (id: string, isEligible: boolean) =>
    api.patch<Student>(`/admin/students/${id}/eligibility`, { isEligible }),
  importHistory: () => api.get<ImportOutcome[]>('/admin/students/import-history'),
  previewImport: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.postForm<ImportPreview>('/admin/students/import/preview', form);
  },
  runImport: (file: File, activateImmediately: boolean) => {
    const form = new FormData();
    form.append('file', file);
    form.append('activateImmediately', String(activateImmediately));
    return api.postForm<ImportOutcome>('/admin/students/import', form);
  },

  listAdmins: () => api.get<AdminUser[]>('/admin/admins'),
  createAdmin: (body: unknown) => api.post<AdminUser>('/admin/admins', body),
  updateAdmin: (id: string, body: unknown) => api.patch<AdminUser>(`/admin/admins/${id}`, body),
  deleteAdmin: (id: string) => api.del(`/admin/admins/${id}`),

  auditLogs: (page = 1, search?: string) =>
    api.get<Paginated<AuditLog>>(`/admin/audit-logs${q({ page, search, limit: 25 })}`),
};
