import { Link } from 'react-router-dom';
import { ShieldCheck, Lock } from 'lucide-react';
import { BrandWordmark } from './Brand';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-charcoal-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <BrandWordmark size={44} subtitle="E-Voting Platform" />
            <p className="mt-3 max-w-xs text-sm text-charcoal-500">
              The official secure online election platform of the Antimicrobial Resistance (AMR)
              Club, Bayero University Kano — administered by the AMR Independent Electoral Committee (AMR IEC).
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-charcoal-800">Portal</h4>
            <ul className="mt-3 space-y-2 text-sm text-charcoal-500">
              <li><Link to="/elections" className="hover:text-navy-900">Elections</Link></li>
              <li><Link to="/guidelines" className="hover:text-navy-900">Election guidelines</Link></li>
              <li><Link to="/register" className="hover:text-navy-900">Register to vote</Link></li>
              <li><Link to="/login" className="hover:text-navy-900">Voter sign in</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-charcoal-800">Your vote is protected</h4>
            <ul className="mt-3 space-y-2 text-sm text-charcoal-500">
              <li className="flex items-start gap-2">
                <Lock size={15} className="mt-0.5 text-amr-teal" /> Ballots are stored separately from voter identities.
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck size={15} className="mt-0.5 text-amr-teal" /> One secret vote per eligible voter, structurally enforced.
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-charcoal-100 pt-6 text-xs text-charcoal-400 sm:flex-row">
          <p>
            © {year} AMR Club BUK · Administered by AMR IEC · Re-architected for AMR Club BUK by{' '}
            <a
              href="https://www.linkedin.com/in/ahmadaroyehun"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-charcoal-700 hover:text-navy-900 underline underline-offset-2"
            >
              Ahmad Aroyehun
            </a>{' '}
            · Based on original design by{' '}
            <a
              href="https://anasyakubu.netlify.app"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-charcoal-700 hover:text-navy-900 underline underline-offset-2"
            >
              Anas Yakubu
            </a>
            .
          </p>
          <Link to="/admin/login" className="hover:text-charcoal-700">Committee sign in</Link>
        </div>
      </div>
    </footer>
  );
}
