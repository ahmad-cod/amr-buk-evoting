import { createApp } from '../src/app';
import { connectDatabase } from '../src/config/db';
import type { IncomingMessage, ServerResponse } from 'http';

const app = createApp();

// Reuse one DB connection across warm invocations instead of
// reconnecting on every request.
let dbReady: Promise<unknown> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!dbReady) dbReady = connectDatabase();
  await dbReady;
  return (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
}