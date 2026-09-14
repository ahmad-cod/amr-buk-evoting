import jwt, { SignOptions } from 'jsonwebtoken';
import { CookieOptions } from 'express';
import { env } from '../config/env';
import { Role } from '../config/constants';

export type Principal = 'admin' | 'student';

export interface JwtPayload {
  sub: string; // user id
  principal: Principal;
  role?: Role; // present for admins
}

export const ADMIN_COOKIE = 'amr_admin_token';
export const STUDENT_COOKIE = 'amr_voter_token';

export function signToken(payload: JwtPayload): string {
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

export function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isProd, // requires HTTPS in production
    sameSite: env.isProd ? 'none' : 'lax',
    maxAge: env.COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

export function clearCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'none' : 'lax',
    path: '/',
  };
}

export interface RegistrationTokenPayload {
  voterId: string;
  email: string;
  purpose: 'voter_registration';
}

export function signRegistrationToken(voterId: string, email: string): string {
  return jwt.sign(
    { voterId, email, purpose: 'voter_registration' },
    env.JWT_SECRET,
    { expiresIn: `${env.VERIFICATION_TOKEN_EXPIRES_MINUTES || 15}m` },
  );
}

export function verifyRegistrationToken(token: string): RegistrationTokenPayload {
  const payload = jwt.verify(token, env.JWT_SECRET) as RegistrationTokenPayload;
  if (payload.purpose !== 'voter_registration' || !payload.voterId) {
    throw new Error('Invalid registration session token');
  }
  return payload;
}
