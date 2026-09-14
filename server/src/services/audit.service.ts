import crypto from 'crypto';
import { Request } from 'express';
import { AuditLog } from '../models/AuditLog';
import { env } from '../config/env';
import { logger } from '../utils/logger';

interface AuditInput {
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}

function hashIp(ip?: string): string | undefined {
  if (!ip) return undefined;
  return crypto.createHash('sha256').update(ip + env.JWT_SECRET).digest('hex').slice(0, 32);
}

/**
 * Records a sensitive admin action. Never throws into the request path —
 * a failed audit write must not break the operation, but is logged loudly.
 */
export async function recordAudit(req: Request, input: AuditInput): Promise<void> {
  try {
    await AuditLog.create({
      adminId: req.admin?.id,
      actorLabel: req.admin?.username,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      details: input.details,
      ipAddress: hashIp(req.clientIp),
      userAgent: req.headers['user-agent'],
    });
  } catch (err) {
    logger.error('Failed to write audit log', { action: input.action, err });
  }
}
