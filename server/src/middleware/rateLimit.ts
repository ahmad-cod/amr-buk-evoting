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
// Keyed by IP + targeted account so campus Wi-Fi / NAT users do not lock each other out.
export const authLimiter = rateLimit({
  windowMs,
  max: env.RATE_LIMIT_MAX_AUTH,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const account = (req.body?.email || req.body?.identifier || req.body?.username || '').toLowerCase().trim();
    const ip = req.clientIp || req.ip || 'unknown';
    return account ? `auth_${ip}_${account}` : `auth_${ip}`;
  },
  message: message('Too many attempts. Please wait a few minutes before trying again.'),
});

// Voting rate limiter. Keyed by authenticated student ID so all campus voters can participate freely,
// while preventing any single voter from flooding the endpoint.
export const voteLimiter = rateLimit({
  windowMs,
  max: env.RATE_LIMIT_MAX_VOTE,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const studentId = (req as any).student?._id?.toString() || (req as any).user?._id?.toString();
    return studentId ? `vote_student_${studentId}` : `vote_ip_${req.clientIp || req.ip || 'unknown'}`;
  },
  message: message('Too many voting requests detected.'),
});

export const verificationLimiter = rateLimit({
  windowMs,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => {
    const email = (req.body?.email || '').toLowerCase().trim();
    const voterId = (req.body?.voterId || '').toString().trim();
    const ip = req.clientIp || req.ip || 'unknown';
    if (voterId) return `verify_vid_${voterId}`;
    if (email) return `verify_email_${email}`;
    return `verify_ip_${ip}`;
  },
  message: message('Too many verification email requests. Please wait a few minutes before trying again.'),
});

// Dedicated rate limiter for /forgot-password.
// Keyed by IP + target account to protect against brute-force and email flooding while
// preventing campus NAT / shared IP blockades.
export const forgotPasswordLimiter = rateLimit({
  windowMs,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit'],
  keyGenerator: (req) => {
    const account = (req.body?.email || req.body?.identifier || '').toLowerCase().trim();
    const ip = req.clientIp || req.ip || 'unknown';
    return account ? `forgot_${ip}_${account}` : `forgot_${ip}`;
  },
  message: message('Too many password recovery attempts. Please wait a few minutes before trying again.'),
});

// Rate limiter for /reset-password attempts.
export const resetPasswordLimiter = rateLimit({
  windowMs,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit'],
  keyGenerator: (req) => {
    const ip = req.clientIp || req.ip || 'unknown';
    return `reset_${ip}`;
  },
  message: message('Too many password reset attempts. Please wait a few minutes before trying again.'),
});

