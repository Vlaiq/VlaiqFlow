import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { brand, type HealthResponse, type ParkingsResponse } from '@vlaiq/shared';
import { MapView } from '../features/map/MapView';
import { QualityBadge } from '../components/QualityBadge';
import { api } from '../services/api';

type Load<T> = { state: 'loading' } | { state: 'ok'; data: T } | { state: 'error'; message: string };

export function App() {
  const [health, setHealth] = useState<Load<HealthResponse>>({ state: 'loading' });
  const [parkings, setParkings] = useState<Load<ParkingsResponse>>({ state: 'loading' });

  useEffect(() => {
    api.health().then(
      (data) => setHealth({ state: 'ok', data }),
      (e: unknown) => setHealth({ state: 'error', message: String(e) }),
    );
    api.parkings().then(
      (data) => setParkings({ state: 'ok', data }),
      (e: unknown) => setParkings({ state: 'error', message: String(e) }),
    );
  }, []);

  const list = parkings.state === 'ok' ? parkings.data.parkings : [];

  return (
    <main className="relative h-full w-full overflow-hidden">
      <MapView parkings={list} />

      {/* Floating top bar — safe-area aware for notched phones */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto mx-auto flex max-w-xl items-center gap-3 rounded-card border border-border bg-surface/95 px-4 py-3 shadow-lg">
          <span className="text-sm font-semibold tracking-wide text-primary">{brand.product}</span>
          <label className="flex flex-1 items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
            <Search className="h-4 w-4 text-muted" aria-hidden />
            <span className="sr-only">Caută destinația</span>
            <input
              disabled
              placeholder="Caută destinația (în curând)"
              className="w-full bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
            />
          </label>
        </div>
      </header>

      {/* Status sheet — replaced later by the results bottom sheet */}
      <section
        aria-live="polite"
        className="absolute inset-x-0 bottom-0 z-10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto max-w-xl rounded-card border border-border bg-surface/95 p-4 text-sm shadow-lg">
          {parkings.state === 'loading' && <p className="text-muted">Se încarcă parcările…</p>}
          {parkings.state === 'error' && (
            <p className="text-warning">Nu am putut încărca parcările. Backend-ul pornește? ({parkings.message})</p>
          )}
          {parkings.state === 'ok' && list.length === 0 && (
            <p className="text-muted">
              Nicio parcare încărcată. Rulează <code className="text-text">pnpm data:parkings</code> și repornește backend-ul.
            </p>
          )}
          {parkings.state === 'ok' && list.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span>
                <strong>{list.length}</strong> parcări din OpenStreetMap
              </span>
              <span className="text-muted">· disponibilitate</span>
              <QualityBadge quality="unknown" />
            </div>
          )}
          <p className="mt-2 text-xs text-muted">
            Backend:{' '}
            {health.state === 'ok' ? 'online' : health.state === 'loading' ? 'se verifică…' : 'offline'}
            {health.state === 'ok' && ` · rutare ${health.data.integrations.routing === 'configured' ? 'configurată' : 'neconfigurată'}`}
          </p>
        </div>
      </section>
    </main>
  );
}
