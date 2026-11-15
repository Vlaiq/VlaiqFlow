# FLOW Buddy verification — 15 November 2026

This report distinguishes production implementation, local fixtures, real providers and unverified deployment. Source base: `54ca27e`. User-confirmed Auth0 handoff: `8fba1c8`; reviewed merge: `3f99e38`. Work remains on `feature/flow-buddy-gemini`. The parallel contract is unchanged.

## Evidence

| Check                                  | Result     | Actual scope                                                                                                                                                                                                              |
| -------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remote/base/contract audit             | PASS       | All six requested branches fetched/inspected; dedicated existing branch used                                                                                                                                              |
| Confirmed Auth0 handoff regression     | PASS       | Detached exact commit; its full test command, including real PostgreSQL + local RS256 checks                                                                                                                              |
| Buddy domain/HTTP tests                | PASS       | Strict inputs/actions, bounded context, stale instances, cross-account rejection, cap/idempotency, rollback, concurrent spending, fail-closed auth                                                                        |
| PostgreSQL boundary                    | PASS       | Real PostgreSQL 17; 40 concurrent completions, duplicate purchases, rollback, reload, equip and deletion cascade; synthetic host-ledger adapter distinguished from production adapter                                     |
| Integrated existing economy            | PASS       | Real PostgreSQL + real RS256 validation + actual MotionStore; concurrent physical/educational rewards and purchases; one balance; Motion cap/count isolation                                                              |
| Robot/city browser                     | PASS       | Real Chromium; wave transforms, facial states, before/after allocations, responsive layout, reduced motion, previews, error recovery and account cleanup; AI/account economy explicitly synthetic                         |
| Actual-app account browser             | PASS       | Challenges → Buddy → three lessons → 15 coins → 15-coin purchase → equip → reload → unified wallet → Passport → switch account → guest gateway. PostgreSQL and FLOW journal real; Auth0 SDK/local issuer and AI synthetic |
| Automated accessibility                | PASS       | Buddy WCAG 2 A/AA and 2.1 AA axe scan; zero reported violations in the exercised desktop state. Not a complete screen-reader/device audit                                                                                 |
| Actual mounted private endpoints       | PASS       | Anonymous state/chat/answer/purchase/speech each returned HTTP 401 and `Cache-Control: no-store`                                                                                                                          |
| Gemini model list                      | PASS       | Actual authenticated project listing returned 26 generation-capable models                                                                                                                                                |
| Gemini real generation                 | PASS       | `gemini-3.5-flash`; unscripted Romanian regenerative-braking question; strict action parsed. Measured 6,937 ms including the listing on the final bounded smoke run                                                       |
| Earlier Gemini model                   | FAIL       | Listed `gemini-2.5-flash` returned 404 for generation; replaced with the actually working configurable model                                                                                                              |
| ElevenLabs TTS                         | PASS       | Actual Romanian speech request, 28,464 bytes, 1,607 ms. Not proof of microphone conversation                                                                                                                              |
| Real Auth0 tenant connectivity         | BLOCKED    | Discovery/JWKS probes: DNS `EAI_AGAIN`, fetch connection failure and HTTPS `ERR_PROXY_TUNNEL` from this environment; TLS verification retained                                                                            |
| Actual Auth0 user login/token exchange | BLOCKED    | No successful real-user external session was obtained in this environment; local signed tokens do not establish this                                                                                                      |
| Real microphone/two-way voice          | NOT TESTED | Synthetic lifecycle tests only; physical microphone recognition and real conversational audio still require a supported browser/device                                                                                    |
| Physical phone/GPS/screen reader       | NOT TESTED | Existing evaluator regression tests pass; no outdoor activity or physical assistive-technology test is claimed                                                                                                            |
| Public deployment                      | NOT TESTED | No domain, TLS deployment or production database provisioned                                                                                                                                                              |

Full regression run: **680 tests passed, zero skipped** with all three disposable database URLs supplied: shared 132, frontend 112, backend 429, operator 7. Typechecks passed for all three workspaces. Production build passed. The separate production Chromium test passed with the actual Auth0 SDK in guest mode: `/buddy` received the existing gateway, private APIs returned 401/no-store, no Buddy/audio chunk was fetched or precached on the public homepage, no API response entered the cache, and the public shell remained available offline. The existing PWA fixture regression also passed. After the final account-erasure/cancellation change, all 24 affected Buddy/Identity tests and the backend typecheck passed again. The final exclusive-audio change passed all 20 Buddy audio/navigation arbiter tests and the frontend typecheck.

Production asset scans found **zero configured Gemini/ElevenLabs secret values and zero fixture implementation/token/reset-endpoint markers**. The public cache manifest excludes Buddy character, route, discovery, CSS and optional audio chunks; they are cached as static assets only after an actual private-route fetch. It contains no private API data.

## Performance observations

The final warm local Chromium **development-server** run opened Buddy in **1,326 ms**, verified/confirmed lesson rewards in **306–468 ms** and confirmed a cosmetic purchase in **201 ms**. Across a 60-frame idle sample, median and p95 frame intervals were both approximately **16.7 ms**. The reported whole-application JS heap was **49.0 MB** and the document had **1,339 nodes**, including the mounted map and application shell; these are not the robot's isolated allocations. During concurrent regression/build work, p95 frame intervals reached 50–66.6 ms and reward confirmation took up to 1,681 ms. An early render timing that accidentally included an axe audit was discarded; the corrected timer excludes it. These observations are not production SLAs or physical-device performance claims.

Robot and city use SVG/CSS without a new 3D or animation runtime. Typing does not recreate the memoized face/city. Optional Buddy audio is lazy. The production build emits private-route chunks separately; bundle sizes and fixture/secret scans are listed with the final run.

Pure server-side city answer evaluation, 1,000 bounded repetitions with the fixed scenario: median **0.030 ms**, p95 **0.269 ms**, excluding network, persistence and providers.

## Acceptance criteria

PASS here means implemented and verified within the stated local/provider scope; it never substitutes a synthetic account for a real Auth0 user.

| #   | Critical requirement                                     | Status  | Evidence / remaining limit                                                                                                                  |
| --- | -------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Login required                                           | PARTIAL | Protected AuthGateway and strict API JWT tests pass; external Auth0 session blocked                                                         |
| 2   | Discoverable from Challenges                             | PASS    | Actual-app browser; original Motion mission heading preserved                                                                               |
| 3   | Dedicated polished screen                                | PASS    | `/buddy`, responsive stage/chat/city/workshop, two themes                                                                                   |
| 4   | Moving face                                              | PASS    | Vector brows/eyes/mouth; real browser state exercise                                                                                        |
| 5   | Moving eyes/pupils                                       | PASS    | Central blink/gaze scheduler, independent pupil interpolation                                                                               |
| 6   | Mouth changes shape                                      | PASS    | Expressions plus playback-only synthetic media lifecycle checks; no phoneme claim                                                           |
| 7   | Head tilts/nods                                          | PASS    | Dedicated local head transform and state CSS                                                                                                |
| 8   | Two articulated arms                                     | PASS    | Six shoulder/elbow/wrist groups and visible hands/fingers                                                                                   |
| 9   | Hand wave                                                | PASS    | Separate shoulder/elbow/hand timelines, finite event completion                                                                             |
| 10  | Distinct listening/thinking/talking/pointing/celebrating | PASS    | Reducer priority tests, rig/browser and synthetic media tests                                                                               |
| 11  | Real Gemini text                                         | PASS    | Production service uses official SDK; real bounded smoke passed                                                                             |
| 12  | Unscripted questions                                     | PASS    | Real unfamiliar educational question answered; browser fixtures separately labeled                                                          |
| 13  | Validated adaptation                                     | PASS    | Three difficulties; different city constraints; safe action reissues instances                                                              |
| 14  | City reacts to choices                                   | PASS    | Server results reposition vehicles and change before/after metrics                                                                          |
| 15  | Honest synthetic data                                    | PASS    | Persistent educational-simulation label, explicit assumptions, no measured CO₂ claim                                                        |
| 16  | Deterministic completion                                 | PASS    | Server-only keys, versioned known lessons, strict validated options                                                                         |
| 17  | Existing FLOW economy                                    | PASS    | Same account row/JSON journal; actual-app and DB tests                                                                                      |
| 18  | Forgery/duplicate prevention                             | PASS    | Trusted identity, server prices/amounts, row locks and unique SQL receipts                                                                  |
| 19  | Legitimate cosmetic purchases                            | PASS    | Atomic same-wallet debit, ownership check, confirm then equip; real DB with synthetic identity                                              |
| 20  | Persistent progress                                      | PASS    | Actual PostgreSQL reload; full account deletion cascades                                                                                    |
| 21  | Account isolation                                        | PASS    | Issuer+subject keys, local RS256 tests, browser switch clears private state                                                                 |
| 22  | Two-way voice                                            | PARTIAL | Browser STT/edit/send/Gemini/TTS pipeline implemented; real TTS passed; microphone flow not tested                                          |
| 23  | Navigation/existing FLOW Voice                           | PARTIAL | Integration leaves pinned agent unchanged and retains arbitration; regression suite passes; no new live navigation call                     |
| 24  | Existing Motion rules unchanged                          | PASS    | Evaluator untouched; GPS-only daily/count/distance filters and mixed-ledger concurrency test                                                |
| 25  | Mobile and desktop                                       | PASS    | Chromium desktop and 390 px phone layout; physical device not tested                                                                        |
| 26  | Responsive/accessibility                                 | PARTIAL | Keyboard, touch controls, reduced motion, text equivalents and axe pass; shared-machine contention and physical screen reader remain limits |
| 27  | Honest jury journey                                      | PARTIAL | Complete local account/DB journey passes; live Auth0 → Gemini → microphone combined journey blocked/unverified                              |
| 28  | Dedicated branch commit/push                             | PASS    | All implementation is on the dedicated branch; the verified remote SHA is supplied in the final delivery message. No main/Auth0 writes.     |

## Reproduction

Supply disposable URLs ending in `_test` to enable all database suites; without these, database tests explicitly skip and must not be described as tested:

```bash
IDENTITY_TEST_DATABASE_URL=postgres://.../flow_identity_test \
BUDDY_TEST_DATABASE_URL=postgres://.../flow_buddy_test \
BUDDY_INTEGRATION_DATABASE_URL=postgres://.../flow_buddy_integration_test pnpm test
pnpm typecheck
pnpm build
```

The standalone fixture browser server requires **both** `NODE_ENV=test` and `BUDDY_FIXTURES=1` and binds only `127.0.0.1:8788`. Start it with `pnpm -F backend exec tsx scripts/buddy-browser-server.ts`, then run `node scripts/test-buddy-browser.cjs` with Playwright/Chromium available. It has no live Gemini, Auth0 or durable wallet.

The actual-app account fixture server additionally requires `BUDDY_INTEGRATION_DATABASE_URL` ending in `_test`, binds `127.0.0.1:8791`, and writes its local signed-token fixture to a private file (`BUDDY_FIXTURE_FILE`, default `/workspace/work/buddy-account-fixture.json`). Run `backend/scripts/buddy-account-browser-server.ts`, start Vite with the existing public Auth0 SPA values supplied via environment, then `scripts/test-buddy-account-browser.cjs` (`BUDDY_ACCOUNT_URL` selects the Vite origin). It intercepts the Auth0 SDK only in the test browser, uses local RS256 tokens and real account/ledger handlers, and clearly labels AI responses and screenshots synthetic. Its reset endpoints exist only in these isolated fixture servers, never in the production router.

`BUDDY_AXE_MODULE` can point to an installed `@axe-core/playwright` module to enable the optional automated accessibility check. Test tools are not added to the production dependency graph. The original navigation-agent configuration is not changed. No fixture code or private token file is imported by production startup.

## Release decision

The source is ready for review and controlled integration with the confirmed Auth0 ancestor. It is **not an externally verified production launch**. Before demonstrating a real user journey: configure a durable PostgreSQL service and apply migrations, reach the Auth0 issuer/JWKS over trusted TLS, complete a real login and return to `/buddy`, repeat reward/purchase/reload under that actual account, verify a supported physical microphone flow and navigation arbitration, and publish the operator/privacy/backup information required by the host project. Do not bypass authentication to demonstrate Gemini.

## Production chunks

| Artifact                     |  Bytes | Gzip bytes |
| ---------------------------- | -----: | ---------: |
| `BuddyDiscovery-Bxr6_UPQ.js` |  1,398 |        806 |
| `BuddyRoute-Cim6mK-G.js`     | 30,336 |     11,112 |
| `audio-QAKWT_xp.js`          |  2,021 |      1,071 |
| `buddy-CYAmDUYL.js`          | 11,993 |      4,272 |
| `buddy-Ci-460ko.css`         | 27,749 |      5,654 |

These are separate private feature chunks. The build retains the host application's large map/voice chunks and Auth0-bearing entry; its existing >500 kB advisory remains. Buddy chunks are excluded from public service-worker preinstallation. No new 3D or animation dependency was added.

## Browser captures

See [labeled test evidence](screenshots/flow-buddy/README.md). These captures distinguish synthetic identity/AI from real PostgreSQL persistence and the existing FLOW journal.

## Changed-file manifest

Exact files relative to confirmed Auth0 baseline `8fba1c8`. The parallel contract is inherited unchanged from the original Buddy base.

```text
README.md
backend/.env.example
backend/package.json
backend/scripts/buddy-account-browser-server.ts
backend/scripts/buddy-browser-server.ts
backend/scripts/migrate.ts
backend/src/config.ts
backend/src/features/buddy/buddy.test.ts
backend/src/features/buddy/economy.ts
backend/src/features/buddy/elevenSpeech.ts
backend/src/features/buddy/gemini.ts
backend/src/features/buddy/identity.integration.test.ts
backend/src/features/buddy/integration.ts
backend/src/features/buddy/missions.ts
backend/src/features/buddy/postgres.integration.test.ts
backend/src/features/buddy/postgres.ts
backend/src/features/buddy/router.ts
backend/src/features/buddy/schema.sql
backend/src/features/buddy/service.ts
backend/src/features/buddy/smoke.ts
backend/src/index.ts
backend/src/services/accountLifecycle.ts
backend/src/services/identityStore.ts
backend/src/services/motionStore.ts
backend/test/buddy/fixtures.ts
docs/flow-buddy-parallel-contract.md
docs/flow-buddy-verification.md
docs/flow-buddy.md
docs/screenshots/flow-buddy/README.md
docs/screenshots/flow-buddy/buddy-mint-wave-account-fixture.png
docs/screenshots/flow-buddy/buddy-persisted-account-fixture.png
docs/screenshots/flow-buddy/mobile-light-synthetic.png
docs/screenshots/flow-buddy/unified-wallet-fixture.png
frontend/buddy-harness.tsx
frontend/src/app/App.tsx
frontend/src/features/buddy/BuddyCity.tsx
frontend/src/features/buddy/BuddyDiscovery.tsx
frontend/src/features/buddy/BuddyIntroCard.tsx
frontend/src/features/buddy/BuddyProgressCard.tsx
frontend/src/features/buddy/BuddyRobot.tsx
frontend/src/features/buddy/BuddyRoute.tsx
frontend/src/features/buddy/BuddyScreen.tsx
frontend/src/features/buddy/accountClient.ts
frontend/src/features/buddy/animation.test.ts
frontend/src/features/buddy/animation.ts
frontend/src/features/buddy/audio.test.ts
frontend/src/features/buddy/audio.ts
frontend/src/features/buddy/buddy.css
frontend/src/features/buddy/client.ts
frontend/src/features/buddy/robot.css
frontend/src/features/identity/Passport.tsx
frontend/src/features/motion/MotionScreen.tsx
frontend/src/features/trust/PrivacyScreen.tsx
frontend/src/features/voice/speech.ts
pnpm-lock.yaml
pnpm-workspace.yaml
scripts/prepare-pwa.mjs
scripts/test-buddy-account-browser.cjs
scripts/test-buddy-browser.cjs
scripts/test-buddy-production-browser.cjs
shared/src/buddy/city.test.ts
shared/src/buddy/city.ts
shared/src/buddy/contracts.ts
shared/src/motion.ts
```
