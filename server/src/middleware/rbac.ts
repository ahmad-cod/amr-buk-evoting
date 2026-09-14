import { NextFunction, Request, Response } from 'express';
import { ROLES, Role } from '../config/constants';
import { ApiError } from '../utils/ApiError';

/** Restricts a route to the given admin roles. Must run after requireAdmin. */
export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.admin) throw ApiError.unauthorized();
    if (!roles.includes(req.admin.role)) {
      throw ApiError.forbidden('This action requires a higher permission level');
    }
    next();
  };

export const requireSuperAdmin = requireRole(ROLES.SUPER_ADMIN);
