import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDownToLine,
  CircleHelp,
  Database,
  ExternalLink,
  Gauge,
  ListChecks,
  MapPin,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  TARIFF_LABEL_RO,
  formatAmountRo,
  type AvailabilityModelResponse,
  type DataQuality,
  type ParkingRegisterResponse,
  type ParkingRegisterRow,
} from '@vlaiq/shared';
import { QualityBadge } from '../../components/QualityBadge';
import { api } from '../../services/api';
import { downloadData, formatSourceDate } from '../city/useCityData';
import '../city/city.css';
import './parkingData.css';

type Verifiable = 'public' | 'field' | 'none';
const VERIFIABLE_LABEL: Record<Verifiable, string> = {
  public: 'Verificabil public',
  field: 'Verificabil doar pe teren',
  none: 'Neverificabil încă',
};
const VERIFIABLE_HELP: Record<Verifiable, string> = {
  public: 'Oricine poate deschide sursa și compara valoarea.',
  field: 'Sursa nu o confirmă; trebuie numărat sau privit la fața locului.',
  none: 'Nu există încă o observație cu care să comparăm.',
};
const KIND_LABEL: Record<ParkingRegisterRow['kind'], string> = {
  timpark_lot: 'Parcare Timpark',
  timpark_street: 'Stradă cu plată',
  osm: 'OpenStreetMap',
};
const ACCESS_LABEL: Record<ParkingRegisterRow['access'], string> = {
  public: 'Public',
  customers: 'Doar clienți',
  unknown: 'Nespecificat',
};
const DAY_LABEL = { weekday: 'Zi lucrătoare', saturday: 'Sâmbătă', sunday: 'Duminică / sărbătoare' } as const;
type Day = keyof typeof DAY_LABEL;
const DAYS: Day[] = ['weekday', 'saturday', 'sunday'];
const TIMPARK_ENDPOINT = 'https://cont.primariatm.ro/api/mobile/parking';
const PAGE = 40;

function useParkingData() {
  const [register, setRegister] = useState<ParkingRegisterResponse | null>(null);
  const [model, setModel] = useState<AvailabilityModelResponse | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void Promise.allSettled([api.parkingRegister(), api.availabilityModel()]).then(([r, m]) => {
      if (!alive) return;
      if (r.status === 'fulfilled') setRegister(r.value);
      if (m.status === 'fulfilled') setModel(m.value);
      setErrors([
        ...(r.status === 'rejected' ? ['lista parcărilor'] : []),
        ...(m.status === 'rejected' ? ['parametrii modelului'] : []),
      ]);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [attempt]);
  return { register, model, errors, loading, retry: () => setAttempt((n) => n + 1) };
}

function count(rows: ParkingRegisterRow[] | undefined, test: (r: ParkingRegisterRow) => boolean) {
  return rows ? rows.filter(test).length : null;
}
const n = (v: number | null) => (v == null ? '—' : v.toLocaleString('ro-RO'));

interface Item {
  title: string;
  use: string;
  source: ReactNode;
  qualities: DataQuality[];
  verifiable: Verifiable;
  verify: ReactNode;
  coverage: string;
  limits: string;
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="flowdata-source-link">
      {children} <ExternalLink size={12} />
      <span className="sr-only"> (se deschide într-o filă nouă)</span>
    </a>
  );
}

function registerItems(reg: ParkingRegisterResponse | null): Item[] {
  const rows = reg?.rows;
  const timpark = count(rows, (r) => r.kind !== 'osm');
  const checked = count(rows, (r) => r.kind !== 'osm' && r.checked === true);
  const osm = count(rows, (r) => r.kind === 'osm');
  const of = (a: number | null, b: number | null) => (a == null || b == null ? 'Indisponibil' : `${n(a)} din ${n(b)}`);
  return [
    {
      title: 'Parcări și străzi cu plată Timpark (poziție, contur)',
      use: 'Candidații principali din centru; tariful și codul SMS.',
      source: 'Primăria Timișoara, endpoint public Timpark (date CityApp)',
      qualities: ['confirmed', 'estimated'],
      verifiable: 'public',
      verify: <Ext href={TIMPARK_ENDPOINT}>Deschide endpointul Primăriei</Ext>,
      coverage: `${of(checked, timpark)} verificate de Primărie față de anexa de tarife 2026; restul apar „Estimat”.`,
      limits: `Snapshot din ${formatSourceDate(reg?.timpark?.fetchedAt)}, nu live. Doar municipiul Timișoara.`,
    },
    {
      title: 'Tarif pe oră, cod SMS, program de plată',
      use: 'Prețul afișat și costul în clasament.',
      source: 'Primăria Timișoara, câmpul „tariffs” al aceluiași endpoint',
      qualities: ['confirmed'],
      verifiable: 'public',
      verify: <Ext href={TIMPARK_ENDPOINT}>Compară cu „tariffs” din endpoint</Ext>,
      coverage: 'Toate cele 4 culori + tariful progresiv + biletul de o zi.',
      limits: 'Păstrăm unitatea publicată de Primărie, fără conversie. Suma finală o confirmă Timpark/CityApp la plată.',
    },
    {
      title: 'Cost pentru durata șederii',
      use: 'Comparația dintre parcări.',
      source: 'Calcul VLAIQ din tariful oficial × orele începute în program',
      qualities: ['confirmed', 'estimated'],
      verifiable: 'public',
      verify: 'Se poate reface de mână: tarif × ore plătite (vezi nota fiecărei parcări).',
      coverage: 'Orice parcare Timpark; parcările OSM din zone Timpark primesc tariful zonei ca estimare.',
      limits: 'Nu include comisioane ale metodei de plată.',
    },
    {
      title: 'Parcări OpenStreetMap (poziție, tip, nume)',
      use: 'Parcări gratuite, de mall sau private-publice din afara listei Timpark.',
      source: `OpenStreetMap, licență ODbL · ${reg?.osm.attribution ?? '© OpenStreetMap contributors'}`,
      qualities: ['estimated'],
      verifiable: 'public',
      verify: 'Fiecare rând din lista de mai jos are link la obiectul OSM.',
      coverage: `${n(osm)} parcări; ${n(count(rows, (r) => r.kind === 'osm' && r.nameIsDerived))} fără nume în OSM (numele e dat de noi după stradă).`,
      limits: `Generat ${formatSourceDate(reg?.osm.generatedAt)}. Datele vin de la voluntari și pot fi vechi. access=private este exclus.`,
    },
    {
      title: 'Acces (public / doar clienți)',
      use: 'Parcările de clienți apar doar dacă destinația e la ≤ 300 m.',
      source: 'Eticheta OSM access',
      qualities: ['estimated', 'unknown'],
      verifiable: 'field',
      verify: 'Indicatoarele de la intrare.',
      coverage: `Public ${n(count(rows, (r) => r.kind === 'osm' && r.access === 'public'))} · clienți ${n(count(rows, (r) => r.access === 'customers'))} · nespecificat ${n(count(rows, (r) => r.access === 'unknown'))}.`,
      limits: 'Un acces nespecificat primește un avertisment, nu e presupus public.',
    },
    {
      title: 'Capacitate (număr de locuri)',
      use: 'Intră în șansa de loc liber: o parcare mare se umple mai greu.',
      source: 'Eticheta OSM capacity; contur Timpark ÷ 25 m²; stradă Timpark ÷ 6 m',
      qualities: ['estimated', 'unknown'],
      verifiable: 'field',
      verify: 'Numărare la fața locului sau pe ortofoto. Formula e scrisă lângă fiecare valoare.',
      coverage: `${n(count(rows, (r) => r.capacity.value != null))} din ${n(rows?.length ?? null)} au o valoare; ${n(count(rows, (r) => r.kind === 'osm' && r.capacity.value != null))} din ${n(osm)} parcări OSM.`,
      limits: 'Nicio capacitate nu e confirmată. Stradă: o singură parte, maxim 300 m, fără să scădem intrările în curți.',
    },
    {
      title: 'Profil de zonă',
      use: 'Alege curba de ocupare tipică (centru, mall, campus, spital, gară, rezidențial).',
      source: 'Regulă VLAIQ pe poligoanele Timpark și locurile majore din OSM',
      qualities: ['estimated'],
      verifiable: 'public',
      verify: <a href="#sanse" className="flowdata-source-link">Regulile sunt scrise mai jos</a>,
      coverage: 'Fiecare parcare din listă are profilul afișat.',
      limits: 'O zonă mixtă primește un singur profil.',
    },
    {
      title: 'Ocupare live (locuri libere acum)',
      use: 'Ar înlocui modelul, dacă ar exista.',
      source: 'Nicio sursă publică pentru Timișoara',
      qualities: ['unknown'],
      verifiable: 'none',
      verify: 'Nu avem senzori, nu inventăm valori.',
      coverage: 'Nicio parcare nu are ocupare live.',
      limits: 'Surse posibile: numărul de plăți Timpark pe zonă și oră (cerut Primăriei), numărători Living Labs.',
    },
    {
      title: 'Șansă de loc liber la sosire',
      use: 'Riscul din clasament și eticheta „Șanse estimate”.',
      source: 'Model VLAIQ pe reguli, v2, necalibrat',
      qualities: ['estimated', 'simulated'],
      verifiable: 'none',
      verify: <a href="#sanse" className="flowdata-source-link">Formula și parametrii, mai jos</a>,
      coverage: 'Orice parcare candidat.',
      limits: 'Precizia nu a fost măsurată: nu avem observații reale. „DEMO” (parcare plină) e simulat doar în sesiunea ta.',
    },
    {
      title: 'Timp de mers pe jos și de condus',
      use: 'Minutele din clasament; ora de sosire pentru șansa de loc.',
      source: 'openrouteservice (matrice); fără cheie: linie dreaptă × 1,3 la 4,8 km/h doar pentru mers',
      qualities: ['estimated'],
      verifiable: 'public',
      verify: <Ext href="https://maps.openrouteservice.org/">Refă ruta în openrouteservice</Ext>,
      coverage: 'Calculat la fiecare cerere, cu cache.',
      limits: 'Fără trafic live. Durata de condus nu e inventată: dacă lipsește, rămâne „necunoscută”.',
    },
    {
      title: 'Sărbători legale',
      use: 'În zilele libere legale folosim curba de duminică.',
      source: 'Codul muncii (Legea 53/2003), art. 139; Paștele ortodox calculat',
      qualities: ['confirmed'],
      verifiable: 'public',
      verify: 'Textul legii; testele automate verifică Paștele 2025–2027.',
      coverage: 'Toate sărbătorile legale, orice an.',
      limits: 'Zilele „punte” stabilite de Guvern nu sunt incluse.',
    },
  ];
}

function DataRegister({ reg }: { reg: ParkingRegisterResponse | null }) {
  return (
    <section className="flowdata-panel pdata-register" aria-labelledby="pdata-register-title">
      <p className="flowdata-eyebrow">
        <ListChecks size={14} /> CE DATE FOLOSIM
      </p>
      <h2 id="pdata-register-title">Fiecare valoare, sursa ei și cum o verifici.</h2>
      <div className="pdata-items">
        {registerItems(reg).map((item) => (
          <article key={item.title} className="pdata-item">
            <header>
              <h3>{item.title}</h3>
              <div className="pdata-badges">
                {item.qualities.map((q) => (
                  <QualityBadge key={q} quality={q} />
                ))}
                <span className={`pdata-verify ${item.verifiable}`} title={VERIFIABLE_HELP[item.verifiable]}>
                  {VERIFIABLE_LABEL[item.verifiable]}
                </span>
              </div>
            </header>
            <dl>
              <div>
                <dt>Folosit pentru</dt>
                <dd>{item.use}</dd>
              </div>
              <div>
                <dt>Sursă</dt>
                <dd>{item.source}</dd>
              </div>
              <div>
                <dt>Acoperire</dt>
                <dd>{item.coverage}</dd>
              </div>
              <div>
                <dt>Cum verifici</dt>
                <dd>{item.verify}</dd>
              </div>
              <div>
                <dt>Limite</dt>
                <dd>{item.limits}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

/** 24-hour occupancy curves of one profile; three days with distinct colour AND dash pattern. */
function CurveChart({ profile }: { profile: AvailabilityModelResponse['profiles'][number] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 220;
  const pad = { l: 40, r: 12, t: 12, b: 28 };
  const x = (h: number) => pad.l + ((h + 0.5) / 24) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v) * (H - pad.t - pad.b);
  const path = (c: number[]) => c.map((v, h) => `${h ? 'L' : 'M'}${x(h).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return (
    <div className="pdata-chart">
      <ul className="pdata-legend" aria-label="Legendă">
        {DAYS.map((d) => (
          <li key={d} data-day={d}>
            <svg width="26" height="8" aria-hidden>
              <line x1="0" y1="4" x2="26" y2="4" className={`pdata-line ${d}`} />
            </svg>
            {DAY_LABEL[d]}
          </li>
        ))}
      </ul>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Ocupare tipică pe ore pentru ${profile.label}. Valorile exacte sunt în tabelul de dedesubt.`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * W;
          const h = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * 24 - 0.5);
          setHover(h >= 0 && h < 24 ? h : null);
        }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="pdata-grid" />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="pdata-axis">
              {v * 100}%
            </text>
          </g>
        ))}
        {[0, 6, 12, 18, 23].map((h) => (
          <text key={h} x={x(h)} y={H - 8} textAnchor="middle" className="pdata-axis">
            {String(h).padStart(2, '0')}
          </text>
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="pdata-crosshair" />}
        {DAYS.map((d) => (
          <path key={d} d={path(profile.curves[d])} className={`pdata-line ${d}`} fill="none" />
        ))}
        {hover != null &&
          DAYS.map((d) => (
            <circle key={d} cx={x(hover)} cy={y(profile.curves[d][hover]!)} r={4} className={`pdata-dot ${d}`} />
          ))}
      </svg>
      <p className="pdata-tooltip" aria-live="polite">
        {hover == null
          ? 'Treci cu cursorul peste grafic pentru valorile fiecărei ore.'
          : `${String(hover).padStart(2, '0')}:00–${String(hover + 1).padStart(2, '0')}:00 · ` +
            DAYS.map((d) => `${DAY_LABEL[d]} ${Math.round(profile.curves[d][hover]! * 100)}%`).join(' · ')}
      </p>
      <details className="pdata-table-toggle">
        <summary>Vezi valorile ca tabel</summary>
        <div className="pdata-scroll">
          <table className="pdata-mini-table">
            <thead>
              <tr>
                <th scope="col">Ora</th>
                {DAYS.map((d) => (
                  <th scope="col" key={d}>
                    {DAY_LABEL[d]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 24 }, (_, h) => (
                <tr key={h}>
                  <th scope="row">{String(h).padStart(2, '0')}:00</th>
                  {DAYS.map((d) => (
                    <td key={d}>{Math.round(profile.curves[d][h]! * 100)}%</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function ModelSection({ model }: { model: AvailabilityModelResponse | null }) {
  const [profileId, setProfileId] = useState<string>('centre');
  if (!model)
    return (
      <section id="sanse" className="flowdata-panel">
        <h2>Șansele de loc liber</h2>
        <p className="flowdata-caption">Parametrii modelului nu au putut fi citiți de la server.</p>
      </section>
    );
  const p = model.params;
  const profile = model.profiles.find((x) => x.id === profileId) ?? model.profiles[0]!;
  return (
    <section id="sanse" className="flowdata-panel pdata-model" aria-labelledby="pdata-model-title">
      <p className="flowdata-eyebrow">
        <Gauge size={14} /> ȘANSELE DE LOC LIBER
      </p>
      <h2 id="pdata-model-title">Cum calculăm șansa, pas cu pas.</h2>
      <p className="pdata-lead">
        {model.name}. Calitate: <QualityBadge quality={model.quality} />{' '}
        {model.calibrated ? 'calibrat pe observații.' : 'necalibrat: curbele sunt ipoteze scrise, nu măsurători.'}{' '}
        <a href="/sanse-parcare" className="pdata-inline-link">Explicația pe larg, cu calculator</a>
      </p>
      <ol className="pdata-steps">
        <li>
          <strong>Profilul zonei.</strong> Fiecare parcare primește un profil după reguli fixe (prima regulă
          potrivită câștigă):
          <ul>
            {model.profiles.map((x) => (
              <li key={x.id}>
                <b>{x.label}</b>: {x.rule}
              </li>
            ))}
          </ul>
        </li>
        <li>
          <strong>Ocuparea tipică la sosire.</strong> Ora de sosire este ora aleasă de tine sau, dacă pleci
          acum, ora curentă plus durata de condus dată de router. Între ore interpolăm liniar, ca 09:55 și
          10:05 să nu difere brusc. Sărbătorile legale folosesc curba de duminică.
        </li>
        <li>
          <strong>Capacitatea.</strong> Din OSM, din conturul Timpark (÷ {p.m2PerLotSpace} m² pe loc) sau din
          lungimea străzii (÷ {p.mPerKerbSpace} m pe loc, o parte, maxim {p.maxKerbCountedM} m). Necunoscută ⇒{' '}
          {p.defaultCapacity} locuri și incertitudine mai mare.
        </li>
        <li>
          <strong>Probabilitatea.</strong> Ocuparea reală variază de la o zi la alta în jurul celei tipice
          (distribuție Beta, κ = {p.kappaKnown}; {p.kappaUnknown} dacă nu știm capacitatea). Numărul de locuri
          ocupate urmează atunci o lege beta-binomială, calculată exact. Cerem cel puțin max(1, ⌈
          {Math.round(p.findableShare * 100)}% · C⌉) locuri libere: într-o parcare mare, ultimele locuri sunt
          greu de găsit.
        </li>
        <li>
          <strong>Limite și interval.</strong> Rezultatul rămâne între {Math.round(p.pMin * 100)}% și{' '}
          {Math.round(p.pMax * 100)}%, pentru că modelul nu e calibrat. Intervalul arătat la fiecare parcare
          spune cât s-ar schimba șansa dacă ocuparea tipică ar fi greșită cu ±{Math.round(p.curveError * 100)}{' '}
          puncte.
        </li>
      </ol>
      <div className="pdata-curves">
        <div className="pdata-curves-head">
          <h3>Curbele de ocupare tipică</h3>
          <label>
            <span>Profil</span>
            <select value={profile.id} onChange={(e) => setProfileId(e.target.value)}>
              {model.profiles.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <CurveChart profile={profile} />
      </div>
      <div className="pdata-accuracy">
        <h3>Cât de corect este?</h3>
        <p>
          <strong>Precizia nu a fost măsurată.</strong> Pentru Timișoara nu există date publice de ocupare, așa
          că nu avem cu ce compara. Nu afișăm un procent de acuratețe inventat.
        </p>
        <ul className="data-trust-list">
          <li>Ce este verificat automat: formula exactă, monotonia (mai aglomerat ⇒ șanse mai mici, mai mare ⇒ șanse mai mari), sărbătorile, interpolarea.</li>
          <li>Ce lipsește: observații reale (parcare, oră, „am găsit loc / nu”).</li>
          <li>
            Cum îl vom măsura: cu ≥ 20–30 de observații pe zonă și oră, calculăm scorul Brier față de două
            repere simple (50% și „aceeași oră săptămâna trecută”) și înlocuim curba doar dacă modelul le bate.
          </li>
        </ul>
      </div>
    </section>
  );
}

function hourlyText(r: ParkingRegisterRow) {
  if (r.hourly.value == null) return 'Necunoscut';
  if (r.hourly.value === 0) return 'Gratuit';
  return `${formatAmountRo(r.hourly.value)} ${r.hourly.currency ?? ''}/oră`.trim();
}

function toCsv(rows: ParkingRegisterRow[], profileLabel: (id: string) => string) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['id', 'tip', 'nume', 'nume_derivat', 'lat', 'lng', 'sursa', 'link_sursa', 'acces', 'verificat_primarie', 'tarif', 'capacitate', 'calitate_capacitate', 'sursa_capacitate', 'pret_ora', 'moneda', 'calitate_pret', 'nota_pret', 'profil', 'duplicat_al', 'avertismente'];
  const lines = rows.map((r) =>
    [r.id, KIND_LABEL[r.kind], r.name, r.nameIsDerived, r.lat, r.lng, r.sourceRef, r.sourceUrl, r.access, r.checked, r.tariff, r.capacity.value, r.capacity.quality, r.capacity.source, r.hourly.value, r.hourly.currency, r.hourly.quality, r.hourly.note, profileLabel(r.profile), r.duplicateOf, r.flags.join('; ')]
      .map(esc)
      .join(','),
  );
  return [head.join(','), ...lines].join('\n');
}

function ParkingList({ reg, model }: { reg: ParkingRegisterResponse | null; model: AvailabilityModelResponse | null }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | ParkingRegisterRow['kind']>('all');
  const [shown, setShown] = useState(PAGE);
  const profileLabel = (id: string) => model?.profiles.find((p) => p.id === id)?.label ?? id;
  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ro-RO');
    return (reg?.rows ?? []).filter(
      (r) => (kind === 'all' || r.kind === kind) && (!q || `${r.name} ${r.sourceRef}`.toLocaleLowerCase('ro-RO').includes(q)),
    );
  }, [reg, query, kind]);
  useEffect(() => setShown(PAGE), [query, kind]);
  return (
    <section id="lista" className="flowdata-panel pdata-list" aria-labelledby="pdata-list-title">
      <div className="flowdata-section-head">
        <div>
          <p className="flowdata-eyebrow">
            <Database size={14} /> TOATE PARCĂRILE
          </p>
          <h2 id="pdata-list-title">Lista completă, rând cu rând.</h2>
        </div>
        <button
          className="flowdata-button secondary"
          disabled={!reg}
          onClick={() => reg && downloadData('vlaiq-parcari.csv', '﻿' + toCsv(reg.rows, profileLabel), 'text/csv;charset=utf-8')}
        >
          <ArrowDownToLine size={17} /> Descarcă CSV
        </button>
      </div>
      <div className="pdata-filters">
        <label>
          <span>Caută</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nume sau ID (ex. way/123, s84)" />
        </label>
        <label>
          <span>Sursă</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="all">Toate ({n(reg?.rows.length ?? null)})</option>
            {(Object.keys(KIND_LABEL) as ParkingRegisterRow['kind'][]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]} ({n(count(reg?.rows, (r) => r.kind === k))})
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="flowdata-caption" role="status">
        {reg ? `${n(rows.length)} rezultate` : 'Lista nu este încărcată.'}
      </p>
      {reg && rows.length === 0 && <p className="pdata-empty">Nicio parcare nu se potrivește căutării.</p>}
      {rows.length > 0 && (
        <div className="pdata-scroll">
          <table className="pdata-table">
            <thead>
              <tr>
                <th scope="col">Parcare</th>
                <th scope="col">Sursă</th>
                <th scope="col">Acces</th>
                <th scope="col">Capacitate</th>
                <th scope="col">Tarif</th>
                <th scope="col">Profil</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, shown).map((r) => (
                <tr key={r.id}>
                  <td data-label="Parcare">
                    <strong>{r.name}</strong>
                    {r.tariff && <small> · zona {TARIFF_LABEL_RO[r.tariff]}</small>}
                    {r.flags.length > 0 && (
                      <ul className="pdata-flags">
                        {r.flags.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td data-label="Sursă">
                    <span className="pdata-ref">{r.sourceRef}</span>
                    {r.checked != null && <QualityBadge quality={r.checked ? 'confirmed' : 'estimated'} />}
                    <div className="pdata-links">
                      {r.sourceUrl && <Ext href={r.sourceUrl}>Obiectul OSM</Ext>}
                      <Ext href={`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=19/${r.lat}/${r.lng}`}>
                        <MapPin size={12} /> Pe hartă
                      </Ext>
                    </div>
                  </td>
                  <td data-label="Acces">{ACCESS_LABEL[r.access]}</td>
                  <td data-label="Capacitate">
                    <span className="pdata-value">{r.capacity.value == null ? 'Necunoscută' : `~${r.capacity.value} locuri`}</span>
                    <QualityBadge quality={r.capacity.quality} />
                    {r.capacity.value != null && <small className="pdata-how">{r.capacity.source}</small>}
                  </td>
                  <td data-label="Tarif">
                    <span className="pdata-value">{hourlyText(r)}</span>
                    <QualityBadge quality={r.hourly.quality} />
                    <small className="pdata-how">{r.hourly.note}</small>
                  </td>
                  <td data-label="Profil">{profileLabel(r.profile)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > shown && (
        <button className="flowdata-button secondary pdata-more" onClick={() => setShown((s) => s + PAGE * 2)}>
          Arată mai multe ({n(rows.length - shown)} rămase)
        </button>
      )}
    </section>
  );
}

export function ParkingDataScreen() {
  const { register, model, errors, loading, retry } = useParkingData();
  return (
    <main className="flowdata-page pdata-page">
      <header className="flowdata-heading">
        <div>
          <p className="flowdata-eyebrow">
            <ShieldCheck size={16} /> DATELE DE PARCARE
          </p>
          <h1>
            Tot ce știm despre parcări,
            <br />
            <span>și cât de sigur știm.</span>
          </h1>
          <p>
            Fiecare valoare pe care o folosește SmartMatch, de unde vine, ce calitate are și cum o poți verifica
            singur. Ce nu știm rămâne „Necunoscut”.
          </p>
        </div>
      </header>
      <nav className="pdata-toc" aria-label="Pe această pagină">
        <a href="#pdata-register-title">Ce date folosim</a>
        <a href="#sanse">Șansele de loc liber</a>
        <a href="#lista">Lista completă</a>
      </nav>
      {loading && (
        <p role="status" className="flowdata-caption">
          Se încarcă datele…
        </p>
      )}
      {errors.length > 0 && (
        <div className="flowdata-alert" role="alert">
          <CircleHelp size={19} />
          <span>Nu am putut încărca: {errors.join(', ')}. Nu înlocuim datele lipsă cu valori inventate.</span>
          <button onClick={retry} disabled={loading}>
            <RefreshCw size={15} /> Reîncearcă
          </button>
        </div>
      )}
      <section className="pdata-legend-grid" aria-label="Ce înseamnă etichetele">
        <article>
          <QualityBadge quality="confirmed" />
          <p>Publicat de o sursă oficială și preluat neschimbat.</p>
        </article>
        <article>
          <QualityBadge quality="estimated" />
          <p>Calculat sau presupus după o regulă scrisă. Poate fi greșit.</p>
        </article>
        <article>
          <QualityBadge quality="unknown" />
          <p>Nu avem sursă. Nu completăm cu o valoare inventată.</p>
        </article>
        <article>
          <QualityBadge quality="simulated" />
          <p>Doar în scenariul DEMO, doar în sesiunea ta.</p>
        </article>
      </section>
      <DataRegister reg={register} />
      <ModelSection model={model} />
      <ParkingList reg={register} model={model} />
      <p className="flowdata-footnote">
        Date © OpenStreetMap contributors (ODbL) și Primăria Timișoara (Timpark). Pagina se generează din
        aceleași funcții pe care le folosește recomandarea, deci nu poate arăta altceva decât calculează
        aplicația. <a href="/data">Toate sursele aplicației</a>
      </p>
    </main>
  );
}
