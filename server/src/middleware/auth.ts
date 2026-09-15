import { NextFunction, Request, Response } from 'express';
import { ADMIN_COOKIE, STUDENT_COOKIE, verifyToken } from '../utils/jwt';
import { ApiError } from '../utils/ApiError';
import { Admin } from '../models/Admin';
import { Student } from '../models/Student';
import { asyncHandler } from '../utils/asyncHandler';

/** Requires a valid admin session. Also confirms the admin is still active. */
export const requireAdmin = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined;
    const token = req.cookies?.[ADMIN_COOKIE] || bearer || req.cookies?.[STUDENT_COOKIE];
    if (!token) throw ApiError.unauthorized('Admin authentication required');

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw ApiError.unauthorized('Session expired. Please sign in again.');
    }
    if (payload.principal !== 'admin') throw ApiError.forbidden('Admin privileges required');

    const admin = await Admin.findById(payload.sub);
    if (!admin || !admin.isActive) {
      throw ApiError.unauthorized('Admin account is inactive or no longer exists');
    }
    const adminTokenVersion = admin.tokenVersion ?? 0;
    const sessionTokenVersion = payload.tokenVersion ?? 0;
    if (sessionTokenVersion < adminTokenVersion) {
      throw ApiError.unauthorized('Session expired. Please sign in again.');
    }

    req.admin = { id: admin.id, username: admin.username, role: admin.role };
    next();
  },
);

/** Requires a valid student session. */
export const requireStudent = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined;
    const token = req.cookies?.[STUDENT_COOKIE] || bearer;
    if (!token) throw ApiError.unauthorized('Please sign in to continue');

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw ApiError.unauthorized('Session expired. Please sign in again.');
    }
    if (payload.principal !== 'student') throw ApiError.unauthorized();

    const student = await Student.findById(payload.sub);
    if (!student) throw ApiError.unauthorized('Account not found');
    const studentTokenVersion = student.tokenVersion ?? 0;
    const sessionTokenVersion = payload.tokenVersion ?? 0;
    if (sessionTokenVersion < studentTokenVersion) {
      throw ApiError.unauthorized('Session expired. Please sign in again.');
    }

    req.student = { id: student.id, email: student.email, registrationNumber: student.registrationNumber };
    next();
  },
);
