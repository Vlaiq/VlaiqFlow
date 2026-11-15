# NetRom · Glue It Together

Implementare pe `feature/netrom-glue-it-together`. Fluxul hartă → Buddy → aceeași rută pe hartă este verificat local, inclusiv cu datele Timpark/OSM, rutarea reală HeiGIT și explicația Gemini reală pentru aceeași comparație. Certificarea cu un cont Auth0 real rămâne deschisă din cauza accesului la tenant descris mai jos.

## Baza verificată înainte de editare

`git ls-remote --heads origin`, fetch și istoricul tuturor branch-urilor au confirmat:

| Referință | Vârf verificat | Alegere |
| --- | --- | --- |
| `feature/flow-buddy-gemini` | `f2884b02dc138f9a7ea7954c905eea2274097979` | Baza integrării |
| Handoff Auth0 | `8fba1c8` | Deja strămoș al bazei prin merge-ul `3f99e38`; nu a fost aplicat din nou |
| `feature/flow-identity-auth0`, PR #1 | `bb7ffc443df3c37529305104b0d13b1ad8496cfa` | Cele două commit-uri suplimentare sunt verificări/documentație Windows |

PR #1 era deja merged în `school-drop-off-zones` la verificarea curentă. Checkout-ul inițial `work` la `bcbeb88` a fost păstrat; integrarea are branch separat.

## Contractul integrării

- Planificatorul, SmartMatch, tarifele și proveniența, API-ul complete journeys, clientul Gemini Buddy, AuthGateway, selecția GreenSwitch și geometria MapLibre sunt reutilizate.
- Comparațiile planificatorului primesc de la server un ID aleator, o revizie și o expirare de 15 minute. Snapshot-ul este validat cu schema existentă și copiat, fără modificarea cache-ului furnizorilor.
- Secret de sesiune aleator de 256 biți în `sessionStorage`, trimis numai în header; backendul păstrează hash-ul. URL-ul conține doar ID/revizie/opțiune. Prima citire cu JWT verificat leagă snapshot-ul de cont. Sunt necesare sesiunea inițiatoare și, după legare, același cont. Numele de cont și identitatea nu ajung la Gemini.
- Store-ul este în memorie, limitat la 200 de comparații, pentru un singur proces pe laptop. Restartul, evacuarea, expirarea sau un calcul nou în aceeași sesiune cer recalculare. Un calcul vechi care se termină mai târziu nu poate înlocui rezultatul nou.
- Întrebarea acceptă explicit `cel mult N minute pe jos` (și maximum/maxim/limita de), cu N întreg între 0 și 180. Nu folosim Gemini pentru interpretarea sau aplicarea limitei. Filtrarea existentă a comparației a fost mutată în shared și este reutilizată de backend și FLOW Voice. Pragul se aplică secundelor nerotunjite, inclusiv la egalitate.
- Serverul alege opțiunea eligibilă din clasamentul comparației. Gemini primește doar opțiunile și faptele necesare: durată, mers, cost, disponibilitate/proveniență și limitări; nu primește coordonate, geometrie, cont, token sau secretul sesiunii. Textul cu cifre este respins; cifrele afișate provin din snapshot-ul serverului.
- `load`, `explain`, `select` sunt endpoint-uri protejate de middleware-ul JWT/RS256 Auth0 existent și au `Cache-Control: no-store`. Schema strictă respinge metrici și identități injectate de client. Selectarea cere o opțiune explicată de server în revizia respectivă.
- Revenirea validează din nou pe server ID-ul/revizia/opțiunea, apoi publică snapshot-ul original în planificator. Păstrează originea, destinația, durata parcării, limita, tariful/preferința de parcare, ora și preferința vizuală. Nu recalculează implicit. La expirare, păstrează intrările locale pentru un calcul nou cerut explicit și nu desenează ruta veche.
- Gemini are un buget de 10 secunde. Eroarea, timeout-ul sau textul invalid lasă rezultatul determinist și butonul de hartă disponibile. Fără variante eligibile, mesajul este exact: „Setul comparat nu conține o variantă eligibilă. Ajustează limita de mers pe jos.” Stocarea de sesiune dezactivată lasă funcțional planificatorul public, fără handoff Buddy.

## Pornire pe laptop și demo de circa 60 secunde

Necesită Node 24.22.1, pnpm, PostgreSQL local configurat prin `DATABASE_URL`, `ORS_API_KEY` și `GEMINI_API_KEY` în mediul procesului. Launcher-ul existent configurează identificatorii publici Auth0 și callback-ul `http://localhost:5173/`; nu modifică tenantul. Cheile rămân pe backend. Nu introduce tokenuri în fișiere sau argumente.

```sh
pnpm install --frozen-lockfile
pnpm identity:acceptance
```

Deschide `http://localhost:5173`. În mediul Cloud cu proxy, pornește cu `NODE_USE_ENV_PROXY=1` pentru apelurile Node, păstrând certificatele și proxy-ul moștenite. Pe laptopul fără proxy nu este necesar.

1. **0–10 s:** intră cu contul Auth0 real înainte de jurizare, dacă serviciul și contul sunt disponibile. Pentru a arăta trecerea prin login, poți începe ca vizitator; Buddy păstrează referința prin `appState.returnTo` și sessionStorage. Nu promitem durata autentificării externe în cele 60 secunde.
2. **10–30 s:** `Încearcă DEMO` setează Gara de Nord → Piața Victoriei, fără GPS, și o oră explicită într-o zi lucrătoare. Alege `Trasee`. Așteaptă comparația cu sursele și etichetele ei. Alternativ, selectează manual aceleași puncte.
3. **30–45 s:** apasă `Întreabă-l pe Buddy despre drumul acesta`, apoi trimite întrebarea implicită despre **8 minute pe jos**. Citește durata și mersul din fișa validată. O bicicletă fără segment de mers are zero minute pe jos; nu pretindem că este automat potrivită tuturor utilizatorilor.
4. **45–60 s:** apasă `Arată-mi ruta`. Cardul opțiunii explicate este selectat, panoul ajunge la Smart Journey, iar harta desenează geometria acelei opțiuni. ID-ul și revizia există atât pe card, cât și pe feature-urile liniei.

Dacă Gemini nu răspunde, spune că aplicația arată rezultatul determinist. Nu prezenta fallback-ul drept explicație generată. Dacă referința a expirat, folosește `Recalculează comparația`, apoi redeschide Buddy.

## Verificări efectuate la 15 noiembrie 2026

| Verificare | Rezultat și limită |
| --- | --- |
| `pnpm typecheck` | PASS |
| `pnpm test` | 671 teste trecute: shared 132, frontend 112, backend 420, operator 7. Alte 16 teste PostgreSQL existente sunt omise deoarece mediul nu are baza de test configurată. |
| `pnpm build` | PASS; avertismentele existente pentru chunk-uri peste 500 kB rămân |
| Teste HTTP noi | 7 cazuri cu semnături RS256 reale locale: JWT absent/expirat, altă sesiune/alt cont, revizie greșită, expirare, înlocuire și cursă între calcule, filtrare inclusivă, proiecție minimă Gemini, opțiune falsă/neexplicată, set fără opțiune eligibilă și ajustarea limitei, Gemini indisponibil/text numeric |
| Browser local | PASS: aplicația reală, SDK Auth0/rute/Gemini sintetice, middleware RS256 și MapLibre reale. Callback cu reîncărcare de pagină; păstrarea referinței, preferinței și intrărilor; fără recalculare implicită; reload pe ruta selectată; alt cont 403; expirare 409; recalculare explicită; set gol; ajustare; outage; comparație înlocuită. Zero erori JS. |
| Identitatea desenului | Testele compară explicit `data-explained-option-id` și revizia răspunsului cu cardul selectat și cu `queryRenderedFeatures()` din MapLibre. Nu verifică doar atributul unui container. |
| HeiGIT real | PASS: auto, foot-walking și cycling-regular, cu geometrie și metrici validate. Comparația reală a returnat 5 opțiuni, cu parcări Timpark și OSM și toate segmentele mobile din openrouteservice. |
| Browser cu furnizori reali | PASS pentru Timpark/OSM → HeiGIT → explicație Gemini reală → aceeași rută pe hartă, aproximativ 25 secunde. Identitate RS256 de test și stil de bază sintetic, marcate explicit. Acesta nu certifică un cont Auth0 real. ID explicat și randat: `flow-df4e8e4d7a815b91`; durata estimată a opțiunii cu bicicleta: 450,5 s, mers pe jos: 0 s. |
| Gemini real | PASS: model listing, `gemini-3.5-flash`, smoke Buddy și explicația aceleiași comparații reale în browser. Apeluri intermediare au întâmpinat timeout/503/504; în acele probe fallback-ul și selecția exactă au rămas funcționale. Ultima probă a afișat sursa `Explicație Gemini`. |
| Auth0 real | BLOCKED: discovery și JWKS prin transportul Node/JWT dau `ERR_PROXY_TUNNEL`; Chromium confirmă `net::ERR_TUNNEL_CONNECTION_FAILED`. Nu a fost posibil un login real, schimbul de token și revenirea cu JWT Auth0 real. Nu am modificat tenantul și nu am creat conturi. |

[Rezultate browser cu ID-uri și revizii](screenshots/netrom/verification.json) · [Buddy, fixture local explicit](screenshots/netrom/buddy-local-fixture.png) · [Buddy cu Gemini/HeiGIT reale și identitate de test](screenshots/netrom/buddy-real-gemini-test-identity.png) · [Harta cu rută HeiGIT reală și identitate de test](screenshots/netrom/map-real-heigit-test-identity.png)

## Reproducerea verificărilor în Cloud

Testele browser necesită Chromium și Playwright. `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, `NETROM_URL`, `NETROM_OUTPUT` și `NETROM_FIXTURE_FILE` pot indica instalarea și fișierele locale. În această probă fișierele intermediare au fost în `/workspace/work`.

```sh
# Terminal 1: numai fixture-uri locale, fără bypass în codul de producție
NODE_ENV=test NETROM_FIXTURES=1 pnpm -F backend exec tsx scripts/netrom-browser-server.ts

# Terminal 2: aceeași configurare PUBLICĂ Auth0 din frontend/.env.example, prin mediul procesului
# Pentru testul în browser, Playwright înlocuiește numai SDK-ul în propriul context.
VITE_AUTH0_DOMAIN=dev-3a2ijpzkw4p8cng6.us.auth0.com VITE_AUTH0_CLIENT_ID=97hHmp8qdXa5H5eVcJz3nah9uBlNjvaU VITE_AUTH0_AUDIENCE=https://api.vlaiqflow.app pnpm -F frontend dev

# Terminal 3
node scripts/test-netrom-browser.cjs
```

Pentru proba cu furnizori reali pornește încă un server cu `NODE_USE_ENV_PROXY=1 NODE_ENV=test NETROM_FIXTURES=1 NETROM_REAL_PROVIDERS=1 NETROM_FIXTURE_FILE=/workspace/work/netrom-live-accounts.json`; acesta ascultă pe 8793. Rulează `node scripts/test-netrom-live-browser.cjs`. Contextul browser folosește endpoint-urile reale de călătorie și explicație și contul local semnat; nu poate certifica autentificarea Auth0 externă.

**Pasul rămas pentru acceptarea completă de juriu:** pe laptopul cu acces la tenant și baza locală, pornește launcher-ul, autentifică un cont Auth0 real și repetă cele patru acțiuni, confirmând revenirea prin login, sursa `Explicație Gemini` și același ID/revizie în linia randată. Verificările locale și proba cu furnizorii reali HeiGIT/Gemini sunt finalizate separat de acest gate extern.
