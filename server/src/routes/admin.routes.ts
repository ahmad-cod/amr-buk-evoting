import { Router } from 'express';
import * as admins from '../controllers/admin.controller';
import * as students from '../controllers/student.controller';
import * as dashboard from '../controllers/dashboard.controller';
import { requireAdmin } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { uploadCsv } from '../middleware/upload';
import {
  createAdminSchema,
  updateAdminSchema,
  eligibilityToggleSchema,
  listQuerySchema,
} from '../validators/schemas';

const router = Router();
router.use(requireAdmin);

// Dashboard + audit
router.get('/dashboard/stats', dashboard.dashboardStats);
router.get('/audit-logs', validate(listQuerySchema, 'query'), dashboard.listAuditLogs);

// Admin management (super admin only)
router.get('/admins', requireSuperAdmin, admins.listAdmins);
router.post('/admins', requireSuperAdmin, validate(createAdminSchema), admins.createAdmin);
router.patch('/admins/:id', requireSuperAdmin, validate(updateAdminSchema), admins.updateAdmin);
router.delete('/admins/:id', requireSuperAdmin, admins.deleteAdmin);

// Students / voters
router.get('/students', validate(listQuerySchema, 'query'), students.listStudents);
router.get('/students/stats', students.studentStats);
router.get('/students/import-history', students.importHistory);
router.post('/students/import/preview', requireSuperAdmin, uploadCsv, students.previewImport);
router.post('/students/import', requireSuperAdmin, uploadCsv, students.runImport);
router.patch(
  '/students/:id/eligibility',
  validate(eligibilityToggleSchema),
  students.toggleEligibility,
);

export default router;
