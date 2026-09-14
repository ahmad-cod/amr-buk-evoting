import { Router } from 'express';
import * as elections from '../controllers/election.controller';
import * as positions from '../controllers/position.controller';
import * as candidates from '../controllers/candidate.controller';
import * as results from '../controllers/results.controller';
import * as votes from '../controllers/vote.controller';
import { requireAdmin, requireStudent } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { voteLimiter } from '../middleware/rateLimit';
import {
  createElectionSchema,
  updateElectionSchema,
  createPositionSchema,
  seedPositionsSchema,
  createCandidateSchema,
  castVoteSchema,
  listQuerySchema,
} from '../validators/schemas';

const router = Router();

/* ------------------------- Public reads ------------------------- */
router.get('/', validate(listQuerySchema, 'query'), elections.listPublicElections);
router.get('/:slug', elections.getPublicElection);
router.get('/:slug/results', results.getPublicResults);

/* ------------------------- Student voting ----------------------- */
router.get('/:slug/ballot', requireStudent, votes.getBallot);
router.post('/:slug/vote', requireStudent, voteLimiter, validate(castVoteSchema), votes.submitVote);
router.get('/:slug/vote-status', requireStudent, votes.voteStatus);
router.get('/:slug/receipt', requireStudent, votes.getReceipt);

/* ------------------------- Admin: elections --------------------- */
router.post('/', requireAdmin, validate(createElectionSchema), elections.createElection);
router.patch('/:id', requireAdmin, validate(updateElectionSchema), elections.updateElection);
router.delete('/:id', requireAdmin, requireSuperAdmin, elections.deleteElection);

router.post('/:id/publish', requireAdmin, elections.publishElection);
router.post('/:id/pause', requireAdmin, elections.pauseElection);
router.post('/:id/resume', requireAdmin, elections.resumeElection);
router.post('/:id/close', requireAdmin, elections.closeElection);
router.post('/:id/archive', requireAdmin, elections.archiveElection);
router.post('/:id/publish-results', requireAdmin, elections.publishResults);
router.post('/:id/reset', requireAdmin, requireSuperAdmin, elections.resetElection);

/* ------------------------- Admin: nested positions -------------- */
router.get('/:electionId/positions', requireAdmin, positions.listPositions);
router.post(
  '/:electionId/positions',
  requireAdmin,
  validate(createPositionSchema),
  positions.createPosition,
);
router.post(
  '/:electionId/positions/seed',
  requireAdmin,
  validate(seedPositionsSchema),
  positions.seedDefaultPositions,
);

/* ------------------------- Admin: nested candidates ------------- */
router.get('/:electionId/candidates', requireAdmin, candidates.listCandidates);
router.post(
  '/:electionId/candidates',
  requireAdmin,
  validate(createCandidateSchema),
  candidates.createCandidate,
);

export default router;
