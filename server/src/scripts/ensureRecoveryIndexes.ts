import { connectDatabase, disconnectDatabase } from '../config/db';
import { env } from '../config/env';
import { RecoveryToken } from '../models/RecoveryToken';
import { logger } from '../utils/logger';

async function ensureRecoveryIndexes(): Promise<void> {
  if (env.isProd) {
    throw new Error('Recovery index setup is disabled when NODE_ENV=production.');
  }

  await connectDatabase();

  try {
    await RecoveryToken.createIndexes();
    const indexes = await RecoveryToken.collection.indexes();
    logger.info('RecoveryToken indexes are ready.', indexes.map((index) => index.name));
  } finally {
    await disconnectDatabase();
  }
}

ensureRecoveryIndexes().catch((error) => {
  logger.error('Recovery index setup failed', error);
  process.exitCode = 1;
});
