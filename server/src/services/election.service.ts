import { ElectionDoc } from '../models/Election';
import { ELECTION_STATUS, ElectionStatus } from '../config/constants';

/**
 * Computes the *effective* status of an election from its stored status and the
 * server clock. This never trusts client time. A scheduled election whose start
 * has passed reads as active; an active election past its end reads as closed.
 * Paused and archived states are respected as-is.
 */
export function effectiveStatus(election: ElectionDoc, now = new Date()): ElectionStatus {
  const { status, startDateTime, endDateTime } = election;

  if (status === ELECTION_STATUS.ARCHIVED) return ELECTION_STATUS.ARCHIVED;
  if (status === ELECTION_STATUS.DRAFT) return ELECTION_STATUS.DRAFT;
  if (status === ELECTION_STATUS.PAUSED) return ELECTION_STATUS.PAUSED;
  if (status === ELECTION_STATUS.CLOSED) return ELECTION_STATUS.CLOSED;

  // scheduled / active are time-driven
  if (now < startDateTime) return ELECTION_STATUS.SCHEDULED;
  if (now >= startDateTime && now <= endDateTime) return ELECTION_STATUS.ACTIVE;
  return ELECTION_STATUS.CLOSED;
}

export interface VotingWindow {
  open: boolean;
  reason?: string;
}

/** Whether voting can be accepted right now, using server time and toggles. */
export function votingWindow(election: ElectionDoc, now = new Date()): VotingWindow {
  if (!election.votingEnabled) return { open: false, reason: 'Voting is currently disabled' };

  const status = election.status;
  if (status === ELECTION_STATUS.PAUSED) return { open: false, reason: 'Voting is paused' };
  if (status === ELECTION_STATUS.DRAFT) return { open: false, reason: 'This election is not open yet' };
  if (status === ELECTION_STATUS.ARCHIVED) return { open: false, reason: 'This election is archived' };
  if (status === ELECTION_STATUS.CLOSED) return { open: false, reason: 'This election is closed' };

  if (now < election.startDateTime) return { open: false, reason: 'Voting has not started yet' };
  if (now > election.endDateTime) return { open: false, reason: 'Voting has ended' };

  return { open: true };
}

/** Whether results may be shown to the public, given toggles and status. */
export function resultsVisibility(election: ElectionDoc, now = new Date()): {
  visible: boolean;
  final: boolean;
  reason?: string;
} {
  const status = effectiveStatus(election, now);
  const closed = status === ELECTION_STATUS.CLOSED || status === ELECTION_STATUS.ARCHIVED;

  if (election.finalResultsPublished && closed) {
    return { visible: true, final: true };
  }
  if (election.liveResultsEnabled) {
    return { visible: true, final: false };
  }
  return {
    visible: false,
    final: false,
    reason: 'Results are not available yet. They will be published by the AMR IEC.',
  };
}
