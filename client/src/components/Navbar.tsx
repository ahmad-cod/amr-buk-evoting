import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut, User } from 'lucide-react';
import { BrandWordmark } from './Brand';
import { useAuth } from '@/store/AuthContext';
import { useToast } from '@/store/ToastContext';
import { cn } from '@/lib/utils';

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/elections', label: 'Elections' },
  { to: '/guidelines', label: 'Guidelines' },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { student, logoutStudent } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logoutStudent();
    toast.success('Signed out');
    navigate('/');
  };

  const navClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'rounded-md px-3 py-2 text-sm font-medium transition-colors',
      isActive ? 'text-amr-navy font-semibold bg-amr-pale-blue/60' : 'text-charcoal-600 hover:text-navy-900 hover:bg-amr-pale-blue/30',
    );

  return (
    <header className="sticky top-0 z-40 border-b border-charcoal-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" aria-label="AMR Club BUK home">
          <BrandWordmark size={40} />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={navClass}>
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {student ? (
            <>
              <span className="flex items-center gap-1.5 text-sm text-charcoal-600">
                <User size={15} /> {student.fullName.split(' ')[0]}
              </span>
              <button onClick={handleLogout} className="btn-ghost px-3 py-2">
                <LogOut size={16} /> Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-ghost px-3 py-2">
                Sign in
              </Link>
              <Link to="/register" className="btn-primary">
                Register to vote
              </Link>
            </>
          )}
        </div>

        <button
          className="rounded-md p-2 text-charcoal-700 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-charcoal-200 bg-white px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={navClass}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </NavLink>
            ))}
            <div className="mt-2 border-t border-charcoal-100 pt-2">
              {student ? (
                <button onClick={handleLogout} className="btn-secondary w-full">
                  <LogOut size={16} /> Sign out
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <Link to="/login" className="btn-secondary w-full" onClick={() => setOpen(false)}>
                    Sign in
                  </Link>
                  <Link to="/register" className="btn-primary w-full" onClick={() => setOpen(false)}>
                    Register to vote
                  </Link>
                </div>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
