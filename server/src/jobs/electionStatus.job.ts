import { Election } from '../models/Election';
import { ELECTION_STATUS } from '../config/constants';
import { logger } from '../utils/logger';

/**
 * Persists time-driven status transitions so stored status stays consistent with
 * the clock (effectiveStatus already handles reads; this keeps the DB tidy and
 * enforces the "auto-close when the election ends" rule).
 */
export async function runElectionStatusSweep(now = new Date()): Promise<void> {
  try {
    // Scheduled -> Active when start passes and voting is enabled.
    await Election.updateMany(
      {
        status: ELECTION_STATUS.SCHEDULED,
        startDateTime: { $lte: now },
        endDateTime: { $gt: now },
      },
      { $set: { status: ELECTION_STATUS.ACTIVE } },
    );

    // Active/Scheduled -> Closed when end passes.
    await Election.updateMany(
      {
        status: { $in: [ELECTION_STATUS.ACTIVE, ELECTION_STATUS.SCHEDULED] },
        endDateTime: { $lte: now },
      },
      { $set: { status: ELECTION_STATUS.CLOSED } },
    );
  } catch (err) {
    logger.error('Election status sweep failed', err);
  }
}

let timer: NodeJS.Timeout | null = null;

export function startElectionStatusJob(intervalMs = 60_000): void {
  runElectionStatusSweep();
  timer = setInterval(() => runElectionStatusSweep(), intervalMs);
  logger.info(`Election status job started (every ${intervalMs / 1000}s)`);
}

export function stopElectionStatusJob(): void {
  if (timer) clearInterval(timer);
}
