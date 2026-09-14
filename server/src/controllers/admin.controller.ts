import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok, created } from '../utils/respond';
import { Admin } from '../models/Admin';
import { ROLES } from '../config/constants';
import { recordAudit } from '../services/audit.service';

export const listAdmins = asyncHandler(async (_req: Request, res: Response) => {
  const admins = await Admin.find().sort({ createdAt: -1 });
  ok(res, admins);
});

export const createAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { username, fullName, password, role } = req.body as {
    username: string;
    fullName?: string;
    password: string;
    role: string;
  };

  const exists = await Admin.findOne({ username: username.toLowerCase().trim() });
  if (exists) throw ApiError.conflict('An admin with this username already exists');

  const admin = await Admin.create({
    username,
    fullName,
    password,
    role,
    createdBy: req.admin!.id,
  });

  await recordAudit(req, {
    action: 'admin.create',
    resourceType: 'Admin',
    resourceId: admin.id,
    details: { username: admin.username, role: admin.role },
  });

  created(res, admin);
});

export const updateAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const admin = await Admin.findById(id).select('+password');
  if (!admin) throw ApiError.notFound('Admin not found');

  const { fullName, password, role, isActive } = req.body as {
    fullName?: string;
    password?: string;
    role?: string;
    isActive?: boolean;
  };

  // Guard: don't allow removing the last active super admin.
  if ((role && role !== ROLES.SUPER_ADMIN) || isActive === false) {
    if (admin.role === ROLES.SUPER_ADMIN) {
      const activeSupers = await Admin.countDocuments({
        role: ROLES.SUPER_ADMIN,
        isActive: true,
      });
      if (activeSupers <= 1) {
        throw ApiError.badRequest('Cannot demote or deactivate the last active super admin');
      }
    }
  }

  if (fullName !== undefined) admin.fullName = fullName;
  if (role !== undefined) admin.role = role as typeof admin.role;
  if (isActive !== undefined) admin.isActive = isActive;
  if (password) admin.password = password;
  await admin.save();

  await recordAudit(req, {
    action: 'admin.update',
    resourceType: 'Admin',
    resourceId: admin.id,
    details: { role: admin.role, isActive: admin.isActive, passwordChanged: Boolean(password) },
  });

  ok(res, admin);
});

export const deleteAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (id === req.admin!.id) throw ApiError.badRequest('You cannot delete your own account');

  const admin = await Admin.findById(id);
  if (!admin) throw ApiError.notFound('Admin not found');

  if (admin.role === ROLES.SUPER_ADMIN) {
    const activeSupers = await Admin.countDocuments({ role: ROLES.SUPER_ADMIN, isActive: true });
    if (activeSupers <= 1) throw ApiError.badRequest('Cannot delete the last super admin');
  }

  await admin.deleteOne();

  await recordAudit(req, {
    action: 'admin.delete',
    resourceType: 'Admin',
    resourceId: id,
    details: { username: admin.username },
  });

  ok(res, { message: 'Admin deleted' });
});
