import { useEffect, useState } from 'react';
import { Footprints, Info, Navigation, ParkingSquare, RotateCcw } from 'lucide-react';
import {
  TARIFF_LABEL_RO,
  formatAmountRo,
  type Destination,
  type RecommendationMode,
  type RecommendationOption,
  type RecommendationResponse,
} from '@vlaiq/shared';
import { QualityBadge } from '../../components/QualityBadge';
import { api } from '../../services/api';

const MODES: { id: RecommendationMode; label: string; hint: string }[] = [
  { id: 'balanced', label: 'Echilibrat', hint: 'timp, șanse de loc și preț' },
  { id: 'cheap', label: 'Ieftin', hint: 'prețul contează mai mult' },
  { id: 'sure', label: 'Loc sigur', hint: 'evită parcările care se pot umple' },
];
const STAYS = [30, 60, 120, 180, 300, 480];
const stayLabel = (m: number) => (m < 60 ? `${m} min` : `${m / 60} h`);

const KIND_LABEL: Record<RecommendationOption['kind'], string> = {
  timpark_lot: 'Parcare Timpark',
  timpark_street: 'Parcare cu plată pe stradă (Timpark)',
  osm: 'Parcare din OpenStreetMap',
};

/** Value for <input type="datetime-local"> in the device's local time. */
function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function priceText(o: RecommendationOption): string {
  if (o.price.total == null) return 'Necunoscut';
  if (o.price.total === 0) return 'Gratuit';
  return `${formatAmountRo(o.price.total)} ${o.price.currency ?? ''}`.trim();
}

const fmt1 = (n: number) => n.toLocaleString('ro-RO', { maximumFractionDigits: 1 });

type State =
  | { state: 'loading' }
  | { state: 'ok'; data: RecommendationResponse }
  | { state: 'error'; message: string };

interface Props {
  destination: Destination;
  smsNumber: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** The user picked an option in the list: select it and show it on the map. */
  onPick: (id: string) => void;
  onOptions: (options: RecommendationOption[]) => void;
}

/** SmartMatch results for the chosen destination (spec §6.5–6.6). Every number comes from the backend engine. */
export function ParkingRecommendations({ destination, smsNumber, selectedId, onSelect, onPick, onOptions }: Props) {
  const [mode, setMode] = useState<RecommendationMode>('balanced');
  const [stay, setStay] = useState(120);
  const [arrive, setArrive] = useState<string | null>(null); // null = now
  const [maxWalk, setMaxWalk] = useState(12);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<State>({ state: 'loading' });

  const loc = destination.location;
  useEffect(() => {
    if (!loc) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 20000);
    setResult({ state: 'loading' });
    api
      .recommend(
        {
          destination: [loc.lng, loc.lat],
          mode,
          stayMinutes: stay,
          maxWalkMinutes: maxWalk,
          ...(arrive ? { arriveAt: new Date(arrive).toISOString() } : {}),
        },
        ctrl.signal,
      )
      .then(
        (data) => {
          setResult({ state: 'ok', data });
          onOptions(data.options);
          onSelect(data.options[0]?.id ?? null);
        },
        (e: unknown) => {
          if (ctrl.signal.aborted && !(e instanceof Error && e.name === 'TimeoutError')) return;
          setResult({ state: 'error', message: e instanceof Error ? e.message : String(e) });
          onOptions([]);
        },
      );
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc?.lng, loc?.lat, mode, stay, arrive, maxWalk, attempt]);

  useEffect(() => () => onOptions([]), [onOptions]);

  if (!loc) return null;

  return (
    <section aria-labelledby="reco-title" className="mb-3 border-b border-border pb-3">
      <div className="flex items-center gap-2">
        <ParkingSquare className="h-4 w-4 text-primary" aria-hidden />
        <h2 id="reco-title" className="text-sm font-semibold">Unde parchezi</h2>
        <span className="text-xs text-muted">· Where to park</span>
      </div>

      <div role="radiogroup" aria-label="Ce contează mai mult" className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            onClick={() => setMode(m.id)}
            className={`min-h-11 rounded-lg px-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
              mode === m.id ? 'bg-primary text-primary-fg' : 'text-muted hover:text-text'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">Contează: {MODES.find((m) => m.id === mode)!.hint}.</p>

      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <label className="flex flex-col gap-1 text-muted">
          Stai cât?
          <select
            value={stay}
            onChange={(e) => setStay(Number(e.target.value))}
            className="min-h-11 rounded-lg border border-border bg-surface-2 px-2 text-sm text-text"
          >
            {STAYS.map((s) => (
              <option key={s} value={s}>{stayLabel(s)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-muted">
          Mergi pe jos maximum
          <select
            value={maxWalk}
            onChange={(e) => setMaxWalk(Number(e.target.value))}
            className="min-h-11 rounded-lg border border-border bg-surface-2 px-2 text-sm text-text"
          >
            {[5, 8, 12, 15, 20].map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-muted">
          Când ajungi?
          <span className="flex gap-2">
            <input
              type="datetime-local"
              value={arrive ?? localInputValue(new Date())}
              onChange={(e) => setArrive(e.target.value || null)}
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2 text-sm text-text [color-scheme:dark]"
            />
            <button
              type="button"
              onClick={() => setArrive(null)}
              disabled={arrive == null}
              className="min-h-11 rounded-lg border border-border px-3 text-xs font-semibold text-text disabled:opacity-50"
            >
              Acum
            </button>
          </span>
        </label>
      </div>

      <div className="mt-3" aria-live="polite">
        {result.state === 'loading' && <p role="status" className="text-xs text-muted">Calculăm cea mai bună parcare…</p>}

        {result.state === 'error' && (
          <div role="alert" className="rounded-xl border border-border p-3 text-xs">
            <p className="text-warning">{result.message}</p>
            <p className="mt-1 text-muted">Parcările rămân vizibile pe hartă.</p>
            <button type="button" onClick={() => setAttempt((a) => a + 1)} className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-lg border border-border px-3 font-semibold">
              <RotateCcw className="h-3 w-3" aria-hidden /> Încearcă din nou
            </button>
          </div>
        )}

        {result.state === 'ok' && result.data.options.length === 0 && (
          <div className="rounded-xl border border-border p-3 text-xs">
            <p>Nicio parcare cunoscută la cel mult {maxWalk} min de mers pe jos.</p>
            {maxWalk < 20 && (
              <button type="button" onClick={() => setMaxWalk(20)} className="mt-2 min-h-11 rounded-lg border border-border px-3 font-semibold">
                Caută până la 20 min
              </button>
            )}
          </div>
        )}

        {result.state === 'ok' && result.data.options.length > 0 && (
          <>
            {result.data.explanation && <p className="mb-2 text-xs leading-relaxed text-muted">{result.data.explanation}</p>}
            <ol className="flex flex-col gap-2">
              {result.data.options.map((o, i) => (
                <OptionCard
                  key={o.id}
                  option={o}
                  rank={i + 1}
                  selected={o.id === selectedId}
                  onSelect={() => onPick(o.id)}
                  smsNumber={smsNumber}
                  destinationName={destination.name}
                  stayMinutes={result.data.stayMinutes}
                />
              ))}
            </ol>
            <HowWeRank data={result.data} />
          </>
        )}
      </div>
    </section>
  );
}

function OptionCard({
  option: o,
  rank,
  selected,
  onSelect,
  smsNumber,
  destinationName,
  stayMinutes,
}: {
  option: RecommendationOption;
  rank: number;
  selected: boolean;
  onSelect: () => void;
  smsNumber: string | null;
  destinationName: string;
  stayMinutes: number;
}) {
  const navHref = `/navigation?${new URLSearchParams({
    to: `${o.coordinate[0].toFixed(6)},${o.coordinate[1].toFixed(6)}`,
    name: o.name,
    area: `Parcare pentru ${destinationName}`,
  }).toString()}`;
  const badge = rank === 1 ? 'Recomandat' : rank === 2 ? 'Rezervă' : null;

  return (
    <li
      className={`rounded-xl border p-3 ${selected ? 'border-primary bg-primary/5' : 'border-border'} ${rank === 1 ? 'ring-1 ring-primary/40' : ''}`}
    >
      <button type="button" onClick={onSelect} aria-pressed={selected} className="flex w-full items-start gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${rank === 1 ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-text'}`}
          aria-hidden
        >
          {rank}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2">
            <span className="font-semibold leading-tight">{o.name}</span>
            {badge && <span className="text-xs font-semibold text-primary">{badge}</span>}
          </span>
          <span className="block text-xs text-muted">
            {KIND_LABEL[o.kind]}
            {o.tariff ? ` · tarif ${TARIFF_LABEL_RO[o.tariff]}` : ''}
          </span>
        </span>
      </button>

      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted">Pe jos</dt>
          <dd className="flex items-center gap-1 font-semibold tabular-nums">
            <Footprints className="h-3 w-3" aria-hidden />
            {Math.max(1, Math.round(o.walk.minutes))} min
          </dd>
          <dd className="text-muted tabular-nums">{o.walk.meters} m</dd>
        </div>
        <div>
          <dt className="text-muted">Șanse de loc</dt>
          <dd className="font-semibold tabular-nums">~{Math.round(o.pFree.value * 100)}%</dd>
          <dd><QualityBadge quality={o.pFree.quality} /></dd>
        </div>
        <div>
          <dt className="text-muted">Cost {stayLabel(stayMinutes)}</dt>
          <dd className="font-semibold tabular-nums">{priceText(o)}</dd>
          <dd><QualityBadge quality={o.price.quality} /></dd>
        </div>
      </dl>

      {o.flags.length > 0 && (
        <ul className="mt-2 list-disc pl-4 text-xs text-warning">
          {o.flags.map((f) => <li key={f}>{f}</li>)}
        </ul>
      )}

      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted hover:text-text">De ce această poziție?</summary>
        <ul className="mt-1 space-y-0.5 text-muted">
          <li>Șanse de loc estimate din: {o.pFree.factors.join('; ')}.</li>
          <li>Preț: {o.price.note}</li>
          <li>
            Scor: mers {fmt1(o.cost.walk)} + risc de plin {fmt1(o.cost.risk)} + preț {fmt1(o.cost.price)} ={' '}
            <strong className="text-text">{fmt1(o.cost.total)} min echivalente</strong> (mai puțin = mai bine).
          </li>
          <li>Capacitate: {o.capacity.value != null ? `${o.capacity.value} locuri (${o.capacity.source})` : 'necunoscută'}.</li>
          <li>Mers pe jos: {o.walk.source}.</li>
        </ul>
      </details>

      {o.smsCode && smsNumber && o.price.total !== 0 && (
        <p className="mt-2 text-xs">
          Plată prin SMS: trimite <strong>{o.smsCode}</strong> la <strong>{smsNumber}</strong> sau plătește în CityApp.
        </p>
      )}

      <a
        href={navHref}
        className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Navigation className="h-4 w-4" aria-hidden />
        Navighează la parcare
      </a>
    </li>
  );
}

function HowWeRank({ data }: { data: RecommendationResponse }) {
  const { params } = data;
  return (
    <details className="mt-3 rounded-xl border border-border p-3 text-xs">
      <summary className="flex cursor-pointer items-center gap-1 font-semibold">
        <Info className="h-3 w-3" aria-hidden /> Cum calculăm
      </summary>
      <div className="mt-2 space-y-1 text-muted">
        <p>
          Fiecare parcare primește un cost în minute: <strong className="text-text">minute pe jos + (1 − șanse de loc) × {params.fullPenaltyMinutes} min
          + preț × {params.minutesPerCurrency} min</strong>. {params.fullPenaltyMinutes} min este timpul pierdut dacă parcarea e plină și cauți alta.
          Câștigă costul cel mai mic.
        </p>
        <p>{data.model.note}</p>
        <p>Model: {data.model.name}. Am analizat {data.considered} parcări la cel mult {params.maxWalkMinutes} min de mers.</p>
        <p>Prețurile Timpark vin de la Primărie și țin cont de programul plătit la ora aleasă. Un preț necunoscut nu este socotit gratuit.</p>
      </div>
    </details>
  );
}
