import { Router } from 'express';
import * as positions from '../controllers/position.controller';
import * as candidates from '../controllers/candidate.controller';
import { requireAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { uploadImage } from '../middleware/upload';
import { updatePositionSchema, updateCandidateSchema } from '../validators/schemas';

// ---- /api/positions ----
export const positionsRouter = Router();
positionsRouter.use(requireAdmin);
positionsRouter.patch('/:id', validate(updatePositionSchema), positions.updatePosition);
positionsRouter.delete('/:id', positions.deletePosition);

// ---- /api/candidates ----
export const candidatesRouter = Router();
candidatesRouter.use(requireAdmin);
candidatesRouter.patch('/:id', validate(updateCandidateSchema), candidates.updateCandidate);
candidatesRouter.delete('/:id', candidates.deleteCandidate);
candidatesRouter.post('/:id/approve', candidates.approveCandidate);
candidatesRouter.post('/:id/reject', candidates.rejectCandidate);
candidatesRouter.post('/:id/upload-image', uploadImage, candidates.uploadImage);
