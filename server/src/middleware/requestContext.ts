import { NextFunction, Request, Response } from 'express';

/** Normalizes the client IP (respecting a trusted proxy) for logging/monitoring. */
export function requestContext(req: Request, _res: Response, next: NextFunction): void {
  const fwd = req.headers['x-forwarded-for'];
  const ip = Array.isArray(fwd)
    ? fwd[0]
    : typeof fwd === 'string'
      ? fwd.split(',')[0].trim()
      : req.socket.remoteAddress || req.ip;
  req.clientIp = ip || 'unknown';
  next();
}
