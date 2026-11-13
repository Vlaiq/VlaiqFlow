# VLAIQ — Checklist pentru echipă (sarcini doar pentru oameni)

Agentul AI nu poate face aceste lucruri. Bifați-le și notați rezultatul (link, captură de ecran, decizie) direct aici.

## Înainte de start (12 noiembrie / dimineața zilei de 13)

- [ ] **Regulile hackathonului:** este permis cod scris înainte de start? Ce unelte AI sunt permise? Care sunt cerințele de submisie? → link: ___
- [ ] **Eligibilitatea pentru fiecare challenge** (Green Mobility, NetRom, Living Labs, Gemini, ElevenLabs, Tiger Data, Vultr, Auth0, Entire) și ce dovezi se cer → ___
- [ ] **Programul exact:** ora de start, ora limită de submisie, ora jurizării → completați în spec §15
- [ ] **Operatorul de transport și sursa GTFS:** STPT? Unde e publicat feed-ul, sub ce licență și când a fost actualizat? → ___
- [ ] **data.primariatm.ro:** ce seturi de date există despre parcări, tarife și zone? Ce licență au? → ___
- [ ] **Tarifele de parcare** pentru zona demo (Piața Victoriei, Piața Unirii): sursa oficială și data verificării → ___
- [ ] **Factorii de emisie** (mașină g/km, transport public g/pasager-km) cu sursă citabilă → spec D4
- [ ] **Cotele actuale** openrouteservice: directions, matrix, autocomplete → spec D3
- [ ] **Decizii:** numele final al produsului, limba UI-ului, ora de feature freeze

## Conturi și chei (fiecare în `.env`, niciodată în git)

- [ ] openrouteservice API key
- [ ] Gemini API key (verificați ce spun termenii nivelului gratuit despre folosirea datelor)
- [ ] ElevenLabs API key + câte caractere include planul gratuit
- [ ] Vultr: credite, VM creat, domeniu sau hostname `sslip.io`, Caddy pentru HTTPS
- [ ] Tiger Cloud: bază de date creată, extensiile `timescaledb` și `postgis` disponibile
- [ ] Vercel: proiect legat de repo
- [ ] Auth0 (doar dacă îl folosim): tenant + aplicație SPA
- [ ] MapTiler key ca rezervă pentru tile-uri

## Date (dacă regulile permit pregătirea înainte de start)

- [ ] Export Overpass `amenity=parking` pentru Timișoara → GeoJSON; păstrați query-ul în `docs/data-sources/`
- [ ] Verificați manual 5–10 parcări din zona demo (există, au nume corect, tip, capacitate)
- [ ] Alegeți originea demo (un punct real din Timișoara, la 3–5 km de centru)

## În timpul hackathonului

- [ ] Ziua 1: P0 este deployat și se deschide de pe telefon prin URL-ul public
- [ ] Ziua 2: Living Labs runda 1 (5–8 participanți), notițe brute în `docs/user-testing/`
- [ ] Ziua 2: top 3 probleme reparate, apoi runda 2 cu aceeași sarcină
- [ ] Testare pe Android Chrome **și** pe iPhone Safari (inclusiv „Add to Home Screen”)
- [ ] Testare cu GPS refuzat, rețea lentă și Gemini/ElevenLabs dezactivate
- [ ] Codul QR trimite către URL-ul de producție (verificat cu 2 telefoane diferite)
- [ ] Înregistrarea de rezervă a demo-ului (pașii 2–7)
- [ ] Dovezi pentru challenge-uri în `docs/challenge-evidence/` (capturi de ecran, loguri, linkuri)
- [ ] Repetiția pitch-ului, cronometrată (≈4 minute)

## Protocol Living Labs (de printat)

- **Participanți:** ID anonim P1…P8. Nu notați nume și nu faceți poze cu fața participanților.
- **Sarcina:** „Găsește o parcare potrivită pentru Piața Unirii și pornește navigarea.”

| ID | Runda | Reușit? | Timp până la alegere (s) | Ezitări / tap-uri greșite | Claritate 1–5 | Observații |
|---|---|---|---|---|---|---|
| P1 | 1 | | | | | |

**Întrebări:**
1. Cum găsești acum parcare în Timișoara?
2. Ce te frustrează cel mai mult?
3. Ai merge mai mult pe jos ca să nu mai cauți loc?
4. Ce contează cel mai mult: timpul, prețul sau disponibilitatea?
5. A fost ușor de înțeles recomandarea?
6. Ce ai îmbunătăți?
