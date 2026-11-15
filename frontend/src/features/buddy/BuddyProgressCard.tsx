import { useEffect, useState } from 'react';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import type { BuddySnapshot } from '../../../../shared/src/buddy/contracts';
import { accountBuddy } from './accountClient';
export function BuddyProgressCard() {
  const [state, setState] = useState<BuddySnapshot | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    accountBuddy
      .state(c.signal)
      .then((s) => {
        if (!c.signal.aborted) setState(s);
      })
      .catch(() => {
        if (!c.signal.aborted) setError(true);
      });
    return () => c.abort();
  }, []);
  return (
    <section className="passport-card" aria-label="Progres educațional FLOW Buddy">
      <div className="identity-section-heading">
        <h2>Ideile tale mai verzi.</h2>
        <Sparkles size={20} />
      </div>
      <p>
        {state
          ? `${state.progress.level} · ${state.progress.completed.length} / 6 lecții finalizate`
          : error
            ? 'Progresul Buddy nu este disponibil acum.'
            : 'Încărcăm progresul Buddy…'}
      </p>
      {state && state.progress.completed.length > 0 && (
        <ul>
          {state.progress.completed.map((c) => (
            <li key={c.missionId}>
              {
                {
                  'city-balance': 'Un centru care respiră',
                  'green-route': 'Ultimul kilometru',
                  'smart-parking': 'Mai puține ture',
                  energy: 'Energia la frânare',
                  'time-tradeoff': 'La timp, cu grijă',
                  misconception: 'Dincolo de slogan',
                }[c.missionId]
              }{' '}
              · {new Date(c.completedAt).toLocaleDateString('ro-RO')}
            </li>
          ))}
        </ul>
      )}
      <a className="identity-secondary" href="/buddy">
        Descoperă FLOW Buddy <ArrowUpRight size={16} />
      </a>
      <p>Progres educațional verificat de server, separat de activitățile GPS.</p>
    </section>
  );
}
