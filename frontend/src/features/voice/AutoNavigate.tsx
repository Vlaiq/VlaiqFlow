import { Navigation2, X } from 'lucide-react';

/**
 * After FLOW Voice picked a car route: one tap (or "hai să mergem") opens navigation.
 * Nothing starts on its own, so the driver is never moved to GPS unexpectedly.
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
  return (
    <section className="flow-auto-nav" aria-label={`Navigație spre ${parking}`}>
      <Navigation2 size={20} aria-hidden="true" />
      <p>
        <strong>{parking}</strong>
      </p>
      <button type="button" onClick={onGo} className="flow-auto-nav-go">
        Pornește navigația
      </button>
      <button type="button" onClick={onCancel} aria-label="Închide">
        <X size={16} aria-hidden="true" />
      </button>
    </section>
  );
}
