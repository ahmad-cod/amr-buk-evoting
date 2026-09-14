import { Router } from 'express';
import * as results from '../controllers/results.controller';
import * as elections from '../controllers/election.controller';
import { requireAdmin } from '../middleware/auth';

// Mounted at /api/admin/elections
const router = Router();
router.use(requireAdmin);

router.get('/:id', elections.getElection);
router.get('/:id/results', results.getAdminResults);
router.get('/:id/results/visibility', elections.previewResultsVisibility);
router.get('/:id/export-results', results.exportResults);
router.get('/', elections.listElections);

export default router;
