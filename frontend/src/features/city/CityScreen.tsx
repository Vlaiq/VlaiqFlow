import { useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  Check,
  CircleHelp,
  Database,
  FileJson,
  Layers,
  Leaf,
  ParkingSquare,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { makeBalanceScenario, simulateFlowBalance, type BalanceResult } from '@vlaiq/shared';
import {
  coverageSummary,
  downloadData,
  exportCitySummary,
  formatSourceDate,
  useCityData,
} from './useCityData';
import { DataTrustCard } from '../trust/DataTrustScreen';
import './city.css';

const n = (value: number | null) => (value == null ? '—' : value.toLocaleString('ro-RO'));
const minutes = (value: number, assigned: number) =>
  assigned ? `${value.toLocaleString('ro-RO', { maximumFractionDigits: 1 })} min` : '—';

function Allocation({ result }: { result: BalanceResult }) {
  return (
    <div className="city-allocation">
      <div className="city-allocation-heading">
        <h3>
          {result.strategy === 'nearest' ? 'Mai întâi parcarea apropiată' : 'Alocare echilibrată'}
        </h3>
        <span className="city-tag simulated">SIMULARE</span>
      </div>
      <div className="city-allocation-main">
        <strong>
          {result.assigned}
          <small> / {result.assigned + result.unassigned}</small>
        </strong>
        <span>șoferi virtuali cu loc alocat</span>
      </div>
      <div className="city-lot-bars">
        {result.allocations.map((lot, i) => (
          <div key={lot.lotId}>
            <div>
              <span>
                {lot.name.replace('Parcarea virtuală ', 'Parcarea ')} <small>virtuală</small>
              </span>
              <strong>
                {lot.occupied} / {lot.capacity}
              </strong>
            </div>
            <div className="city-lot-track">
              <i
                style={{ width: `${lot.capacity ? (lot.occupied / lot.capacity) * 100 : 0}%` }}
                className={`city-lot-${i}`}
              />
            </div>
          </div>
        ))}
      </div>
      <dl className="city-allocation-metrics">
        <div>
          <dt>Condus mediu</dt>
          <dd>{minutes(result.averageDriveMinutes, result.assigned)}</dd>
        </div>
        <div>
          <dt>Mers pe jos mediu</dt>
          <dd>{minutes(result.averageWalkMinutes, result.assigned)}</dd>
        </div>
        <div>
          <dt>Drum complet mediu</dt>
          <dd>{minutes(result.averageJourneyMinutes, result.assigned)}</dd>
        </div>
        <div>
          <dt>Fără loc alocat</dt>
          <dd>
            {result.unassigned} <small>virtuali</small>
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function CityScreen() {
  const { data, loading, errors, retry } = useCityData();
  const summary = useMemo(() => coverageSummary(data), [data]);
  const [drivers, setDrivers] = useState(60);
  const [capacity, setCapacity] = useState(80);
  const [seed, setSeed] = useState(7);
  const scenario = useMemo(
    () => makeBalanceScenario(drivers, capacity, seed),
    [drivers, capacity, seed],
  );
  const nearest = useMemo(() => simulateFlowBalance(scenario, 'nearest'), [scenario]);
  const balanced = useMemo(() => simulateFlowBalance(scenario, 'balanced'), [scenario]);
  const [exported, setExported] = useState<string | null>(null);
  const exportSummary = (format: 'json' | 'csv') => {
    const report = exportCitySummary(data);
    if (format === 'json')
      downloadData('vlaiq-city-coverage.json', JSON.stringify(report, null, 2), 'application/json');
    else {
      const csv = [
        'indicator,valoare',
        ...Object.entries(report.uniqueWithinSourceCounts).map(
          ([key, value]) => `${key},${value ?? 'necunoscut'}`,
        ),
        `exportedAt,${report.generatedAt}`,
        'scope,Numere unice în fiecare sursă; sursele nu sunt însumate',
      ];
      downloadData(
        'vlaiq-city-coverage.csv',
        '\ufeff' + csv.join('\r\n'),
        'text/csv;charset=utf-8',
      );
    }
    setExported(`Export ${format.toUpperCase()} pregătit. Nu conține date personale.`);
  };

  return (
    <main className="flowdata-page">
      <header className="flowdata-heading">
        <div>
          <p className="flowdata-eyebrow">
            <BarChart3 size={15} /> FLOW CITY · PENTRU UN VIITOR PILOT
          </p>
          <h1>
            Date clare.
            <br />
            <span>Decizii mai bune.</span>
          </h1>
          <p>
            O imagine verificabilă a datelor de parcare. Un spațiu de testare pentru decizii, nu un
            tablou de trafic inventat.
          </p>
        </div>
        <div className="flowdata-export">
          <span className="city-tag">FĂRĂ DATE PERSONALE</span>
          <button
            className="flowdata-button secondary"
            onClick={() => exportSummary('json')}
            disabled={!data.parkings && !data.timpark}
          >
            <FileJson size={17} /> Export JSON
          </button>
          <button
            className="flowdata-button secondary"
            onClick={() => exportSummary('csv')}
            disabled={!data.parkings && !data.timpark}
          >
            <ArrowDownToLine size={17} /> Export CSV
          </button>
        </div>
      </header>
      {exported && (
        <p className="flowdata-status" role="status">
          <Check size={16} />
          {exported}
        </p>
      )}
      {errors.length > 0 && (
        <div className="flowdata-alert" role="alert">
          <CircleHelp size={19} />
          <span>
            Nu am putut actualiza {errors.join(', ')}. Ultimele date încărcate, dacă există, rămân
            vizibile.
          </span>
          <button onClick={retry} disabled={loading}>
            <RefreshCw size={15} /> Reîncearcă
          </button>
        </div>
      )}
      <section
        className="city-stat-grid"
        aria-label="Acoperire observată în seturile de date"
        aria-busy={loading}
      >
        <article>
          <span>
            <ParkingSquare size={18} /> PUNCTE OSM
          </span>
          <strong>{n(summary.osmLocations)}</strong>
          <p>Parcări distincte după ID-ul OpenStreetMap.</p>
          <small>Publice sau cu restricții documentate</small>
        </article>
        <article>
          <span>
            <Layers size={18} /> TIMPARK OFICIAL
          </span>
          <strong>{n(summary.officialFeatures)}</strong>
          <p>Zone, parcări și segmente de stradă distincte.</p>
          <small>Aceste forme nu reprezintă locuri libere</small>
        </article>
        <article>
          <span>
            <Database size={18} /> CAPACITĂȚI ÎN OSM
          </span>
          <strong>{n(summary.knownCapacityLocations)}</strong>
          <p>Parcări cu o capacitate declarată în sursă.</p>
          <small>Acoperire parțială · capacitate estimată</small>
        </article>
        <article className="city-missing-stat">
          <span>
            <CircleHelp size={18} /> OCUPARE ÎN TIMP REAL
          </span>
          <strong>Necunoscută</strong>
          <p>Nu avem un flux de senzori sau plăți care să măsoare locurile libere.</p>
          <small>Necunoscut nu înseamnă disponibil</small>
        </article>
      </section>

      <section className="flowdata-panel city-coverage">
        <div className="flowdata-section-head">
          <div>
            <p className="flowdata-eyebrow">CE ȘTIM ASTĂZI</p>
            <h2>Acoperire, cu limite la vedere.</h2>
          </div>
          <a href="/data" className="flowdata-link">
            Vezi proveniența <ArrowRight size={16} />
          </a>
        </div>
        <div className="city-coverage-grid">
          <div>
            <h3>Rețeaua Timpark din snapshot</h3>
            <dl>
              <div>
                <dt>Zone tarifare</dt>
                <dd>{n(summary.officialAreas)}</dd>
              </div>
              <div>
                <dt>Parcări delimitate</dt>
                <dd>{n(summary.officialLots)}</dd>
              </div>
              <div>
                <dt>Segmente de stradă</dt>
                <dd>{n(summary.officialStreets)}</dd>
              </div>
            </dl>
            <p className="flowdata-caption">
              Primăria Timișoara · preluat la {formatSourceDate(data.timpark?.fetchedAt)}.
            </p>
          </div>
          <div>
            <h3>Ce nu însumăm</h3>
            <p>
              O parcare OSM poate fi aceeași cu o parcare din Timpark. Fără o legătură verificată
              între surse, nu le adunăm într-un „total de parcări”.
            </p>
            <p>
              ID-urile sunt deduplicate în fiecare sursă. Capacitățile cunoscute nu acoperă toate
              parcările și nu indică disponibilitatea.
            </p>
            <span className="city-coverage-note">
              <Leaf size={17} /> Date Timpark disponibile în zona municipiului Timișoara. Județul
              are o acoperire diferită.
            </span>
          </div>
        </div>
      </section>

      <section className="flowdata-panel city-simulator" aria-labelledby="balance-title">
        <div className="flowdata-section-head">
          <div>
            <p className="flowdata-eyebrow">
              <SlidersHorizontal size={14} /> LABORATOR DE SCENARII
            </p>
            <h2 id="balance-title">FLOW Balance</h2>
            <p>Aceiași șoferi. Aceleași capacități. Două reguli de alocare.</p>
          </div>
          <span className="city-tag simulated">SCENARIU SINTETIC</span>
        </div>
        <div className="city-simulation-controls">
          <label htmlFor="city-drivers">
            Cerere virtuală <strong>{drivers} șoferi</strong>
            <input
              id="city-drivers"
              type="range"
              min="10"
              max="150"
              step="5"
              value={drivers}
              onChange={(e) => setDrivers(Number(e.target.value))}
            />
          </label>
          <label htmlFor="city-capacity">
            Capacitate virtuală totală <strong>{capacity} locuri</strong>
            <input
              id="city-capacity"
              type="range"
              min="15"
              max="150"
              step="5"
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
            />
          </label>
          <button className="flowdata-button secondary" onClick={() => setSeed((s) => s + 1)}>
            <RefreshCw size={16} /> Alt scenariu
          </button>
        </div>
        <div className="city-comparison">
          <Allocation result={nearest} />
          <Allocation result={balanced} />
        </div>
        <details className="flowdata-details">
          <summary>Cum funcționează simularea</summary>
          <p>
            Scenariul are trei parcări virtuale. Numărul de locuri și costurile în minute sunt
            ipoteze sintetice, nu rute sau observații din oraș. Aceleași alegeri și capacități sunt
            folosite pentru ambele strategii.
          </p>
          <p>
            <strong>Apropiată:</strong> alege timpul de condus cel mai mic dintre parcările care
            încă au capacitate. <strong>Echilibrată:</strong> minimizează condusul + mersul pe jos +
            8 minute × gradul de umplere. Nicio strategie nu depășește capacitatea; o alocare
            diferită poate crește un timp și scădea altul.
          </p>
          <p>
            Rezultatele sunt calculate local și determinist. Nu reprezintă o reducere măsurată a
            traficului, emisiilor sau timpului de căutare.
          </p>
        </details>
        <button
          className="flowdata-link city-export-scenario"
          onClick={() =>
            downloadData(
              'vlaiq-balance-simulation.json',
              JSON.stringify(
                {
                  source: 'Synthetic deterministic scenario; not city measurements',
                  scenario,
                  results: { nearest, balanced },
                },
                null,
                2,
              ),
              'application/json',
            )
          }
        >
          <ArrowDownToLine size={16} /> Exportă scenariul și rezultatele
        </button>
      </section>

      <div className="city-lower-grid">
        <section className="flowdata-panel">
          <p className="flowdata-eyebrow">
            <Users size={15} /> PARTICIPARE ȘI CONFIDENȚIALITATE
          </p>
          <h2>Progres fără trasee personale.</h2>
          <p>
            Nu există încă un set de date agregate despre participanți voluntari la nivelul
            orașului. Nu afișăm clasamente sau beneficii colective inventate.
          </p>
          <p>
            Portofelul de prototip este individual. Traseele GPS, adresele și rutinele
            utilizatorilor nu sunt trimise în acest ecran.
          </p>
          <a href="/motion" className="flowdata-link">
            Descoperă FLOW Motion <ArrowRight size={16} />
          </a>
        </section>
        <section className="flowdata-panel">
          <p className="flowdata-eyebrow">
            <ShieldCheck size={15} /> DE LA PROTOTIP LA PILOT
          </p>
          <h2>Un punct de plecare transferabil.</h2>
          <p>
            Un posibil pilot poate implica Timpark pentru operarea parcărilor și echipele municipale
            de mobilitate și digitalizare pentru analiză. Nu există o adopție sau un parteneriat
            oficial confirmat.
          </p>
          <details className="flowdata-details">
            <summary>Ce date ar îmbunătăți estimările?</summary>
            <ul>
              <li>Observații anonimizate de ocupare, cu dată și sursă.</li>
              <li>Legături verificate între identitățile Timpark și OSM.</li>
              <li>Numărători manuale și rezultate ale testelor cu locuitori.</li>
              <li>Un feed GTFS actualizat, cu limitele de accesibilitate explicite.</li>
            </ul>
            <p>
              FLOW Vision AI rămâne neimplementat: fără acces la camere, licențe și imagini
              autorizate nu simulăm un flux video „live”.
            </p>
          </details>
        </section>
      </div>
      <DataTrustCard data={data} />
      <p className="flowdata-footnote">
        FLOW CITY este un instrument de prototip. Exporturile conțin acoperire și proveniență, fără
        persoane, trasee sau istorice de deplasare.
      </p>
    </main>
  );
}
