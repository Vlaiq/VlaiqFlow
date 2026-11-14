import { ExternalLink, ShieldCheck } from 'lucide-react';
import { brand, MOTION_RULES, privacyContact } from '@vlaiq/shared';
import './privacy.css';

/**
 * Privacy notice (GDPR art. 13). Every statement here must match what the code does:
 * update this page whenever a feature starts sending or storing personal data.
 */
const flows: { what: string; where: string; kept: string }[] = [
  {
    what: 'Destinația aleasă și punctul de plecare (GPS sau ales pe hartă)',
    where:
      'Serverul FLOW le trimite furnizorului de rute: openrouteservice (HeiGIT, Germania), serverul OSRM FOSSGIS (routing.openstreetmap.de, Germania) sau serverul demo OSRM (router.project-osrm.org).',
    kept: 'Rutele calculate stau doar în memoria serverului, cel mult câteva minute, pentru a nu repeta cererea. Nu le scriem pe disc.',
  },
  {
    what: 'Harta (zona pe care o privești și adresa IP)',
    where: 'Browserul descarcă hărțile direct de la OpenFreeMap (tiles.openfreemap.org).',
    kept: 'Nu primim aceste date. OpenFreeMap le tratează după propriile reguli.',
  },
  {
    what: 'Activitățile Motion: punctele GPS ale unei activități',
    where: 'Trimise serverului FLOW doar când încheii activitatea, ca să verificăm distanța.',
    kept: `Coordonatele nu se salvează. Păstrăm tipul activității, ora de start, distanța, durata, recompensa și o amprentă (hash) a observațiilor, fără locații. Portofelele fără activitate ${Math.round(MOTION_RULES.retentionDays / 30)} luni se șterg automat.`,
  },
  {
    what: 'Cookie-ul motion_session',
    where: 'Un identificator aleator, HttpOnly, trimis doar către /api/motion pe acest site.',
    kept: 'Serverul păstrează doar amprenta lui (hash), nu valoarea. Cookie-ul expiră după un an sau la ștergerea portofelului.',
  },
  {
    what: 'Adresa IP',
    where: 'Folosită de server pentru limitarea abuzurilor (maximum 60 de cereri pe minut).',
    kept: 'Doar în memorie, timp de un minut. Nu ținem jurnale de acces cu adrese IP.',
  },
  {
    what: 'Locul mașinii parcate, ora plății introdusă de tine și locurile salvate (Acasă, Serviciu, Facultate)',
    where:
      'Salvate doar în browserul tău (localStorage). Pentru drumul înapoi la mașină, poziția ta (dacă o permiți) și locul mașinii ajung la furnizorul de rute, ca orice rută.',
    kept: 'Nu ajung la server ca date salvate. Locul mașinii se șterge când apeși „Am plecat cu mașina” sau după 48 de ore; favoritele, când le debifezi.',
  },
  {
    what: 'Deschiderea în Google Maps sau Waze',
    where:
      'Doar când apeși butonul, poziția parcării alese se deschide în aplicația sau site-ul Google Maps / Waze. Poziția ta nu este pusă în link.',
    kept: 'FLOW nu trimite nimic în fundal. Google și Waze tratează datele după propriile reguli.',
  },
  {
    what: 'Memento-uri (fișier de calendar și notificări)',
    where: 'Fișierul .ics este creat pe dispozitivul tău și descărcat de tine. Notificările sunt locale, din browser.',
    kept: 'Nu ajung la server.',
  },
  {
    what: 'Tema aleasă (luminoasă sau întunecată)',
    where: 'Salvată doar în browserul tău (localStorage).',
    kept: 'Nu ajunge la server.',
  },
];

export function PrivacyScreen() {
  const { controller, email, domain, updatedAt } = privacyContact;
  return (
    <div className="flow-page privacy-page">
      <div className="flow-page-intro">
        <span className="flow-eyebrow">CONFIDENȚIALITATE</span>
        <h1>Ce date folosim și de ce.</h1>
        <p>
          {brand.product} funcționează fără cont, fără reclame și fără analytics. Nu vindem date și
          nu facem profiluri. Folosim doar ce este necesar ca să îți arătăm parcări, rute și
          activitățile tale.
        </p>
      </div>

      <section className="flow-help-card privacy-card">
        <h2>Cine răspunde de date</h2>
        {controller && email ? (
          <p>
            Operatorul datelor pentru {domain} este <strong>{controller}</strong>. Pentru orice
            întrebare sau cerere privind datele tale scrie la <a href={`mailto:${email}`}>{email}</a>.
          </p>
        ) : (
          <p className="privacy-gap" role="note">
            Datele de contact ale operatorului nu au fost încă completate. Ele trebuie publicate
            înainte de lansarea pe {domain}.
          </p>
        )}
        <p>
          {brand.product} este un proiect studențesc al echipei {brand.team}, realizat la UniHack
          2026. Nu este un serviciu al Primăriei Timișoara.
        </p>
      </section>

      <section className="flow-help-card privacy-card">
        <h2>Ce date ajung unde</h2>
        <div className="privacy-flows">
          {flows.map((f) => (
            <article key={f.what}>
              <h3>{f.what}</h3>
              <dl>
                <div>
                  <dt>Unde ajung</dt>
                  <dd>{f.where}</dd>
                </div>
                <div>
                  <dt>Cât le păstrăm</dt>
                  <dd>{f.kept}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
        <p>
          Locația este cerută doar când apeși „Locația mea” sau pornești o activitate, niciodată la
          deschiderea aplicației. Îți poți retrage oricând permisiunea din setările browserului.
          Ghidarea vocală folosește vocea browserului, pe dispozitivul tău.
        </p>
      </section>

      <section className="flow-help-card privacy-card">
        <h2>De ce avem voie</h2>
        <p>
          Prelucrăm datele pentru a-ți oferi funcția pe care o ceri (art. 6 alin. 1 lit. b din
          GDPR) și, pentru limitarea abuzurilor, în interesul legitim de a ține serviciul
          disponibil (art. 6 alin. 1 lit. f). Cookie-ul Motion este strict necesar pentru
          portofelul pe care îl folosești, așa că nu afișăm un banner de cookie-uri.
        </p>
      </section>

      <section className="flow-help-card privacy-card">
        <h2>Drepturile tale</h2>
        <ul>
          <li>
            <strong>Acces:</strong> tot ce păstrăm despre activitățile tale se vede în{' '}
            <a href="/wallet">Portofel</a>.
          </li>
          <li>
            <strong>Ștergere:</strong> butonul „Șterge portofelul” din Portofel elimină imediat
            soldul, istoricul și identificatorul de pe server.
          </li>
          <li>
            <strong>Opoziție și restricționare:</strong> poți folosi harta și parcările fără Motion
            și fără locație; plecarea se poate alege pe hartă.
          </li>
          <li>
            <strong>Plângere:</strong> te poți adresa Autorității Naționale de Supraveghere a
            Prelucrării Datelor cu Caracter Personal (ANSPDCP),{' '}
            <a href="https://www.dataprotection.ro/" target="_blank" rel="noopener noreferrer">
              dataprotection.ro <ExternalLink size={12} />
              <span className="sr-only"> într-o filă nouă</span>
            </a>
            .
          </li>
        </ul>
      </section>

      <details className="flow-help-card privacy-card privacy-english" lang="en">
        <summary>In English</summary>
        <p>
          {brand.product} has no accounts, ads or analytics. Your start point and destination are
          sent through our server to a routing provider (openrouteservice, FOSSGIS OSRM or the
          OSRM demo server) and cached in memory for a few minutes. Map tiles load directly from
          OpenFreeMap. For Motion activities, GPS points are evaluated on our server and then
          discarded; we keep only summaries (mode, start time, distance, duration, coins) linked to
          a random cookie whose hash we store. Inactive wallets are deleted after{' '}
          {MOTION_RULES.retentionDays} days, and you can delete yours at any time from the Wallet.
          IP addresses are held in memory for one minute for rate limiting. Your parked car, the
          payment time you enter and your saved places stay in this browser only (the car is
          forgotten after 48 hours). Google Maps and Waze receive only the parking position, and
          only when you tap their button. Calendar files and notifications are created on your
          device. You can complain to
          the Romanian data protection authority (ANSPDCP).
        </p>
      </details>

      <p className="privacy-updated">
        <ShieldCheck size={14} /> Actualizat la {new Date(updatedAt).toLocaleDateString('ro-RO')}
      </p>
    </div>
  );
}
