import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const windowMs = env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;

const message = (msg: string) => ({
  success: false,
  error: { code: 'RATE_LIMITED', message: msg },
});

export const generalLimiter = rateLimit({
  windowMs,
  max: env.RATE_LIMIT_MAX_GENERAL,
  standardHeaders: true,
  legacyHeaders: false,
  message: message('Too many requests. Please slow down and try again shortly.'),
});

// Stricter limit for credential + OTP endpoints to blunt brute-force attempts.
export const authLimiter = rateLimit({
  windowMs,
  max: env.RATE_LIMIT_MAX_AUTH,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: message('Too many attempts. Please wait a few minutes before trying again.'),
});

export const voteLimiter = rateLimit({
  windowMs,
  max: env.RATE_LIMIT_MAX_VOTE,
  standardHeaders: true,
  legacyHeaders: false,
  message: message('Too many voting requests detected.'),
});

export const verificationLimiter = rateLimit({
  windowMs,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: message('Too many verification email requests. Please wait a few minutes before trying again.'),
});
