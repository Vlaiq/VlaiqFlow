import { useEffect, useMemo, useState } from 'react';
import { Calculator, CircleHelp, Clock, Gauge, Layers, MapPin, Ruler, Shuffle, Sigma, Target } from 'lucide-react';
import type { AvailabilityExplainResponse, AvailabilityModelResponse } from '@vlaiq/shared';
import { QualityBadge } from '../../components/QualityBadge';
import { api } from '../../services/api';
import { chanceLevel } from '../parking/recommendationLabels';
import '../city/city.css';
import './parkingData.css';
import './chance.css';

const pct = (p: number) => `${Math.round(p * 100)}%`;
const num = (v: number, d = 2) => v.toLocaleString('ro-RO', { maximumFractionDigits: d, minimumFractionDigits: d });
const DAY_RO = { weekday: 'zi lucrătoare', saturday: 'sâmbătă', sunday: 'duminică' } as const;
/** A fixed scenario so the worked example reads the same for everyone (Friday 20 Nov 2026, 19:00). */
const EXAMPLE = { profile: 'centre', at: '2026-11-20T19:00:00+02:00', capacity: 20 };

/** Local Timișoara date and time now, as input values. */
function nowInputs() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
}

/** "2026-11-20" + "19:00" in Timișoara → ISO with the right offset (EET/EEST). */
function bucharestIso(date: string, time: string): string | null {
  const guess = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(guess)) return null;
  const local = (t: number) => {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Bucharest',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(t));
    const g = (k: string) => p.find((x) => x.type === k)?.value ?? '00';
    return Date.parse(`${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:00Z`);
  };
  const offsetMin = Math.round((local(guess) - guess) / 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
  const mm = String(Math.abs(offsetMin) % 60).padStart(2, '0');
  return `${date}T${time}:00${sign}${hh}:${mm}`;
}

type Load<T> = { state: 'idle' | 'loading' } | { state: 'ok'; data: T } | { state: 'error' };

function useExplain(q: { profile: string; at: string | null; capacity?: number }, delay = 300) {
  const [res, setRes] = useState<Load<AvailabilityExplainResponse>>({ state: 'idle' });
  useEffect(() => {
    if (!q.at) return;
    let alive = true;
    setRes((r) => (r.state === 'ok' ? r : { state: 'loading' }));
    const timer = setTimeout(() => {
      api
        .explainAvailability({ profile: q.profile, at: q.at!, ...(q.capacity ? { capacity: q.capacity } : {}) })
        .then(
          (data) => alive && setRes({ state: 'ok', data }),
          () => alive && setRes({ state: 'error' }),
        );
    }, delay);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q.profile, q.at, q.capacity, delay]);
  return res;
}

/** Ten arrivals: how a probability reads in everyday terms. */
function TenArrivals({ p }: { p: number }) {
  const found = Math.round(p * 10);
  return (
    <div className="chance-ten" role="img" aria-label={`Din 10 sosiri în condiții la fel, cam ${found} găsesc loc și ${10 - found} nu.`}>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={i < found ? 'found' : 'missed'} aria-hidden>
          {i < found ? 'P' : '×'}
        </span>
      ))}
    </div>
  );
}

/**
 * How the busy share varies from day to day: the Beta density the model uses, with the line above
 * which the parking counts as full. Only a picture of the distribution; the answer comes from the server.
 */
function SpreadChart({ d }: { d: AvailabilityExplainResponse['detail'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 190;
  const pad = { l: 40, r: 12, t: 12, b: 28 };
  const BINS = 20;
  // Share of days in each 5-point occupancy band: the Beta density integrated with a fine midpoint rule.
  const STEPS = 200;
  const lnDens = (x: number) => (d.alpha - 1) * Math.log(x) + (d.beta - 1) * Math.log(1 - x);
  const raw = Array.from({ length: BINS }, (_, b) => {
    let s = 0;
    for (let i = 0; i < STEPS; i++) s += Math.exp(lnDens((b + (i + 0.5) / STEPS) / BINS));
    return s;
  });
  const total = raw.reduce((a, b) => a + b, 0) || 1;
  const mass = raw.map((v) => v / total);
  const top = Math.max(...mass, 0.01);
  const threshold = 1 - d.needed / d.capacityUsed;
  const bw = (W - pad.l - pad.r) / BINS;
  const X = (x: number) => pad.l + x * (W - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const yTicks = [0, top / 2, top].map((v) => Math.round(v * 100) / 100);
  return (
    <figure className="chance-figure">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Din 100 de zile, câte au fiecare nivel de ocupare. Media ${pct(d.expected)}. Peste aproximativ ${pct(threshold)} ocupare parcarea e de obicei plină.`}
        onMouseLeave={() => setHover(null)}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={Y(v)} y2={Y(v)} className="pdata-grid" />
            <text x={pad.l - 6} y={Y(v) + 4} textAnchor="end" className="pdata-axis">
              {Math.round(v * 100)}%
            </text>
          </g>
        ))}
        {mass.map((m, b) => {
          const full = (b + 0.5) / BINS > threshold;
          const h = Math.max(0, Y(0) - Y(m));
          return (
            <g key={b} onMouseEnter={() => setHover(b)}>
              <rect x={X(b / BINS)} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              <rect
                x={X(b / BINS) + 1}
                y={Y(0) - h}
                width={bw - 2}
                height={h}
                rx={Math.min(3, h / 2)}
                className={`chance-bar ${full ? 'full' : 'free'} ${hover === b ? 'is-hover' : ''}`}
              />
            </g>
          );
        })}
        <line x1={X(d.expected)} x2={X(d.expected)} y1={pad.t} y2={H - pad.b} className="chance-mean" />
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <text key={v} x={X(v)} y={H - 8} textAnchor={v === 0 ? 'start' : v === 1 ? 'end' : 'middle'} className="pdata-axis">
            {v * 100}%
          </text>
        ))}
      </svg>
      <figcaption aria-live="polite">
        {hover != null ? (
          <span>
            Ocupare {hover * 5}–{hover * 5 + 5}%: cam {Math.round(mass[hover]! * 100)} din 100 de zile
          </span>
        ) : (
          <>
            <span className="chance-key free">Zile în care rămâne loc</span>
            <span className="chance-key full">Zile peste ~{pct(threshold)} ocupare: de obicei plină</span>
            <span className="chance-key mean">Ocuparea tipică ({pct(d.expected)})</span>
          </>
        )}
      </figcaption>
    </figure>
  );
}

/** The same parking over the whole day: the value with its ±10-point band. One series, no legend needed. */
function DayChart({ data }: { data: AvailabilityExplainResponse }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 210;
  const pad = { l: 40, r: 12, t: 12, b: 28 };
  const X = (h: number) => pad.l + (h / 23) * (W - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - v) * (H - pad.t - pad.b);
  const c = data.dayCurve;
  const band = `M${c.map((p) => `${X(p.hour)},${Y(p.high)}`).join(' L')} L${[...c].reverse().map((p) => `${X(p.hour)},${Y(p.low)}`).join(' L')} Z`;
  const line = `M${c.map((p) => `${X(p.hour).toFixed(1)},${Y(p.value).toFixed(1)}`).join(' L')}`;
  const sel = data.detail.hour;
  const h = hover ?? sel;
  const point = c[h]!;
  return (
    <figure className="chance-figure">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Șansa de loc pe ore în ziua aleasă, cu intervalul de sensibilitate. Valorile orei sunt scrise sub grafic."
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * W;
          const hh = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * 23);
          setHover(hh >= 0 && hh <= 23 ? hh : null);
        }}
      >
        {[0, 0.4, 0.7, 1].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={Y(v)} y2={Y(v)} className="pdata-grid" />
            <text x={pad.l - 6} y={Y(v) + 4} textAnchor="end" className="pdata-axis">
              {v * 100}%
            </text>
          </g>
        ))}
        {[0, 6, 12, 18, 23].map((hh) => (
          <text key={hh} x={X(hh)} y={H - 8} textAnchor={hh === 23 ? 'end' : hh === 0 ? 'start' : 'middle'} className="pdata-axis">
            {String(hh).padStart(2, '0')}:00
          </text>
        ))}
        <path d={band} className="chance-band" />
        <path d={line} className="chance-line" fill="none" />
        <line x1={X(h)} x2={X(h)} y1={pad.t} y2={H - pad.b} className="pdata-crosshair" />
        <circle cx={X(h)} cy={Y(point.value)} r={5} className="chance-dot" />
      </svg>
      <figcaption aria-live="polite">
        {String(h).padStart(2, '0')}:00 · șansă {pct(point.value)} (interval {pct(point.low)}–{pct(point.high)}) · ocupare
        tipică {pct(point.expected)}
        {hover == null ? ' · ora aleasă' : ''}
      </figcaption>
    </figure>
  );
}

/** The five steps with the real numbers of one calculation. */
function Steps({ data, labelOf }: { data: AvailabilityExplainResponse; labelOf: (id: string) => string }) {
  const d = data.detail;
  return (
    <ol className="chance-calc">
      <li>
        <span>Profil</span>
        <strong>{labelOf(data.profile)}</strong>
      </li>
      <li>
        <span>Zi și oră</span>
        <strong>
          {d.holiday ? `sărbătoare legală (${d.holiday}) → curba de duminică` : DAY_RO[d.day]}, {String(d.hour).padStart(2, '0')}:
          {String(d.minute).padStart(2, '0')}
        </strong>
      </li>
      <li>
        <span>
          Ocupare tipică <i className="chance-sym">μ</i>
        </span>
        <strong>{pct(d.expected)}</strong>
      </li>
      <li>
        <span>
          Capacitate <i className="chance-sym">C</i>
        </span>
        <strong>
          {d.capacityUsed} locuri{d.known ? '' : ' (necunoscută: presupunem 20)'}
        </strong>
      </li>
      <li>
        <span>Cât variază de la o zi la alta</span>
        <strong>
          ±{Math.round(d.spread * 100)} puncte (κ = {d.kappa}; α = {num(d.alpha)}, β = {num(d.beta)})
        </strong>
      </li>
      <li>
        <span>Locuri libere cerute</span>
        <strong>
          cel puțin {d.needed} din {d.capacityUsed}
        </strong>
      </li>
      <li>
        <span>Rezultat brut</span>
        <strong>{num(d.raw * 100, 1)}%</strong>
      </li>
      <li className="chance-calc-final">
        <span>Afișat</span>
        <strong>
          ~{pct(d.value)}
          {d.clamped ? ' (limitat la 5–95%)' : ''} · interval {pct(d.range[0])}–{pct(d.range[1])}
        </strong>
      </li>
    </ol>
  );
}

function CalculatorSection({ model }: { model: AvailabilityModelResponse | null }) {
  const initial = useMemo(nowInputs, []);
  const [profile, setProfile] = useState('centre');
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [unknownCap, setUnknownCap] = useState(false);
  const [capacity, setCapacity] = useState(20);
  const at = bucharestIso(date, time);
  const cap = unknownCap || !Number.isFinite(capacity) || capacity < 1 ? undefined : Math.min(5000, Math.round(capacity));
  const res = useExplain({ profile, at, capacity: cap });
  const labelOf = (id: string) => model?.profiles.find((p) => p.id === id)?.label ?? id;
  return (
    <section id="calculator" className="flowdata-panel chance-calculator" aria-labelledby="chance-calc-title">
      <p className="flowdata-eyebrow">
        <Calculator size={14} /> ÎNCEARCĂ
      </p>
      <h2 id="chance-calc-title">Calculează o șansă, pas cu pas.</h2>
      <p className="pdata-lead">
        Alegi zona, momentul și mărimea parcării. Rezultatul vine de la același cod care face recomandările, nu de la
        o copie a lui.
      </p>
      <div className="chance-controls">
        <label>
          <span>Tip de zonă</span>
          <select value={profile} onChange={(e) => setProfile(e.target.value)}>
            {(model?.profiles ?? [{ id: 'centre', label: 'zonă centrală cu plată' }]).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Data</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          <span>Ora sosirii</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </label>
        <label>
          <span>Locuri</span>
          <input
            type="number"
            min={1}
            max={5000}
            inputMode="numeric"
            value={unknownCap ? '' : capacity}
            disabled={unknownCap}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
        </label>
        <label className="chance-check">
          <input type="checkbox" checked={unknownCap} onChange={(e) => setUnknownCap(e.target.checked)} />
          <span>Nu știu câte locuri are</span>
        </label>
      </div>
      {!at && <p className="pdata-empty">Alege o dată și o oră valide.</p>}
      {res.state === 'error' && (
        <p className="flowdata-alert" role="alert">
          <CircleHelp size={18} /> Serverul nu a răspuns. Calculul nu se face în browser, ca să nu existe două versiuni ale
          formulei.
        </p>
      )}
      {res.state === 'loading' && (
        <p role="status" className="flowdata-caption">
          Se calculează…
        </p>
      )}
      {res.state === 'ok' && (
        <div className="chance-result" aria-live="polite">
          <div className="chance-headline">
            <div>
              <span className="chance-big">~{pct(res.data.detail.value)}</span>
              <span className="chance-level" data-tone={chanceLevel(res.data.detail.value).tone}>
                {chanceLevel(res.data.detail.value).label}
              </span>
              <QualityBadge quality="estimated" />
            </div>
            <TenArrivals p={res.data.detail.value} />
            <p className="flowdata-caption">
              Din 10 sosiri în condiții la fel, cam {Math.round(res.data.detail.value * 10)} ar găsi loc, dacă ipotezele
              modelului sunt corecte.
            </p>
          </div>
          <Steps data={res.data} labelOf={labelOf} />
          <h3 className="chance-sub">Din 100 de zile la fel, cât de ocupată e zona</h3>
          <SpreadChart d={res.data.detail} />
          <h3 className="chance-sub">Aceeași parcare, pe toată ziua</h3>
          <DayChart data={res.data} />
        </div>
      )}
    </section>
  );
}

function WorkedExample({ labelOf }: { labelOf: (id: string) => string }) {
  const res = useExplain(EXAMPLE, 0);
  if (res.state !== 'ok')
    return (
      <section className="flowdata-panel" aria-labelledby="chance-example-title">
        <h2 id="chance-example-title">Un exemplu complet</h2>
        <p className="flowdata-caption">{res.state === 'error' ? 'Exemplul nu a putut fi calculat acum.' : 'Se calculează…'}</p>
      </section>
    );
  const d = res.data.detail;
  return (
    <section className="flowdata-panel chance-example" aria-labelledby="chance-example-title">
      <p className="flowdata-eyebrow">
        <Sigma size={14} /> EXEMPLU
      </p>
      <h2 id="chance-example-title">Vineri seara, o parcare de 20 de locuri în centru.</h2>
      <ol className="chance-example-steps">
        <li>
          Parcarea e în zona Timpark verde sau roșie, deci profilul este <b>{labelOf(res.data.profile)}</b>.
        </li>
        <li>
          Vineri, ora {String(d.hour).padStart(2, '0')}:00, curba de centru spune că zona e ocupată în medie{' '}
          <b>{pct(d.expected)}</b>.
        </li>
        <li>
          Media nu e aceeași în fiecare vineri. Cu κ = {d.kappa}, ocuparea reală variază cam ±
          {Math.round(d.spread * 100)} puncte: într-o vineri liniștită poate fi {pct(Math.max(0, d.expected - d.spread))},
          într-una aglomerată aproape 100%.
        </li>
        <li>
          Cu 20 de locuri, parcarea are loc dacă rămâne cel puțin <b>{d.needed}</b> loc liber. Probabilitatea ca toate
          cele 20 să fie ocupate iese {num((1 - d.raw) * 100, 1)}%.
        </li>
        <li>
          Deci șansa de loc este 100% − {num((1 - d.raw) * 100, 1)}% ≈ <b>{pct(d.value)}</b>. Dacă media reală ar fi cu 10
          puncte mai mare sau mai mică, șansa ar fi între {pct(d.range[0])} și {pct(d.range[1])}.
        </li>
      </ol>
      <p className="chance-formula">
        P(plin) = Π<sub>i=0…C−1</sub> (α + i) / (α + β + i), cu α = μκ = {num(d.alpha)} și β = (1 − μ)κ = {num(d.beta)}
      </p>
    </section>
  );
}

export function ChanceScreen() {
  const [model, setModel] = useState<AvailabilityModelResponse | null>(null);
  useEffect(() => {
    let alive = true;
    api.availabilityModel().then(
      (m) => alive && setModel(m),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);
  const labelOf = (id: string) => model?.profiles.find((p) => p.id === id)?.label ?? id;
  const p = model?.params;
  return (
    <main className="flowdata-page pdata-page chance-page">
      <header className="flowdata-heading">
        <div>
          <p className="flowdata-eyebrow">
            <Gauge size={16} /> CUM CALCULĂM ȘANSELE
          </p>
          <h1>
            „~70% șanse de loc”
            <br />
            <span>de unde vine numărul.</span>
          </h1>
          <p>
            O explicație completă, fără jargon unde se poate, cu formula acolo unde trebuie. Poți reface orice calcul
            mai jos.
          </p>
        </div>
      </header>
      <nav className="pdata-toc" aria-label="Pe această pagină">
        <a href="#pe-scurt">Pe scurt</a>
        <a href="#pasi">Cei 6 pași</a>
        <a href="#calculator">Calculator</a>
        <a href="#de-ce">De ce așa</a>
        <a href="#limite">Ce nu știe</a>
        <a href="#precizie">Precizie</a>
      </nav>

      <section id="pe-scurt" className="flowdata-panel chance-short">
        <h2>Pe scurt</h2>
        <div className="chance-short-grid">
          <article>
            <h3>Întrebarea</h3>
            <p>
              „Dacă ajung la această parcare la ora aleasă, care e probabilitatea să găsesc un loc liber, fără să caut
              mult?”
            </p>
          </article>
          <article>
            <h3>Răspunsul</h3>
            <p>
              Un procent între 5% și 95%, cu un interval. Peste 70% scriem „Șanse bune”, între 40% și 70% „Șanse medii”,
              sub 40% „Risc mare să fie plin”.
            </p>
          </article>
          <article>
            <h3>Ce nu este</h3>
            <p>
              Nu e o numărătoare live. În Timișoara nu există senzori sau date publice de ocupare. E o estimare din reguli,
              marcată mereu <QualityBadge quality="estimated" />.
            </p>
          </article>
        </div>
      </section>

      <section id="pasi" className="flowdata-panel" aria-labelledby="chance-steps-title">
        <p className="flowdata-eyebrow">
          <Layers size={14} /> CEI 6 PAȘI
        </p>
        <h2 id="chance-steps-title">Ce întreabă modelul, în ordine.</h2>
        <div className="chance-steps">
          <article>
            <span className="chance-step-icon">
              <MapPin size={20} />
            </span>
            <h3>1. Ce fel de zonă este?</h3>
            <p>
              Un centru plin de birouri se umple altfel decât un cartier de blocuri sau un mall. Fiecare parcare primește un
              <b> profil</b> după reguli fixe, verificate în ordinea asta:
            </p>
            <ul>
              {(model?.profiles ?? []).map((x) => (
                <li key={x.id}>
                  <b>{x.label}</b>: {x.rule}
                </li>
              ))}
            </ul>
          </article>
          <article>
            <span className="chance-step-icon">
              <Clock size={20} />
            </span>
            <h3>2. Când ajungi?</h3>
            <p>
              Contează ora sosirii, nu ora la care întrebi. Dacă ai ales o oră, o folosim pe aceea. Dacă pleci acum, adunăm
              durata de condus până la acea parcare, dată de openrouteservice. Dacă routerul nu răspunde, folosim ora
              curentă și o spunem.
            </p>
            <p>
              Ziua contează și ea: zi lucrătoare, sâmbătă sau duminică. Sărbătorile legale (Codul muncii, art. 139) sunt
              tratate ca duminică.
            </p>
          </article>
          <article>
            <span className="chance-step-icon">
              <Target size={20} />
            </span>
            <h3>3. Cât de ocupată e de obicei zona atunci?</h3>
            <p>
              Fiecare profil are o <b>curbă</b>: un procent de ocupare pentru fiecare oră, separat pentru zi lucrătoare,
              sâmbătă și duminică. Între ore trecem treptat, ca 09:55 și 10:05 să nu dea rezultate foarte diferite.
            </p>
            <p className="chance-warn">
              Curbele sunt ipoteze scrise de noi din tipare urbane obișnuite, nu măsurători din Timișoara. Le poți vedea pe
              toate pe pagina <a href="/date-parcari#sanse">Datele de parcare</a>.
            </p>
          </article>
          <article>
            <span className="chance-step-icon">
              <Ruler size={20} />
            </span>
            <h3>4. Câte locuri are parcarea?</h3>
            <p>
              O parcare de 5 locuri e des plină chiar și când zona e doar moderat aglomerată. Una de 200 se umple complet
              doar într-o zi chiar aglomerată. Luăm capacitatea, în ordine, din:
            </p>
            <ul>
              <li>eticheta „capacity” din OpenStreetMap;</li>
              <li>conturul parcării Timpark ÷ {p?.m2PerLotSpace ?? 25} m² pe loc (cu tot cu alei);</li>
              <li>
                lungimea străzii cu plată ÷ {p?.mPerKerbSpace ?? 6} m pe loc, pe o singură parte, maxim{' '}
                {p?.maxKerbCountedM ?? 300} m;
              </li>
              <li>altfel {p?.defaultCapacity ?? 20} de locuri, și tratăm rezultatul ca mai nesigur.</li>
            </ul>
          </article>
          <article>
            <span className="chance-step-icon">
              <Shuffle size={20} />
            </span>
            <h3>5. Cât variază de la o zi la alta?</h3>
            <p>
              „În medie 90% ocupat” nu înseamnă 90% în fiecare zi: uneori e 80%, alteori 100%. Modelăm ocuparea reală ca
              o <b>distribuție Beta</b> în jurul mediei. Parametrul κ = {p?.kappaKnown ?? 8} spune cât de mult variază
              (κ = {p?.kappaUnknown ?? 5}, deci mai mult, când nu știm capacitatea).
            </p>
          </article>
          <article>
            <span className="chance-step-icon">
              <Sigma size={20} />
            </span>
            <h3>6. Care e probabilitatea să rămână loc?</h3>
            <p>
              Pentru o ocupare dată, fiecare loc e ocupat sau nu. Combinat cu pasul 5, numărul de locuri ocupate urmează o
              lege <b>beta-binomială</b>, pe care o calculăm exact.
            </p>
            <p>
              Cerem cel puțin max(1, ⌈{Math.round((p?.findableShare ?? 0.03) * 100)}% din locuri⌉) libere: într-o parcare de
              500 de locuri, ultimele câteva sunt împrăștiate și greu de găsit, deci practic e plină înainte de ultimul loc.
            </p>
            <p>
              La final, rezultatul e ținut între {pct(p?.pMin ?? 0.05)} și {pct(p?.pMax ?? 0.95)} și primește un interval:
              cât s-ar schimba dacă ocuparea tipică ar fi greșită cu ±{Math.round((p?.curveError ?? 0.1) * 100)} puncte.
            </p>
          </article>
        </div>
      </section>

      <CalculatorSection model={model} />
      <WorkedExample labelOf={labelOf} />

      <section id="de-ce" className="flowdata-panel" aria-labelledby="chance-why-title">
        <h2 id="chance-why-title">De ce am ales așa</h2>
        <dl className="chance-why">
          <div>
            <dt>De ce nu doar „media ocupării”?</dt>
            <dd>
              O medie de 90% ar spune „10% șanse” pentru orice parcare. Dar o parcare mare la 90% are aproape mereu loc, iar
              una de 5 locuri adesea nu. Capacitatea schimbă răspunsul, deci trebuie să intre în calcul.
            </dd>
          </div>
          <div>
            <dt>De ce beta-binomial și nu o curbă normală?</dt>
            <dd>
              Prima versiune folosea o aproximare normală. Ea subestima parcările mari și nu știa că ocuparea nu poate trece
              de 100%. Beta-binomialul are forma corectă la ambele capete și se calculează exact, fără aproximări.
            </dd>
          </div>
          <div>
            <dt>De ce limităm la 5–95%?</dt>
            <dd>
              Modelul nu e calibrat pe date reale. Un „99% sigur” ar promite mai mult decât știm. Și 5% înseamnă „aproape
              sigur plin”, nu „imposibil”.
            </dd>
          </div>
          <div>
            <dt>De ce arătăm un interval?</dt>
            <dd>
              Cea mai mare incertitudine e în curbe. Intervalul arată cât de mult depinde răspunsul de ele. Un interval larg
              înseamnă „depinde mult de ipoteză”.
            </dd>
          </div>
          <div>
            <dt>De ce nu folosim AI pentru asta?</dt>
            <dd>
              Șansa e calculată de cod determinist: aceleași date dau mereu același rezultat, iar oricine poate reface
              calculul. Asistentul AI doar transformă textul tău într-o cerere; nu produce niciodată numere.
            </dd>
          </div>
        </dl>
      </section>

      <section id="limite" className="flowdata-panel" aria-labelledby="chance-limits-title">
        <h2 id="chance-limits-title">Ce nu știe modelul</h2>
        <ul className="data-trust-list chance-limits">
          <li>Câte locuri sunt libere acum. Nu există senzori sau un flux public de ocupare pentru Timișoara.</li>
          <li>Evenimente: meciuri, concerte, târguri, Revelion, sesiunea de examene.</li>
          <li>Vreme, lucrări, străzi închise, parcări temporar desființate.</li>
          <li>Mașini parcate neregulamentar, locuri pentru persoane cu dizabilități sau rezervate.</li>
          <li>Câți alți șoferi caută loc în aceeași parcare cu tine în același moment.</li>
          <li>Zilele „punte” libere stabilite de Guvern (doar sărbătorile legale sunt incluse).</li>
          <li>
            În scenariul DEMO, „parcare plină” e o simulare <QualityBadge quality="simulated" />, vizibilă doar în sesiunea
            ta.
          </li>
        </ul>
      </section>

      <section id="precizie" className="flowdata-panel pdata-accuracy-wrap" aria-labelledby="chance-acc-title">
        <h2 id="chance-acc-title">Cât de precis este și cum îl facem mai bun</h2>
        <div className="pdata-accuracy">
          <p>
            <strong>Precizia nu a fost măsurată încă.</strong> Ca s-o măsori, ai nevoie de observații reale: „am ajuns la
            parcarea X la ora Y și am găsit / n-am găsit loc”. Nu avem încă astfel de date, deci nu afișăm un procent de
            acuratețe.
          </p>
          <ul className="data-trust-list">
            <li>
              <b>Ce verificăm automat acum:</b> formula exactă, că o zonă mai aglomerată dă șanse mai mici, că o parcare mai
              mare dă șanse mai mari, sărbătorile și trecerea lină între ore.
            </li>
            <li>
              <b>Cum vom măsura:</b> scorul Brier (cât de departe e procentul de ce s-a întâmplat), comparat cu două repere
              simple: „mereu 50%” și „ce s-a întâmplat la aceeași oră săptămâna trecută”. Modelul rămâne doar dacă le bate.
            </li>
            <li>
              <b>Cum îl calibrăm:</b> cu cel puțin 20–30 de observații pe zonă și oră, înlocuim curba presupusă cu cea
              observată, apoi ajustăm κ după cât de mult variază zilele între ele.
            </li>
            <li>
              <b>Ce date ar ajuta cel mai mult:</b> numărul de plăți Timpark (SMS / CityApp) pe zonă și oră, de la Primărie,
              și numărători manuale Living Labs.
            </li>
          </ul>
        </div>
      </section>

      <p className="flowdata-footnote">
        Parametrii exacți și curbele: <a href="/date-parcari#sanse">Datele de parcare</a>. Toate sursele aplicației:{' '}
        <a href="/data">FLOW Data Trust</a>.
      </p>
    </main>
  );
}
