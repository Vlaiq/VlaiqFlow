import { useEffect, useState } from 'react';
import { ChevronRight, Info, ParkingSquare, RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  TARIFF_LABEL_RO,
  type Destination,
  type Coordinate,
  type RecommendationOption,
  type RecommendationResponse,
} from '@vlaiq/shared';
import { QualityBadge } from '../../components/QualityBadge';
import { api } from '../../services/api';
import { KIND_LABEL, pct, priceText, stayLabel } from './recommendationLabels';
import { FreeChance, ScoreBreakdown } from './ParkingFacts';
import { PARKING_MODE_LABEL, arriveIso, localInputValue, type ParkingSettings } from './settings';

const MODES: { id: ParkingSettings['mode']; hint: string }[] = [
  { id: 'balanced', hint: 'mersul, șansele de loc și prețul, la fel de important' },
  { id: 'cheap', hint: 'prețul contează mai mult' },
  { id: 'less_walk', hint: 'mersul pe jos contează mai mult' },
];
const STAYS = [30, 60, 120, 180, 300, 480];

type State =
  | { state: 'loading' }
  | { state: 'ok'; data: RecommendationResponse }
  | { state: 'error'; message: string };

interface Props {
  destination: Destination;
  origin?: Coordinate | null;
  settings: ParkingSettings;
  onSettings: (next: ParkingSettings) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** The user picked an option in the list: select it and show it on the map. */
  onPick: (id: string) => void;
  /** Opens the presentation of one parking (details + directions). */
  onOpen: (id: string) => void;
  onResult: (data: RecommendationResponse | null) => void;
}

/** SmartMatch results for the chosen destination (spec §6.5–6.6). Every number comes from the backend engine. */
export function ParkingRecommendations({
  destination,
  origin,
  settings,
  onSettings,
  selectedId,
  onSelect,
  onPick,
  onOpen,
  onResult,
}: Props) {
  const { mode, stayMinutes: stay, maxWalkMinutes: maxWalk, arrive } = settings;
  const set = (patch: Partial<ParkingSettings>) => onSettings({ ...settings, ...patch });
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<State>({ state: 'loading' });
  const arriveAt = arriveIso(settings);

  const loc = destination.location;
  useEffect(() => {
    if (!loc) return;
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, 20000);
    setResult({ state: 'loading' });
    api
      .recommend(
        {
          destination: [loc.lng, loc.lat],
          ...(origin ? { origin } : {}),
          mode,
          stayMinutes: stay,
          maxWalkMinutes: maxWalk,
          ...(arriveAt ? { arriveAt } : {}),
        },
        ctrl.signal,
      )
      .then(
        (data) => {
          setResult({ state: 'ok', data });
          onResult(data);
          onSelect(data.options[0]?.id ?? null);
        },
        (e: unknown) => {
          if (ctrl.signal.aborted && !timedOut) return;
          setResult({
            state: 'error',
            message: timedOut
              ? 'Serverul nu a răspuns la timp.'
              : e instanceof Error
                ? e.message
                : String(e),
          });
          onResult(null);
        },
      );
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc?.lng, loc?.lat, origin?.[0], origin?.[1], mode, stay, arriveAt, maxWalk, attempt]);

  useEffect(() => () => onResult(null), [onResult]);

  if (!loc) return null;

  return (
    <section aria-labelledby="reco-title" className="parking-panel">
      <div className="parking-panel-heading">
        <span className="parking-panel-icon">
          <ParkingSquare size={20} aria-hidden />
        </span>
        <div>
          <span className="parking-panel-eyebrow">SMARTMATCH · PARCARE</span>
          <h2 id="reco-title">Unde parchezi</h2>
        </div>
      </div>
      <p className="parking-panel-description">
        Comparăm parcările Timpark și OpenStreetMap din jurul destinației după mersul pe jos, șansele
        estimate de loc și costul pentru {stayLabel(stay)}.
      </p>

      <div
        role="radiogroup"
        aria-label="Preferințe pentru parcare"
        className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1"
      >
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            onClick={() => set({ mode: m.id })}
            className={`min-h-11 rounded-lg px-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
              mode === m.id ? 'bg-primary text-primary-fg' : 'text-muted hover:text-text'
            }`}
          >
            {PARKING_MODE_LABEL[m.id]}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">Contează: {MODES.find((m) => m.id === mode)!.hint}.</p>

      <div className="parking-settings">
        <label>
          Stai cât?
          <select value={stay} onChange={(e) => set({ stayMinutes: Number(e.target.value) })}>
            {STAYS.map((s) => (
              <option key={s} value={s}>
                {stayLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mergi pe jos maximum
          <select value={maxWalk} onChange={(e) => set({ maxWalkMinutes: Number(e.target.value) })}>
            {[5, 8, 12, 15, 20].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>
        <label className="parking-settings-wide">
          Când ajungi? (pentru tarif și șanse)
          <span>
            <input
              type="datetime-local"
              value={arrive ?? localInputValue(new Date())}
              min="2020-01-01T00:00"
              max="2100-12-31T23:59"
              onChange={(e) => set({ arrive: e.target.value || null })}
            />
            <button type="button" onClick={() => set({ arrive: null })} disabled={arrive == null}>
              Acum
            </button>
          </span>
        </label>
      </div>

      <div className="mt-3" aria-live="polite">
        {result.state === 'loading' && (
          <div className="parking-loading" role="status">
            <span className="parking-loading-track" />
            <p>Calculăm cea mai bună parcare…</p>
          </div>
        )}

        {result.state === 'error' && (
          <div role="alert" className="rounded-xl border border-border p-3 text-xs">
            <p className="text-warning">{result.message}</p>
            <p className="mt-1 text-muted">Parcările rămân vizibile pe hartă.</p>
            <button
              type="button"
              onClick={() => setAttempt((a) => a + 1)}
              className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-lg border border-border px-3 font-semibold"
            >
              <RotateCcw className="h-3 w-3" aria-hidden /> Încearcă din nou
            </button>
          </div>
        )}

        {result.state === 'ok' && result.data.options.length === 0 && (
          <div className="rounded-xl border border-border p-3 text-xs">
            <p>Nicio parcare cunoscută la cel mult {maxWalk} min de mers pe jos.</p>
            {maxWalk < 20 && (
              <button
                type="button"
                onClick={() => set({ maxWalkMinutes: 20 })}
                className="mt-2 min-h-11 rounded-lg border border-border px-3 font-semibold"
              >
                Caută până la 20 min
              </button>
            )}
          </div>
        )}

        {result.state === 'ok' && result.data.options.length > 0 && (
          <>
            {result.data.explanation && (
              <p className="parking-explanation">
                <SlidersHorizontal size={13} aria-hidden /> {result.data.explanation}
              </p>
            )}
            <ol className="flex flex-col gap-2">
              {result.data.options.map((o, i) => (
                <OptionCard
                  key={o.id}
                  option={o}
                  rank={i + 1}
                  selected={o.id === selectedId}
                  onSelect={() => onPick(o.id)}
                  onOpen={() => onOpen(o.id)}
                  stayMinutes={result.data.stayMinutes}
                  params={result.data.params}
                  hasOrigin={!!origin}
                />
              ))}
            </ol>
            <p className="parking-considered">
              Am analizat {result.data.considered} parcări la cel mult {maxWalk} min de mers.
            </p>
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
  onOpen,
  stayMinutes,
  params,
  hasOrigin,
}: {
  option: RecommendationOption;
  rank: number;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  stayMinutes: number;
  params: RecommendationResponse['params'];
  hasOrigin: boolean;
}) {
  const badge = rank === 1 ? 'Recomandat' : rank === 2 ? 'Rezervă' : null;

  return (
    <li
      className={`parking-result-card rounded-xl border p-4 ${selected ? 'border-primary bg-primary/5' : 'border-border'} ${rank === 1 ? 'ring-1 ring-primary/40' : ''}`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="flex w-full items-start gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
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

      <FreeChance value={o.pFree.value} quality={o.pFree.quality} compact />

      <dl className="parking-card-facts">
        <div>
          <dt>Pe jos până la destinație</dt>
          <dd>
            ~{Math.max(1, Math.round(o.walk.minutes))} min · {o.walk.meters} m
          </dd>
        </div>
        <div>
          <dt>Cost pentru {stayLabel(stayMinutes)}</dt>
          <dd>
            {priceText(o)} <QualityBadge quality={o.price.quality} />
          </dd>
        </div>
        <div>
          <dt>Drum auto + pe jos</dt>
          <dd>
            {o.journeyMinutes != null
              ? `~${Math.max(1, Math.round(o.journeyMinutes))} min`
              : hasOrigin
                ? 'Necunoscut'
                : 'Alege plecarea'}
          </dd>
        </div>
        <div>
          <dt>Capacitate</dt>
          <dd>{o.capacity.value != null ? `~${o.capacity.value} locuri` : 'Necunoscută'}</dd>
        </div>
      </dl>
      <p className="parking-card-quality">
        Estimare, nu loc confirmat. Durata nu include căutarea unui loc.
      </p>

      {o.flags.length > 0 && (
        <ul className="mt-2 list-disc pl-4 text-xs text-warning">
          {o.flags.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}

      <details className="parking-card-source">
        <summary>De ce pe locul {rank}?</summary>
        <ScoreBreakdown
          score={o.cost}
          price={{ amount: o.price.total, currency: o.price.currency }}
          freeChance={o.pFree.value}
          params={params}
        />
        <p>{o.walk.source}</p>
        <p>
          {o.price.source} · {o.price.note}
        </p>
        <p>{o.drive?.source ?? 'Alege plecarea pentru a calcula drumul auto.'}</p>
        <p>
          Șanse ~{pct(o.pFree.value)} din: {o.pFree.factors.join('; ')}. {o.pFree.source}
        </p>
      </details>

      <button
        type="button"
        onClick={onOpen}
        className={`mt-2 inline-flex min-h-11 items-center gap-1 rounded-xl px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
          rank === 1 ? 'bg-primary text-primary-fg' : 'border border-border text-text'
        }`}
      >
        Detalii și traseu <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
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
          Fiecare parcare primește un cost în minute:{' '}
          <strong className="text-text">
            minute pe jos + (1 − șanse de loc) × {params.fullPenaltyMinutes} min + preț ×{' '}
            {params.minutesPerCurrency} min
          </strong>
          . {params.fullPenaltyMinutes} min este timpul pierdut dacă parcarea e plină și cauți alta.
          Câștigă costul cel mai mic. Când alegi plecarea, în Smart Journey se adaugă și minutele de
          condus.
        </p>
        <p>{data.model.note}</p>
        <p>
          Model: {data.model.name}. Am analizat {data.considered} parcări la cel mult{' '}
          {params.maxWalkMinutes} min de mers.
        </p>
        <p>
          Prețurile Timpark vin de la Primărie și țin cont de programul plătit la ora aleasă. Un
          preț necunoscut nu este socotit gratuit.
        </p>
      </div>
    </details>
  );
}
