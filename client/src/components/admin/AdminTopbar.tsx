import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, ChevronDown, LogOut, UserCircle2 } from 'lucide-react';
import { useAuth } from '@/store/AuthContext';
import { useToast } from '@/store/ToastContext';

export function AdminTopbar({ onMenu, title }: { onMenu: () => void; title: string }) {
  const { admin, logoutAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleLogout = async () => {
    await logoutAdmin();
    toast.success('Signed out');
    navigate('/admin/login');
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-charcoal-200 bg-white px-4">
      <div className="flex items-center gap-3">
        <button className="rounded-md p-2 text-charcoal-600 hover:bg-charcoal-100 lg:hidden" onClick={onMenu} aria-label="Open menu">
          <Menu size={20} />
        </button>
        <h1 className="font-display text-lg font-semibold text-charcoal-900">{title}</h1>
      </div>

      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-charcoal-100"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <UserCircle2 size={22} className="text-amr-navy" />
          <span className="hidden font-medium text-charcoal-800 sm:inline">{admin?.username}</span>
          <ChevronDown size={16} className="text-charcoal-400" />
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-52 rounded-md border border-charcoal-200 bg-white py-1 shadow-elevated" role="menu">
            <div className="border-b border-charcoal-100 px-3 py-2">
              <p className="text-sm font-medium text-charcoal-900">{admin?.fullName || admin?.username}</p>
              <p className="text-xs capitalize text-charcoal-500">
                {admin?.role === 'super_admin' ? 'Super Admin' : 'Election Admin'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-charcoal-700 hover:bg-charcoal-50"
              role="menuitem"
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
