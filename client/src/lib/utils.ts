import { format, formatDistanceToNowStrict } from 'date-fns';
import type { CandidateStatus, ElectionStatus } from '@/types';

/** Join class names, dropping falsy values. Lightweight clsx replacement. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function formatDateTime(value?: string | Date): string {
  if (!value) return '—';
  try {
    return format(new Date(value), 'd MMM yyyy, h:mm a');
  } catch {
    return '—';
  }
}

export function formatDate(value?: string | Date): string {
  if (!value) return '—';
  try {
    return format(new Date(value), 'd MMM yyyy');
  } catch {
    return '—';
  }
}

export function timeAgo(value?: string | Date): string {
  if (!value) return '';
  try {
    return `${formatDistanceToNowStrict(new Date(value))} ago`;
  } catch {
    return '';
  }
}

export const ELECTION_STATUS_META: Record<
  ElectionStatus,
  { label: string; tone: 'green' | 'gold' | 'charcoal' | 'red' | 'blue' }
> = {
  draft: { label: 'Draft', tone: 'charcoal' },
  scheduled: { label: 'Scheduled', tone: 'blue' },
  active: { label: 'Active', tone: 'green' },
  paused: { label: 'Paused', tone: 'gold' },
  closed: { label: 'Closed', tone: 'charcoal' },
  archived: { label: 'Archived', tone: 'charcoal' },
};

export const CANDIDATE_STATUS_META: Record<
  CandidateStatus,
  { label: string; tone: 'green' | 'gold' | 'charcoal' | 'red' }
> = {
  pending: { label: 'Pending', tone: 'gold' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  withdrawn: { label: 'Withdrawn', tone: 'charcoal' },
};

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('');
}

export function positionId(pid: string | { _id: string }): string {
  return typeof pid === 'string' ? pid : pid._id;
}
