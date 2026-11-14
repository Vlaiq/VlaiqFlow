import { useEffect, useState } from 'react';
import { Navigation2, X } from 'lucide-react';

const SECONDS = 8;

/**
 * Hands-free start after FLOW Voice picked a car route: counts down, then opens navigation.
 * The driver can cancel with one large button; nothing starts if the banner is dismissed.
 */
export function AutoNavigate({
  parking,
  onGo,
  onCancel,
}: {
  parking: string;
  onGo: () => void;
  onCancel: () => void;
}) {
  const [left, setLeft] = useState(SECONDS);
  useEffect(() => {
    if (left <= 0) {
      onGo();
      return;
    }
    const t = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left, onGo]);
  return (
    <section className="flow-auto-nav" role="status" aria-live="polite">
      <Navigation2 size={20} aria-hidden="true" />
      <p>
        Pornesc navigația spre <strong>{parking}</strong> în {left} s.
      </p>
      <button type="button" onClick={onGo} className="flow-auto-nav-go">
        Pornește acum
      </button>
      <button type="button" onClick={onCancel} aria-label="Anulează pornirea navigației">
        <X size={16} aria-hidden="true" /> Anulează
      </button>
    </section>
  );
}
