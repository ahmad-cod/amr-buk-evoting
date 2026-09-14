import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminTopbar } from '@/components/admin/AdminTopbar';

const TITLES: Array<[RegExp, string]> = [
  [/^\/admin\/dashboard/, 'Dashboard'],
  [/^\/admin\/elections\/create/, 'Create election'],
  [/^\/admin\/elections\/[^/]+\/candidates/, 'Candidates'],
  [/^\/admin\/elections\/[^/]+\/positions/, 'Positions'],
  [/^\/admin\/elections\/[^/]+\/voters/, 'Voters'],
  [/^\/admin\/elections\/[^/]+\/results/, 'Results'],
  [/^\/admin\/elections\/[^/]+\/edit/, 'Edit election'],
  [/^\/admin\/elections/, 'Elections'],
  [/^\/admin\/student-import/, 'Student import'],
  [/^\/admin\/admins/, 'Administrators'],
  [/^\/admin\/audit-logs/, 'Audit logs'],
  [/^\/admin\/settings/, 'Settings'],
];

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const title = TITLES.find(([re]) => re.test(pathname))?.[1] || 'Admin';

  return (
    <div className="flex min-h-screen bg-charcoal-50">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar onMenu={() => setSidebarOpen(true)} title={title} />
        <main className="flex-1 p-4 sm:p-6">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
