import {
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  Check,
  CircleHelp,
  Database,
  ExternalLink,
  Layers,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  coverageSummary,
  downloadData,
  exportCitySummary,
  formatSourceDate,
  useCityData,
  type CityData,
} from '../city/useCityData';
import '../city/city.css';

function SourceLink({ source }: { source: string }) {
  return /^https:\/\//.test(source) ? (
    <a href={source} target="_blank" rel="noopener noreferrer" className="flowdata-source-link">
      Vezi sursa <ExternalLink size={13} />
      <span className="sr-only"> într-o filă nouă</span>
    </a>
  ) : (
    <span className="flowdata-caption">{source}</span>
  );
}

export function DataTrustCard({ data }: { data: CityData }) {
  return (
    <details className="flowdata-panel data-trust-card">
      <summary>
        <span className="data-trust-seal">
          <ShieldCheck size={24} />
        </span>
        <span>
          <strong>De unde provin datele?</strong>
          <small>Surse, actualizări și limite. Fără surprize.</small>
        </span>
        <span className="data-trust-open">
          <BookOpen size={17} />
        </span>
      </summary>
      <div className="data-trust-card-body">
        <p>
          Timpark oferă zonele și tarifele, OpenStreetMap oferă geometria și parcările. O
          recomandare de loc liber rămâne o estimare până la o observație verificată.
        </p>
        <dl>
          <div>
            <dt>Timpark</dt>
            <dd>{formatSourceDate(data.timpark?.fetchedAt)}</dd>
          </div>
          <div>
            <dt>Parcări OSM</dt>
            <dd>{formatSourceDate(data.parkings?.dataset.generatedAt)}</dd>
          </div>
          <div>
            <dt>Ocupare live</dt>
            <dd>Flux indisponibil</dd>
          </div>
        </dl>
        <p>
          Tarifele rămân în unitatea publicată de Primărie. Datele de transport neintegrate nu devin
          sosiri live, iar un traseu desenat nu este o promisiune de accesibilitate.
        </p>
        <a href="/data" className="flowdata-link">
          Toate sursele și limitările <ArrowUpRight size={16} />
        </a>
        <a href="/date-parcari" className="flowdata-link">
          Datele de parcare, una câte una <ArrowUpRight size={16} />
        </a>
      </div>
    </details>
  );
}

export function DataTrustScreen() {
  const { data, errors, loading, retry } = useCityData();
  const summary = coverageSummary(data);
  return (
    <main className="flowdata-page data-trust-page">
      <header className="flowdata-heading">
        <div>
          <p className="flowdata-eyebrow">
            <ShieldCheck size={16} /> FLOW DATA TRUST
          </p>
          <h1>
            Încrederea începe
            <br />
            <span>cu o sursă clară.</span>
          </h1>
          <p>
            Ce știm, de unde știm și ce nu putem afirma. Acesta este registrul de proveniență al
            aplicației.
          </p>
        </div>
        <button
          className="flowdata-button secondary"
          disabled={!data.parkings && !data.timpark}
          onClick={() =>
            downloadData(
              'vlaiq-data-trust.json',
              JSON.stringify(exportCitySummary(data), null, 2),
              'application/json',
            )
          }
        >
          <ArrowDownToLine size={17} /> Descarcă proveniența
        </button>
      </header>
      {errors.length > 0 && (
        <div className="flowdata-alert" role="alert">
          <CircleHelp size={19} />
          <span>
            Unele surse nu au răspuns: {errors.join(', ')}. Nu înlocuim datele lipsă cu valori
            inventate.
          </span>
          <button onClick={retry} disabled={loading}>
            <RefreshCw size={15} /> Reîncearcă
          </button>
        </div>
      )}
      <section className="data-trust-principles" aria-label="Cum interpretăm calitatea">
        <article>
          <span className="city-tag">SURSĂ OFICIALĂ</span>
          <h2>Publicat, nu neapărat live.</h2>
          <p>
            Un snapshot municipal poate descrie un tarif sau o zonă. Nu dovedește că există un loc
            liber chiar acum.
          </p>
        </article>
        <article>
          <span className="city-tag estimated">ESTIMARE</span>
          <h2>Utilă, cu limite explicite.</h2>
          <p>
            Durata rutei, capacitățile OSM și șansele de loc depind de surse sau reguli. Estimat nu
            înseamnă confirmat.
          </p>
        </article>
        <article>
          <span className="city-tag simulated">SIMULARE</span>
          <h2>Un scenariu, nu orașul.</h2>
          <p>
            FLOW Balance și sesiunile DEMO sunt etichetate separat. Nu produc statistici reale
            despre comunitate.
          </p>
        </article>
      </section>
      <section className="flowdata-panel data-source-register">
        <div className="flowdata-section-head">
          <div>
            <p className="flowdata-eyebrow">
              <Database size={14} /> REGISTRUL SURSELOR
            </p>
            <h2>Fiecare set are o proveniență.</h2>
          </div>
          {loading && (
            <span role="status" className="flowdata-caption">
              Se verifică snapshoturile…
            </span>
          )}
        </div>
        <article className="data-source-row">
          <span className="data-source-icon">
            <Layers size={21} />
          </span>
          <div>
            <h3>Timpark · Primăria Timișoara</h3>
            <p>
              Zone, parcări, segmente de stradă și tarife. Acoperire: municipiul Timișoara, nu
              întreg județul.
            </p>
            <p className="flowdata-caption">
              Preluat: {formatSourceDate(data.timpark?.fetchedAt)}
              {data.timpark ? ` · versiune ${data.timpark.data.version}` : ''}
            </p>
            <SourceLink
              source={data.timpark?.source ?? 'https://cont.primariatm.ro/api/mobile/parking'}
            />
          </div>
          <span className="data-source-state">
            {summary.officialFeatures == null
              ? 'Indisponibil'
              : `${summary.officialFeatures} forme distincte`}
          </span>
        </article>
        <article className="data-source-row">
          <span className="data-source-icon">
            <Database size={21} />
          </span>
          <div>
            <h3>Parcări · OpenStreetMap</h3>
            <p>
              Poziții, acces și unele capacități declarate de contributori. Licență ODbL 1.0; ©
              OpenStreetMap contributors.
            </p>
            <p className="flowdata-caption">
              Generat: {formatSourceDate(data.parkings?.dataset.generatedAt)}
            </p>
            <SourceLink source="https://www.openstreetmap.org/copyright" />
            <p className="flowdata-caption">
              {data.parkings?.dataset.source ?? 'Snapshotul de parcări nu a fost încărcat.'}
            </p>
          </div>
          <span className="data-source-state">
            {summary.osmLocations == null ? 'Indisponibil' : `${summary.osmLocations} ID-uri unice`}
          </span>
        </article>
        {(data.destinations?.sources ?? []).map((source, i) => (
          <article className="data-source-row" key={`${source.source}-${i}`}>
            <span className="data-source-icon">
              <BookOpen size={21} />
            </span>
            <div>
              <h3>{source.name}</h3>
              <p>
                Sursă folosită pentru căutarea locală de străzi și destinații. Precizia punctului
                este arătată separat în rezultate.
              </p>
              <p className="flowdata-caption">Preluat: {formatSourceDate(source.fetchedAt)}</p>
              <SourceLink source={source.source} />
            </div>
            <span className="data-source-state">Snapshot local</span>
          </article>
        ))}
        <article className="data-source-row">
          <span className="data-source-icon">
            <ArrowUpRight size={21} />
          </span>
          <div>
            <h3>Rutare · openrouteservice / OSRM</h3>
            <p>
              Geometrie rutieră și instrucțiuni de la furnizor. Distanțele și duratele sunt
              estimate, fără trafic live. Sursa efectivă este indicată pe ruta calculată.
            </p>
            <p className="flowdata-caption">
              {data.health
                ? data.health.integrations.routing === 'configured'
                  ? 'Cheie openrouteservice configurată; accesul trebuie verificat printr-o cerere reală.'
                  : 'Fără cheie ORS. OSRM demonstrativ poate furniza rute auto; nu îl prezentăm ca router pentru bicicletă sau mers pe jos.'
                : 'Starea configurației nu a fost citită.'}
            </p>
            <SourceLink source="https://openrouteservice.org/terms-of-service/" />
          </div>
          <span className="data-source-state">La cerere</span>
        </article>
        <article className="data-source-row">
          <span className="data-source-icon">
            <CircleHelp size={21} />
          </span>
          <div>
            <h3>Transport public · SMTT</h3>
            <p>
              Orarul GTFS nu este încă integrat în acest registru. Nu afișăm sosiri live inventate.
              Ghidul municipal avertizează că accesibilitatea nu este documentată și transportul
              bicicletelor apare interzis în feed.
            </p>
            <SourceLink source="https://smtt.ro/" />
          </div>
          <span className="data-source-state unavailable">Neintegrat</span>
        </article>
      </section>
      <div className="city-lower-grid">
        <section className="flowdata-panel">
          <p className="flowdata-eyebrow">
            <Check size={15} /> CE PUTEM SUSȚINE
          </p>
          <h2>Numere care pot fi auditate.</h2>
          <ul className="data-trust-list">
            <li>Numere unice după ID, în fiecare sursă.</li>
            <li>Tarife în unitatea publicată, fără conversie monetară inventată.</li>
            <li>Estimări și simulări etichetate cu text.</li>
            <li>Istoric de portofel derivat din tranzacții pe server.</li>
            <li>Trasee auto de la furnizor, nu linii drepte prezentate ca drum.</li>
          </ul>
        </section>
        <section className="flowdata-panel">
          <p className="flowdata-eyebrow">
            <CircleHelp size={15} /> CE LIPSEȘTE
          </p>
          <h2>Necunoscut rămâne necunoscut.</h2>
          <ul className="data-trust-list">
            <li>Ocupare live și garanții de loc liber.</li>
            <li>Validarea perfectă a modului de deplasare din GPS de browser.</li>
            <li>Acoperire Timpark pentru fiecare localitate din județ.</li>
            <li>Emisii evitate dovedite, statistici sau parteneriate oficiale.</li>
            <li>
              Testare pe teren și interviuri realizate de echipă — nu pretindem că au avut loc.
            </li>
          </ul>
        </section>
      </div>
      <details className="flowdata-panel flowdata-details data-trust-diagnostics">
        <summary>Diagnostic tehnic și starea configurației</summary>
        <p>
          Aceste valori descriu răspunsul API sau prezența configurației, nu garantează accesul la
          furnizori externi.
        </p>
        <dl>
          <div>
            <dt>API</dt>
            <dd>{data.health?.status === 'ok' ? 'Răspunde' : 'Necitit / indisponibil'}</dd>
          </div>
          <div>
            <dt>Observat la</dt>
            <dd>{formatSourceDate(data.health?.time)}</dd>
          </div>
          <div>
            <dt>Rutare ORS</dt>
            <dd>
              {data.health?.integrations.routing === 'configured'
                ? 'Configurată'
                : 'Neconfigurată / necitită'}
            </dd>
          </div>
          <div>
            <dt>Cheie AI</dt>
            <dd>
              {data.health?.integrations.gemini === 'configured'
                ? 'Configurată'
                : 'Neconfigurată / necitită'}
            </dd>
          </div>
        </dl>
      </details>
      <p className="flowdata-footnote">
        Îndrumare:{' '}
        <a href="https://ghid-pmt.vercel.app/unihack" target="_blank" rel="noopener noreferrer">
          Ghidul Primăriei pentru UniHack <ExternalLink size={12} />
        </a>
        . Publicăm limitele produsului; nu înlocuim serviciile CityApp, Timpark sau Sesizări.
      </p>
    </main>
  );
}
