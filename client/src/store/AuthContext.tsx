import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';
import type { AdminUser, StudentUser } from '@/types';

interface AuthState {
  admin: AdminUser | null;
  student: StudentUser | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  loginAdmin: (username: string, password: string) => Promise<void>;
  logoutAdmin: () => Promise<void>;
  loginStudent: (identifier: string, password: string) => Promise<void>;
  registerStudent: (payload: {
    email: string;
    password: string;
    confirmPassword: string;
    registrationNumber?: string;
    identifier?: string;
  }) => Promise<void>;
  logoutStudent: () => Promise<void>;
  refreshStudent: () => Promise<void>;
  completeRegistration: (payload: {
    registrationSessionToken: string;
    password: string;
    confirmPassword: string;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [student, setStudent] = useState<StudentUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On load, silently probe both sessions (cookies) so refreshes stay signed in.
  useEffect(() => {
    let active = true;
    (async () => {
      const [adminRes, studentRes] = await Promise.allSettled([
        api.get<{ admin: AdminUser }>('/auth/admin/me'),
        api.get<{ student: StudentUser }>('/auth/student/me'),
      ]);
      if (!active) return;
      if (adminRes.status === 'fulfilled') setAdmin(adminRes.value.admin);
      if (studentRes.status === 'fulfilled') setStudent(studentRes.value.student);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const loginAdmin = async (username: string, password: string) => {
    const res = await api.post<{ admin: AdminUser }>('/auth/admin/login', { username, password });
    setAdmin(res.admin);
  };

  const logoutAdmin = async () => {
    try {
      await api.post('/auth/admin/logout');
    } catch {
      /* ignore */
    }
    setAdmin(null);
  };

  const loginStudent = async (identifier: string, password: string) => {
    const res = await api.post<{ student: StudentUser }>('/auth/student/login', {
      identifier,
      password,
    });
    setStudent(res.student);
  };

  const registerStudent: AuthContextValue['registerStudent'] = async (payload) => {
    const res = await api.post<{ student: StudentUser }>('/auth/student/register', payload);
    setStudent(res.student);
  };

  const completeRegistration: AuthContextValue['completeRegistration'] = async (payload) => {
    const res = await api.post<{ student: StudentUser }>('/auth/student/complete-registration', payload);
    setStudent(res.student);
  };

  const logoutStudent = async () => {
    try {
      await api.post('/auth/student/logout');
    } catch {
      /* ignore */
    }
    setStudent(null);
  };

  const refreshStudent = async () => {
    try {
      const res = await api.get<{ student: StudentUser }>('/auth/student/me');
      setStudent(res.student);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setStudent(null);
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      admin,
      student,
      loading,
      loginAdmin,
      logoutAdmin,
      loginStudent,
      registerStudent,
      completeRegistration,
      logoutStudent,
      refreshStudent,
    }),
    [admin, student, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
