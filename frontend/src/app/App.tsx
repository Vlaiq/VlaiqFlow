import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { brand, type HealthResponse, type ParkingsResponse, type TimparkSnapshot } from '@vlaiq/shared';
import { MapView } from '../features/map/MapView';
import { TariffLegend } from '../features/parking/TariffLegend';
import { api } from '../services/api';

type Load<T> = { state: 'loading' } | { state: 'ok'; data: T } | { state: 'error'; message: string };

function useLoad<T>(fn: () => Promise<T>): Load<T> {
  const [value, setValue] = useState<Load<T>>({ state: 'loading' });
  useEffect(() => {
    let alive = true;
    fn().then(
      (data) => alive && setValue({ state: 'ok', data }),
      (e: unknown) => alive && setValue({ state: 'error', message: String(e) }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

export function App() {
  const health = useLoad<HealthResponse>(api.health);
  const parkings = useLoad<ParkingsResponse>(api.parkings);
  const timpark = useLoad<TimparkSnapshot>(api.timpark);

  const parkingList = parkings.state === 'ok' ? parkings.data.parkings : [];
  const timparkData = timpark.state === 'ok' ? timpark.data : null;

  return (
    <main className="relative h-full w-full overflow-hidden">
      <MapView parkings={parkingList} timpark={timparkData} />

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

      {/* Info sheet — replaced later by the results bottom sheet */}
      <section
        aria-live="polite"
        className="absolute inset-x-0 bottom-0 z-10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto max-w-xl rounded-card border border-border bg-surface/95 p-4 text-sm shadow-lg">
          {timpark.state === 'loading' && <p className="text-muted">Se încarcă zonele de parcare…</p>}
          {timpark.state === 'error' && (
            <p className="text-warning">Zonele Timpark nu sunt disponibile. Rulează pnpm data:city și repornește backend-ul.</p>
          )}
          {timparkData && <TariffLegend snapshot={timparkData} />}

          <p className="mt-3 border-t border-border pt-2 text-xs text-muted">
            {parkings.state === 'ok' && parkingList.length > 0
              ? `${parkingList.length} parcări din OpenStreetMap (puncte deschise la culoare)`
              : 'Parcările din OpenStreetMap nu sunt încă încărcate'}
            {' · Backend: '}
            {health.state === 'ok' ? 'online' : health.state === 'loading' ? 'se verifică…' : 'offline'}
          </p>
        </div>
      </section>
    </main>
  );
}
