import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/store/AuthContext';
import { FullPageSpinner } from '@/components/ui/LoadingSpinner';
import type { Role } from '@/types';

/** Requires a signed-in student, else redirects to student login. */
export function StudentRoute({ children }: { children: ReactNode }) {
  const { student, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!student) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

/** Requires a signed-in admin, else redirects to admin login. */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { admin, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!admin) return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

/** Requires a specific admin role. Falls back to the dashboard when unauthorized. */
export function RoleRoute({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { admin, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!admin) return <Navigate to="/admin/login" replace />;
  if (!roles.includes(admin.role)) return <Navigate to="/admin/dashboard" replace />;
  return <>{children}</>;
}
