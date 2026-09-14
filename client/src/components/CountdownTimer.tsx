import { useEffect, useState } from 'react';

function diff(target: number) {
  const total = Math.max(0, target - Date.now());
  const days = Math.floor(total / (1000 * 60 * 60 * 24));
  const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((total / (1000 * 60)) % 60);
  const seconds = Math.floor((total / 1000) % 60);
  return { total, days, hours, minutes, seconds };
}

export function CountdownTimer({
  target,
  label = 'Time remaining',
  onExpire,
}: {
  target: string | Date;
  label?: string;
  onExpire?: () => void;
}) {
  const targetMs = new Date(target).getTime();
  const [time, setTime] = useState(() => diff(targetMs));

  useEffect(() => {
    const id = setInterval(() => {
      const next = diff(targetMs);
      setTime(next);
      if (next.total <= 0) {
        clearInterval(id);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [targetMs, onExpire]);

  const units = [
    { value: time.days, label: 'Days' },
    { value: time.hours, label: 'Hrs' },
    { value: time.minutes, label: 'Min' },
    { value: time.seconds, label: 'Sec' },
  ];

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-charcoal-500">{label}</p>
      <div className="flex gap-2" aria-live="off">
        {units.map((u) => (
          <div
            key={u.label}
            className="flex min-w-[3.25rem] flex-col items-center rounded-md border border-charcoal-200 bg-white px-2 py-2"
          >
            <span className="font-display text-xl font-bold tabular-nums text-amr-navy">
              {String(u.value).padStart(2, '0')}
            </span>
            <span className="text-[10px] font-medium uppercase text-charcoal-400">{u.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
