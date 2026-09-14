import { Link } from 'react-router-dom';
import { Home, SearchX } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-charcoal-100">
        <SearchX size={30} className="text-charcoal-500" />
      </div>
      <h1 className="mt-6 font-display text-3xl font-bold text-charcoal-900">Page not found</h1>
      <p className="mt-2 text-charcoal-500">
        The page you are looking for does not exist or may have been moved.
      </p>
      <Link to="/" className="btn-primary mt-6">
        <Home size={18} /> Back to home
      </Link>
    </div>
  );
}
