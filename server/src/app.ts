// Must be first: sets global Mongoose JSON serialization before any model compiles.
import './config/serialization';
import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { generalLimiter } from './middleware/rateLimit';
import { requestContext } from './middleware/requestContext';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import api from './routes';

export function createApp(): Application {
  const app = express();

  // Behind a proxy (Nginx, Render, etc.) so secure cookies + IPs work correctly.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true, // allow the HTTP-only auth cookie
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(requestContext);

  // Global soft rate limit.
  app.use(generalLimiter);

  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
