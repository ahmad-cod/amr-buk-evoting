import { Routes, Route, Navigate } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { StudentRoute, AdminRoute, RoleRoute } from '@/routes/guards';
import { Analytics } from '@vercel/analytics/react';

// Public pages
import { HomePage } from '@/pages/public/HomePage';
import { ElectionsPage } from '@/pages/public/ElectionsPage';
import { ElectionDetailsPage } from '@/pages/public/ElectionDetailsPage';
import { CandidateProfilePage } from '@/pages/public/CandidateProfilePage';
import { ResultsPage } from '@/pages/public/ResultsPage';
import { GuidelinesPage } from '@/pages/public/GuidelinesPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { VerifyPage } from '@/pages/auth/VerifyPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { VotingPage } from '@/pages/vote/VotingPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

// Admin pages
import { AdminLoginPage } from '@/pages/admin/AdminLoginPage';
import { DashboardPage } from '@/pages/admin/DashboardPage';
import { AdminElectionsPage } from '@/pages/admin/AdminElectionsPage';
import { ElectionFormPage } from '@/pages/admin/ElectionFormPage';
import { ManageCandidatesPage } from '@/pages/admin/ManageCandidatesPage';
import { ManagePositionsPage } from '@/pages/admin/ManagePositionsPage';
import { ManageVotersPage } from '@/pages/admin/ManageVotersPage';
import { AdminResultsPage } from '@/pages/admin/AdminResultsPage';
import { AdminsPage } from '@/pages/admin/AdminsPage';
import { StudentImportPage } from '@/pages/admin/StudentImportPage';
import { AuditLogsPage } from '@/pages/admin/AuditLogsPage';
import { SettingsPage } from '@/pages/admin/SettingsPage';

export function App() {
  return (
    <>
      <Routes>
        {/* Public + student area */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/elections" element={<ElectionsPage />} />
          <Route path="/elections/:slug" element={<ElectionDetailsPage />} />
          <Route
            path="/elections/:slug/candidates/:candidateId"
            element={<CandidateProfilePage />}
          />
          <Route path="/elections/:slug/results" element={<ResultsPage />} />
          <Route path="/guidelines" element={<GuidelinesPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/vote/:slug"
            element={
              <StudentRoute>
                <VotingPage />
              </StudentRoute>
            }
          />
        </Route>

        {/* Admin auth (no layout) */}
        <Route path="/admin/login" element={<AdminLoginPage />} />

        {/* Admin area */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          }
        >
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="elections" element={<AdminElectionsPage />} />
          <Route path="elections/create" element={<ElectionFormPage mode="create" />} />
          <Route path="elections/:id/edit" element={<ElectionFormPage mode="edit" />} />
          <Route path="elections/:id/positions" element={<ManagePositionsPage />} />
          <Route path="elections/:id/candidates" element={<ManageCandidatesPage />} />
          <Route path="elections/:id/voters" element={<ManageVotersPage />} />
          <Route path="elections/:id/results" element={<AdminResultsPage />} />
          <Route
            path="admins"
            element={
              <RoleRoute roles={['super_admin']}>
                <AdminsPage />
              </RoleRoute>
            }
          />
          <Route
            path="student-import"
            element={
              <RoleRoute roles={['super_admin']}>
                <StudentImportPage />
              </RoleRoute>
            }
          />
          <Route path="audit-logs" element={<AuditLogsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>

      <Analytics />
    </>
  );
}