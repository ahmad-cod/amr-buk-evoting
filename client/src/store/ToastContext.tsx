import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastTone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let counter = 0;

const toneStyles: Record<ToastTone, { icon: ReactNode; bar: string }> = {
  success: { icon: <CheckCircle2 size={18} className="text-green-600" />, bar: 'border-l-green-600' },
  error: { icon: <AlertCircle size={18} className="text-red-600" />, bar: 'border-l-red-600' },
  info: { icon: <Info size={18} className="text-charcoal-500" />, bar: 'border-l-charcoal-400' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = ++counter;
      setToasts((prev) => [...prev, { id, tone, message }]);
      window.setTimeout(() => remove(id), 4500);
    },
    [remove],
  );

  const value: ToastContextValue = {
    toast,
    success: (m) => toast(m, 'success'),
    error: (m) => toast(m, 'error'),
    info: (m) => toast(m, 'info'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={cn(
              'flex items-start gap-3 rounded-md border border-charcoal-200 border-l-4 bg-white px-4 py-3 shadow-elevated animate-slide-up',
              toneStyles[t.tone].bar,
            )}
          >
            <span className="mt-0.5 shrink-0">{toneStyles[t.tone].icon}</span>
            <p className="flex-1 text-sm text-charcoal-800">{t.message}</p>
            <button
              onClick={() => remove(t.id)}
              className="shrink-0 text-charcoal-400 hover:text-charcoal-700"
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
