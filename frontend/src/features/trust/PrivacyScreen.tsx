import { ExternalLink, ShieldCheck } from 'lucide-react';
import { brand, MOTION_RULES, privacyContact } from '@vlaiq/shared';
import { LOCAL_ACCOUNTS } from '../identity/privateApi';
import './privacy.css';

/**
 * Privacy notice (GDPR art. 13). Every statement here must match what the code does:
 * update this page whenever a feature starts sending or storing personal data.
 */
const flows: { what: string; where: string; kept: string }[] = [
  { what: 'FLOW Buddy: întrebări și context educațional', where: 'La trimiterea unui mesaj, Google Gemini primește întrebarea, cel mult 8 mesaje recente și contextul misiunii. Nu trimitem profilul, emailul, soldul sau observațiile GPS. Răspunsul este generat de AI și poate greși.', kept: 'Conversația rămâne în memoria paginii și a serverului, fără salvare în PostgreSQL. Contextul serverului expiră după 30 minute de inactivitate și este curățat periodic; închiderea sesiunii încearcă să îl elimine imediat. Procesarea și retenția furnizorului depind de configurația contului Google.' },
  { what: 'FLOW Buddy: progres și accesorii', where: 'Lecțiile finalizate, nivelul, recompensele, accesoriile deținute și aspectul sunt legate de cont în PostgreSQL. FLOW Coins folosesc același portofel ca Motion.', kept: 'Până la ștergerea datelor FLOW din Setări. Ștergerea contului FLOW elimină progresul și accesoriile. Ștergerea doar a portofelului nu resetează lecțiile recompensate.' },
  { what: 'FLOW Buddy: voce opțională', where: 'Numai la apăsarea microfonului: furnizorul browserului poate procesa vocea pentru transcriere. Verifică permisiunea browserului. Textul se trimite lui Gemini doar când confirmi trimiterea. La apăsarea Ascultă, ultimul răspuns Buddy ajunge la ElevenLabs pentru sinteză.', kept: 'FLOW nu înregistrează audio. Clipul este eliberat la oprire, ieșirea din pagină sau schimbarea contului. Vocea necesită acordul din Setări; retenția furnizorilor este guvernată de politicile și configurația lor.' },
  ...(LOCAL_ACCOUNTS ? [{ what: 'Identificatorul acestui dispozitiv (fără cont)', where: 'Nu există cont și nicio parolă. La prima folosire, browserul generează un identificator aleator, păstrat în localStorage, și îl trimite serverului FLOW (antetul X-Flow-Device) doar pentru profil, portofel, Motion, FLOW Buddy și memoria vocii. Nu conține date despre tine.', kept: 'Cât timp nu ștergi datele site-ului din browser. „Șterge datele FLOW” din Setări șterge tot ce e legat de el pe server și generează unul nou. Cine are identificatorul vede profilul acelui browser: nu îl împărtăși.' }] : [{ what: 'Identitate și autentificare', where: 'Auth0 (tenant în regiunea SUA) gestionează contul, parola, furnizorii sociali și Passkey. FLOW validează tokenul și identifică utilizatorul prin issuer + subject.', kept: 'Tokenurile sunt ținute în memoria aplicației. Auth0 gestionează sesiunea și datele de identitate după politica sa; ștergerea datelor FLOW nu șterge identitatea Auth0.' }]),
  { what: 'Profil, fotografie și preferințe', where: 'Baza PostgreSQL a aplicației FLOW. Profilul este privat. Fotografiile sunt decodate și re-encodate WebP, fără metadatele originale.', kept: 'Până la ștergerea datelor FLOW din Setări. Copiile de siguranță au politica de retenție a operatorului; aceasta trebuie publicată înainte de producție.' },
  { what: 'Nickname pentru FLOW Voice (opțional)', where: 'ElevenLabs primește doar nickname-ul dacă activezi personalizarea din Setări. Nu trimitem emailul, biografia sau istoricul activităților.', kept: 'Consimțământul este salvat în profil. Dezactivarea închide sesiunea vocală curentă; o conversație nouă nu mai primește nickname-ul.' },
  { what: 'Memoria FLOW Voice (opțional)', where: 'Numai cu personalizarea vocii activată în Setări: textul ultimelor 40 de replici dintre tine și FLOW Voice, cu ora lor, se salvează în contul tău în baza PostgreSQL a aplicației FLOW. La pornirea unei conversații noi, ultimele 20 ajung la ElevenLabs, ca FLOW să continue de unde ați rămas. Fără audio și fără coordonate.', kept: 'Până o ștergi cu „Șterge memoria FLOW Voice” din Setări, debifezi personalizarea (memoria se șterge la salvare) sau ștergi datele FLOW. La deconectare, conversația dispare și din fila browserului.' },
  {
    what: 'FLOW Voice: microfonul și contextul minim al călătoriei',
    where:
      'Opțional și dezactivat implicit (Meniu → FLOW Voice). Numai după pornire explicită: vocea ajunge prin WebRTC la ElevenLabs. Instrumentele trimit etichete de locații, preferințe și rezumate ale rutelor, fără coordonate sau istoric GPS. Textul indicațiilor deterministe poate ajunge la ElevenLabs pentru sinteză.',
    kept: 'Aplicația nu salvează audio sau tokenuri. Ce spui și ce răspunde FLOW apare pe ecran și e păstrat în această filă a browserului (sessionStorage), ca FLOW să nu uite conversația când schimbi pagina; dispare când închizi fila sau te deconectezi. Textul ajunge în contul tău FLOW doar dacă ai activat personalizarea vocii (vezi „Memoria FLOW Voice”). La repornirea vocii, ultimele replici și datele călătoriei (fără coordonate) sunt trimise din nou către ElevenLabs, ca agentul să continue de unde a rămas. Agentul este configurat cu înregistrarea audio dezactivată și retenție 0 zile; procesarea furnizorului rămâne supusă setărilor contului. Clipurile de navigație sunt păstrate în memoria serverului cel mult 15 minute; browserul le eliberează după redare. Oprește FLOW Voice ca să închizi microfonul. Alegerea de a activa FLOW Voice e păstrată doar în acest browser (localStorage).',
  },
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
    kept: `Coordonatele nu se salvează. Păstrăm tipul activității, ora de start, distanța, durata, recompensa și o amprentă (hash) a observațiilor, fără locații. Sumarele portofelelor fără activitate ${Math.round(MOTION_RULES.retentionDays / 30)} luni se elimină la următoarea accesare a portofelului. Profilul rămâne până îl ștergi.`,
  },
  {
    what: 'Cookie-ul motion_session',
    where: 'Cookie de la prototipul anterior. Portofelul autentificat folosește acum tokenul verificat, nu cookie-ul.',
    kept: 'Datele vechi rămân separate; nu sunt importate automat în cont. Cookie-ul vechi expiră după un an. Importul nu este disponibil în această versiune.',
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
          {brand.product} are o pagină principală publică, fără reclame și fără analytics. {LOCAL_ACCOUNTS ? 'Totul merge fără cont: profilul, portofelul, Motion, FLOW Buddy și memoria vocii sunt legate de acest browser printr-un identificator aleator.' : 'Harta, parcările, rutele, navigația și paginile despre date merg fără cont; profilul, portofelul, Motion, FLOW Buddy și FLOW Voice necesită un cont.'} Nu vindem datele. Folosim doar ce este necesar ca să îți arătăm parcări, rute și
          activitățile tale.
        </p>
      </div>

      <section className="flow-help-card privacy-card">
        <h2>Cine răspunde de date</h2>
        {controller && email ? (
          <p>
            Operatorul datelor pentru {domain} este <strong>{controller}</strong>. Pentru orice
            întrebare sau cerere privind datele tale scrie la{' '}
            <a href={`mailto:${email}`}>{email}</a>.
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
          Ghidarea vocală încearcă ElevenLabs și revine la sinteza browserului dacă fișierul nu
          ajunge la timp. Unele voci ale browserului pot necesita procesare prin furnizorul
          sistemului; disponibilitatea și procesarea depind de dispozitiv.
        </p>
      </section>

      <section className="flow-help-card privacy-card">
        <h2>De ce avem voie</h2>
        <p>
          Prelucrăm datele pentru a-ți oferi funcția pe care o ceri (art. 6 alin. 1 lit. b din GDPR)
          și, pentru limitarea abuzurilor, în interesul legitim de a ține serviciul disponibil (art.
          6 alin. 1 lit. f). Cookie-ul Motion este strict necesar pentru portofelul pe care îl
          folosești, așa că nu afișăm un banner de cookie-uri.
        </p>
      </section>

      <section className="flow-help-card privacy-card">
        <h2>Drepturile tale</h2>
        <ul>
          <li>
            <strong>Acces:</strong> profilul este în FLOW Passport, iar sumarele activităților se văd în{' '}
            <a href="/wallet">Portofel</a>.
          </li>
          <li>
            <strong>Ștergere:</strong> butonul „Șterge portofelul” din Portofel elimină imediat
            soldul și istoricul Motion de pe server. Din Setări poți șterge și profilul, fotografia și preferințele. Identitatea Auth0 necesită o cerere separată către operator.
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
          {brand.product} {LOCAL_ACCOUNTS ? 'needs no account: a random ID kept in this browser ties the profile, wallet, Motion, FLOW Buddy and voice memory to it; no ads or analytics.' : 'uses Auth0 accounts for the profile, wallet, Motion, FLOW Buddy and FLOW Voice. The map, parkings, routes, navigation and data pages work without an account, with no ads or analytics.'} PostgreSQL stores your private profile, processed avatar, preferences and account wallet. Deleting FLOW data does not delete your Auth0 identity. Optional voice personalization sends only your nickname to ElevenLabs with consent. Your start point and destination are
          sent through our server to a routing provider (openrouteservice, FOSSGIS OSRM or the OSRM
          demo server) and cached in memory for a few minutes. Map tiles load directly from
          OpenFreeMap. For Motion activities, GPS points are evaluated on our server and then
          discarded; we keep only summaries (mode, start time, distance, duration, coins) linked to {LOCAL_ACCOUNTS ? "this browser's random ID" : 'your verified Auth0 issuer and subject'}. Legacy browser wallets remain separate and are not automatically imported. Inactive wallet summaries are purged on the next access after{' '}
          {MOTION_RULES.retentionDays} days, and you can delete yours at any time from the Wallet.
          FLOW Voice is off by default (Menu → FLOW Voice). When you explicitly start it, microphone audio and minimal journey
          labels/preferences are processed by ElevenLabs; route geometry and GPS history stay in the
          app. Navigation instruction text may be synthesized by ElevenLabs, with browser speech as
          fallback. We do not store audio, transcripts or conversation tokens. IP addresses are held
          in memory for one minute for rate limiting. Your parked car, the payment time you enter and
          your saved places stay in this browser only (the car is forgotten after 48 hours). Google
          Maps and Waze receive only the parking position, and only when you tap their button.
          Calendar files and notifications are created on your device. You can complain to the
          Romanian data protection authority (ANSPDCP).
        </p>
      </details>

      <p className="privacy-updated">
        <ShieldCheck size={14} /> Actualizat la {new Date(updatedAt).toLocaleDateString('ro-RO')}
      </p>
    </div>
  );
}
