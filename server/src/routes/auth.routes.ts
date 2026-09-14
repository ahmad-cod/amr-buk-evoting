import { Router } from 'express';
import * as auth from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { authLimiter, verificationLimiter } from '../middleware/rateLimit';
import { requireAdmin, requireStudent } from '../middleware/auth';
import {
  adminLoginSchema,
  studentRegisterSchema,
  studentLoginSchema,
  verifyEligibilitySchema,
  requestVerificationSchema,
  verifyEmailTokenSchema,
  completeRegistrationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validators/schemas';

const router = Router();

// Admin
router.post('/admin/login', authLimiter, validate(adminLoginSchema), auth.adminLogin);
router.post('/admin/logout', auth.adminLogout);
router.get('/admin/me', requireAdmin, auth.adminMe);

// Student / Voter Email Verification Gate (Phase 19)
router.post(
  '/student/request-verification',
  verificationLimiter,
  validate(requestVerificationSchema),
  auth.requestVerification,
);
router.post(
  '/voter/request-verification',
  verificationLimiter,
  validate(requestVerificationSchema),
  auth.requestVerification,
);
router.post(
  '/student/verify-token',
  authLimiter,
  validate(verifyEmailTokenSchema),
  auth.verifyEmailToken,
);
router.post(
  '/voter/verify-token',
  authLimiter,
  validate(verifyEmailTokenSchema),
  auth.verifyEmailToken,
);
router.post(
  '/student/complete-registration',
  authLimiter,
  validate(completeRegistrationSchema),
  auth.completeRegistration,
);
router.post(
  '/voter/complete-registration',
  authLimiter,
  validate(completeRegistrationSchema),
  auth.completeRegistration,
);

// Student / Voter Authentication
router.post('/student/register', authLimiter, validate(studentRegisterSchema), auth.studentRegister);
router.post('/voter/register', authLimiter, validate(studentRegisterSchema), auth.studentRegister);
router.post('/student/login', authLimiter, validate(studentLoginSchema), auth.studentLogin);
router.post('/voter/login', authLimiter, validate(studentLoginSchema), auth.studentLogin);
router.post('/student/logout', auth.studentLogout);
router.post('/voter/logout', auth.studentLogout);
router.get('/student/me', requireStudent, auth.studentMe);
router.get('/voter/me', requireStudent, auth.studentMe);
router.post('/student/verify', authLimiter, validate(verifyEligibilitySchema), auth.checkEligibility);
router.post('/voter/verify', authLimiter, validate(verifyEligibilitySchema), auth.checkEligibility);

// Password reset
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), auth.forgotPassword);
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), auth.resetPassword);

export default router;
