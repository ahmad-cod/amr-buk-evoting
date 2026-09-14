import mongoose from 'mongoose';
import dns from 'node:dns';
import { env } from './env';
import { logger } from '../utils/logger';

dns.setServers(['1.1.1.1', '1.0.0.1']);

let transactionsSupported = false;

export const supportsTransactions = (): boolean => transactionsSupported;

export async function connectDatabase(): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('error', (err) => logger.error('MongoDB error', err));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  await mongoose.connect(env.MONGODB_URI, {
    dbName: 'nacos-buk-election',
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 45000,
  });

  try {
    const admin = mongoose.connection.db!.admin();
    const status = await admin.command({ hello: 1 });

    transactionsSupported =
      Boolean(status.setName) || status.msg === 'isdbgrid';
  } catch {
    transactionsSupported = false;
  }

  if (transactionsSupported) {
    logger.info('MongoDB transactions are available.');
  } else {
    logger.warn(
      'MongoDB is not running as a replica set. Multi-document transactions are disabled.',
    );
  }

  return mongoose;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}