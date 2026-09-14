import { Router } from 'express';
import authRoutes from './auth.routes';
import adminRoutes from './admin.routes';
import electionRoutes from './election.routes';
import adminResultsRoutes from './adminResults.routes';
import { positionsRouter, candidatesRouter } from './resource.routes';

const api = Router();

api.get('/health', (_req, res) =>
  res.json({ success: true, data: { status: 'ok', service: 'amr-buk-evoting', time: new Date().toISOString() } }),
);

api.use('/auth', authRoutes);
api.use('/admin', adminRoutes); // dashboard, admins, students, audit
api.use('/admin/elections', adminResultsRoutes); // admin single-election reads + results/export
api.use('/elections', electionRoutes); // public + student + admin election management
api.use('/positions', positionsRouter);
api.use('/candidates', candidatesRouter);

export default api;
