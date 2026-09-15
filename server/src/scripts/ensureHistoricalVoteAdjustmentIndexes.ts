import mongoose from 'mongoose';
import { HistoricalVoteAdjustment } from '../models/HistoricalVoteAdjustment';
import { env } from '../config/env';

async function ensureIndexes() {
  await mongoose.connect(env.MONGODB_URI, { dbName: 'amr-buk-election' });
  await HistoricalVoteAdjustment.createIndexes();
  console.log('HistoricalVoteAdjustment indexes ensured. No data mutations were performed.');
  await mongoose.disconnect();
}

ensureIndexes().catch((err) => {
  console.error('Failed to ensure historical vote adjustment indexes:', err);
  process.exitCode = 1;
});
