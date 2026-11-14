# VLAIQ FLOW · demonstrație și predare UniHack

Acest ghid separă capabilitățile verificate ale prototipului de un pilot propus.
Nu ține loc de regulament oficial, acord al Primăriei, test pe telefon sau interviu cu un locuitor.

## Ce știm despre cerințe

- Materialele primite de la echipă indică UniHack 2026, Green Mobility și un termen de
  code freeze **15 noiembrie, 13:00, ora Timișoarei**. Acest termen provine din cerințele
  trimise; nu a putut fi reconfirmat acum pe site-ul oficial.
- `docs/spec.md` D8 și checklist-ul echipei consemnează că un organizator a acceptat
  formatul web/PWA pe 13 noiembrie. Păstrăm această proveniență, fără a o transforma
  într-o verificare independentă a întregului regulament.
- Încercările actuale de a citi `https://unihack.eu/challenges` și
  `https://ghid-pmt.vercel.app/unihack` au primit refuz de la proxy (`CONNECT 403`).
  Nu am ocolit politica de rețea. Eligibilitatea challenge-urilor, folosirea AI și
  condițiile de jurizare trebuie reconfirmate de echipă prin canalele oficiale.
- Ghidul municipal furnizat cere: extinderea serviciilor existente, date cu sursă și
  dată, necunoscut în loc de presupunere, română clară, accesibilitate, minimizarea
  datelor personale și un proiect pe care instituția l-ar putea prelua.

Sursele de lucru sunt `docs/spec.md`, `docs/team-checklist.md` și ghidul municipal
trimis de echipă. Nu adăugăm reguli sau rezultate de jurizare imaginare.

## Pregătire înainte de prezentare

1. Rulați `pnpm typecheck`, `pnpm test` și `pnpm build` în checkout-ul final.
   Construcția frontend pregătește și shell-ul PWA public.
2. Deschideți adresa **HTTPS** de producție pe telefon și laptop. Nu folosiți un IP LAN
   pe HTTP pentru o demonstrație GPS pe telefon: browserul poate refuza localizarea.
3. Verificați backend-ul și accesul efectiv la furnizorii de hartă/rutare înainte de
   a promite că ruta va fi calculată în prezentare. Existența unei chei sau a unui
   domeniu în configurație nu dovedește că cererea funcționează.
4. Alegeți o destinație existentă în nomenclator și o origine explicită. Păstrați o
   captură/video de rezervă locală pentru acces extern întrerupt, etichetată ca înregistrare.
5. Pentru o demonstrație fizică Motion, testați în prealabil GPS-ul și permisiunile pe
   telefonul folosit. Un test cu coordonate controlate în Playwright nu este o plimbare reală.
6. Nu includeți în capturi nume, adrese personale, trasee spre domiciliu, numere de
   înmatriculare sau chei API. Folosiți destinații publice și conturi de prototip.
7. Redeschideți aplicația online o dată după instalare/construcție și lăsați pregătirea
   offline să se încheie. Nu faceți prima încărcare a unei aplicații de pe un dispozitiv fără rețea.

## Povestea de prezentare · aproximativ patru minute

### 1. O singură problemă, un drum complet

„Vreau să ajung în Timișoara și să aleg o variantă clară: unde parchez și cât mai merg
pe jos, sau dacă un mod activ este practic pentru acest drum.”

Deschideți **Explorează**, căutați o destinație reală și arătați locația. Harta cuprinde
județul Timiș, însă datele Timpark detaliate sunt în principal pentru municipiul
Timișoara. Conturul județului nu extinde automat acoperirea serviciilor.

### 2. Comparația de parcări

Panoul **Unde parchezi** apare imediat după destinație, fără punct de plecare. Arătați
primul card și apoi **Detalii și traseu**: șansele estimate de loc (etichetate *Estimat*,
model după zonă, zi și oră, nu senzori), mersul pe jos desenat pe hartă, costul pentru
durata aleasă și **De ce e pe locul 1**. Explicați diferența dintre datele oficiale,
geometria OSM și o estimare. Un punct de parcare nu dovedește un loc liber.
Ocuparea live nu este disponibilă. Prețul necunoscut nu este zero.

Folosiți **De unde provin datele?** pentru sursă, dată și limite, fără a transforma
ecranul principal într-un panou de diagnostic. Plata rămâne la Timpark/CityApp, iar
problemele din spațiul public merg în Sesizări.

### 3. Green Switch și FLOW Opportunity

Selectați o origine reală sau manuală. Dacă furnizorul a întors rute valide, comparați
opțiunile disponibile și arătați explicația diferențelor. Alegeți mersul pe jos sau
bicicleta numai când există o rută reală. Nu prezentați o linie dreaptă sau o rută
auto drept pistă de biciclete. Nu promiteți siguranță ori accesibilitate neverificate.

În lipsa cheii/accesului/rutei necesare, arătați explicația de indisponibilitate.
O opțiune absentă este mai credibilă decât o alternativă inventată. Transportul public
nu trebuie prezentat ca integrat sau live dacă feed-ul și motorul de rutare nu sunt conectate.

### 4. Mișcare, apoi recompensă

Continuați în **Mișcare**. Descrieți fluxul real: cerere de localizare la acțiunea
utilizatorului, observații GPS, filtre de plauzibilitate, încheiere și evaluare pe server.
Arătați pauza, semnalul GPS și limitele de foreground tracking.

Pentru backup folosiți numai **DEMO**, care este etichetat și are sold separat.
Prezentarea monedei și a animației nu dovedește o activitate fizică reală. Un utilizator
nu primește coins doar pentru că a ales o rută verde sau a apăsat un buton.

După evaluare, arătați recompensa exactă și istoricul din **Portofel**. Explicați că
recompensele sunt virtuale, fără valoare monetară. Portofelul de prototip este legat
de browser, nu un cont sincronizat și recuperabil pe toate dispozitivele.

### 5. O instituție poate înțelege ce primește

Din meniu, deschideți **Pentru Primărie**. Arătați acoperirea datelor publice și
simulatorul FLOW Balance. Spuneți „simulare deterministă” înainte de cifrele scenariului.
Aceste cifre nu sunt trafic măsurat, ocupare reală sau economie de CO₂ a orașului.

Închideți cu o propunere de pilot: Timpark și echipa municipală de mobilitate/digital
ar putea valida modelul pe date și observații reale. Nu susțineți că există deja un
parteneriat sau o adoptare oficială.

## Un indicator de pilot, fără rezultate inventate

Propunere: **timpul până când o persoană alege și înțelege o variantă de drum**.
Echipa poate cronometra voluntar o sarcină comparabilă cu și fără prototipul, apoi
nota dacă participantul a înțeles costul, mersul pe jos și incertitudinea locului.
Fără eșantion real nu afișăm minute economisite, rată de succes, impact asupra traficului
sau citate de la utilizatori. Checklist-ul Living Labs rămâne o sarcină pentru oameni.

## PWA și limitele offline

- Manifestul are iconuri PNG 192/512, o variantă maskable și o iconiță Apple 180.
  Operația de instalare depinde de browser și contextul HTTPS; interfața oferă un
  buton nativ numai când browserul emite `beforeinstallprompt`.
- Pe iPhone/iPad, instrucțiunile indică meniul Partajează din Safari și „Adaugă la
  ecranul principal”; aplicația nu pretinde că poate deschide un prompt Android pe iOS.
- Worker-ul cachează numai shell-ul public și fișierele statice ale build-ului.
  `scripts/prepare-pwa.mjs` inserează lista de fișiere și versiunea derivată din conținut.
- Cererile `/api`, răspunsurile cu autorizare, portofelele, coordonatele GPS, rutele
  și hărțile externe **nu** intră în cache-ul offline. Nu se generează recompense
  offline și nu se simulează un răspuns de server reușit.
- O versiune nouă a worker-ului așteaptă închiderea ferestrelor vechi. Nu folosim
  `skipWaiting` și nu reîncărcăm automat pagina în timpul unei activități.
- Pregătirea offline poate eșua dacă spațiul de stocare sau rețeaua nu permit cache-ul.
  Aplicația online rămâne utilizabilă. Nu promitem hărți ori GPS în fundal doar prin instalare.

## Comenzi de verificare PWA

```bash
pnpm build
PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright \
node scripts/test-pwa-browser.cjs
```

Scriptul rulează o pagină statică izolată pentru a verifica politica worker-ului:
cache public, excluderea API/autorizării, omisiunea cookie-urilor la pregătirea asseturilor,
fallback la un deep link offline și lipsa unui reload automat la actualizare. Nu dovedește
instalarea de pe un telefon real sau disponibilitatea furnizorilor externi.

## Predare

- Reverse proxy-ul trebuie să servească HTTPS și să trimită `/api/*` la Express, înainte
  de fallback-ul SPA la `index.html`. Rutele de frontend trebuie să funcționeze și la refresh.
- Serviți `service-worker.js` ca JavaScript, fără cache persistent la nivel de CDN.
  Nu transformați un asset lipsă într-un răspuns HTML cu status 200.
- Păstrați cheile doar în backend. Datele municipale se actualizează prin scripturi,
  nu prin cereri repetate ale fiecărui utilizator către Primărie.
- Verificați fișierul de licență din versiunea predată. Nu afirmați „MIT” sau
  „Apache-2.0” dacă echipa nu a stabilit și inclus licența proiectului.
- Documentați proprietarul operațional propus, sursele, snapshoturile, lipsa ocupării
  live, limitele portofelului și verificarea GPS. Legăturile spre serviciile municipale
  completează fluxul; nu creați un al doilea inbox de sesizări sau o casierie.
- Echipa trebuie să verifice separat pe dispozitive reale: Android Chrome, iPhone Safari,
  localizare refuzată, ecran rotit, text mărit, contrast și taste. Nu bifați aceste teste
  doar pentru că o suită Chromium automatizată a trecut.
