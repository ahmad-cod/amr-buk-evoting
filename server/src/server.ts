import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/db';
import { env } from './config/env';
import { logger } from './utils/logger';
import { startElectionStatusJob, stopElectionStatusJob } from './jobs/electionStatus.job';
import { ensureCandidateBucket } from './services/supabase.service';

// Import models so their indexes are registered/built on startup.
import './models/Admin';
import './models/Student';
import './models/Election';
import './models/Position';
import './models/Candidate';
import './models/VoteReceipt';
import './models/Ballot';
import './models/AuditLog';
import './models/ImportHistory';

async function bootstrap(): Promise<void> {
  await connectDatabase();
  await ensureCandidateBucket();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`AMR Club BUK E-Voting API running on http://localhost:${env.PORT}`);
    logger.info(`Environment: ${env.NODE_ENV}`);
  });

  startElectionStatusJob();

  const shutdown = async (signal: string) => {
    logger.warn(`${signal} received. Shutting down gracefully...`);
    stopElectionStatusJob();
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    // Force-exit if it hangs.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection', reason));
}

bootstrap().catch((err) => {
  logger.error('Fatal startup error', err);
  process.exit(1);
});
