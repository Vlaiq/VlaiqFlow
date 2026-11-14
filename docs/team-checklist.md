# VLAIQ — Checklist pentru echipă (sarcini doar pentru oameni)

Agentul AI nu poate face aceste lucruri. Bifați-le și notați rezultatul (link, captură de ecran, decizie) direct aici.

## Înainte de start (12 noiembrie / dimineața zilei de 13)

- [ ] **Regulile hackathonului:** este permis cod scris înainte de start? Ce unelte AI sunt permise? Care sunt cerințele de submisie? → link: ___
- [ ] **Eligibilitatea pentru fiecare challenge** (Green Mobility, NetRom, Living Labs, Gemini, ElevenLabs, Tiger Data, Vultr, Auth0, Entire) și ce dovezi se cer → ___
- [ ] **Programul exact:** ora de start, ora limită de submisie, ora jurizării → completați în spec §15
- [x] **Sursa GTFS:** feed-ul oficial e publicat de SMTT (autoritatea metropolitană); STPT operează vehiculele. Detalii în spec §5.2 și în [ghidul Primăriei](https://ghid-pmt.vercel.app/unihack)
- [x] **Date despre parcări:** zonele, parcările și străzile Timpark, cu tarife și coduri SMS, vin din endpoint-ul Primăriei `cont.primariatm.ro/api/mobile/parking`. Ocuparea nu există nicăieri
- [x] **Formatul:** aplicația web e acceptată (confirmat de un organizator pe 13 noiembrie)
- [ ] **Întrebări pe Discord-ul UniHack** (echipa digitală a Primăriei):
    - Se suprapune ideea noastră (comparație parcare + transport + mers pe jos) cu ceva din CityApp?
    - Tarifele din endpoint-ul de parcări sunt în euro (câmpul se numește `eur`)? Există și valoarea în lei?
    → răspunsuri: ___
- [ ] **Date reale de ocupare pentru recomandarea de parcare** (acum șansa de loc liber e o estimare după reguli, spec §7.3). Întrebați Primăria sau Timpark:
    - Există numărul de plăți Timpark (SMS / CityApp) pe zonă și pe oră, chiar anonimizat, pentru ultimele săptămâni?
    - Există senzori sau numărători în parcările Timpark (de exemplu Piața Huniade / Modex)?
    → răspuns: ___
- [ ] **Numărători manuale (Living Labs):** 2 zone demo (Piața Victoriei, Iulius Mall), 5–10 parcări, câte 20–30 de observații „am găsit loc / era plin la ora X”. Notați data, ora, parcarea și rezultatul în `docs/user-testing/`. Cu ele calibrăm curbele din `backend/src/engines/smartmatch/occupancy.ts`
- [x] **Licența proiectului:** MIT (decis pe 14 nov., fișierul `LICENSE`)
- [ ] **Cine ar prelua proiectul** după hackathon (Timpark, SMTT, echipa digitală a Primăriei)? → îl spunem în pitch
- [ ] **Numărul de urmărit** (un singur indicator că proiectul funcționează) → ___
- [ ] **Tarifele de parcare** pentru zona demo (Piața Victoriei, Piața Unirii): sursa oficială și data verificării → ___
- [ ] **Factorii de emisie** (mașină g/km, transport public g/pasager-km) cu sursă citabilă → spec D4
- [ ] **Cotele actuale** openrouteservice: directions, matrix, autocomplete → spec D3
- [ ] **Decizii:** ~~numele final al produsului~~ (VLAIQ FLOW, final pe 14 nov.), limba UI-ului, ora de feature freeze
- [ ] **Operatorul datelor pentru vlaiqflow.ro:** completați `privacyContact.controller` și `privacyContact.email` în `shared/src/brand.ts` înainte de lansare. Până atunci pagina /confidentialitate arată un gol vizibil
- [ ] **Domeniul vlaiqflow.ro** e pe contul personal al unui membru (decizie conștientă, excepție de la spec §17). Notați cine îl reînnoiește și cum se transferă la predare → ___

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
- [ ] Dimineața zilei de 15: descărcați din nou GTFS-ul SMTT și datele Timpark; verificați versiunea în `feed_info.txt`
- [ ] Verificare WCAG 2.1 AA pe fluxul principal (tastatură, contrast, texte alternative, text mărit)
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
