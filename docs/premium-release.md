# Premium mobility integration · 13 November 2026

This change is prepared on `feature/premium-green-mobility` for review. It preserves the
team's parking presentation, municipal search and previous Motion/navigation work.
It does not assert a competition result, official adoption or deployment to a public domain.

## WORKING

- One responsive shell with four primary sections, a header wallet, overflow menu, deep links,
  back/forward, unknown-route recovery and preserved active Motion state across internal navigation.
- Forest Night / Mist Day, persisted preference, system default, semantic RGB tokens and reusable
  UI primitives. The existing system font stack is retained; no proprietary font was introduced.
- Explore sidebar/bottom sheet, real municipal destination search, explicit manual/GPS origin,
  progressive parking details and separate parking-versus-journey preferences.
- Unknown occupancy and unknown prices are kept distinct from available/free. A new regression
  guards against scoring an unknown price as a known free tariff even when tariff data is absent.
- Actual county polygon/mask, county camera guardrails, locality filtering and county-fit control.
  Natural Earth is public domain and generalized, with inspected metadata and checksum retained.
- A real-data local fallback map uses only committed municipal street/zone geometries. It is
  explicitly partial; it never manufactures a basemap, roads, route geometry or 3D buildings.
- Green Switch/Opportunity schemas, orchestration, cache and UI. Available routes can be selected
  and handed to Motion without granting rewards. Missing providers produce an unavailable state.
- Existing GPS plausibility checks, server-clock validation, append-only prototype reward ledger,
  duplicate prevention, wallet/history and isolated DEMO coins. The detailed SVG coin is preserved.
- FLOW City public coverage, aggregate exports and a capacity-respecting FLOW Balance simulation.
  Simulator outputs are calculated from explicitly synthetic inputs, not presented as real impact.
- Versioned public PWA shell, install affordance, app icons, public-asset cache and deep-link offline
  fallback. Updates do not forcibly reload an activity. Wallet/API/GPS data are excluded from cache.
- Same-origin production serving with deep-link refresh, plus a Caddy example for operator setup.

## PARTIAL / BLOCKED

- OpenFreeMap and external routing requests were blocked by the cloud network policy; the local
  map fallback was exercised instead. The app does not claim a real external route was fetched here.
- `ORS_API_KEY` is absent. ORS-backed actual walking/cycling routes and driving matrix totals need
  a configured provider. Its secret requirement was saved in cloud environment settings; no key
  value was requested in chat or committed. Provider-unavailable paths were verified.
- A Green Switch end-to-end browser test uses stamped synthetic route fixtures to test interaction,
  mode switching and handoff. It does not establish provider connectivity or street safety.
- Motion is a browser-bound single-process prototype ledger, not a cross-device financial account.
  Browser GPS can be forged; physical Android/iOS behavior and real user studies remain unverified.
- The League is an opt-in local preview. Real multi-user competition requires stronger identity
  and transactional storage. No citywide participants, GPS histories or public rankings are invented.
- The deadline/challenge details supplied by the team are distinguished from independent verification:
  fresh official-site reads returned 403. The project license remains the team's explicit decision.

## NOT IMPLEMENTED

Live parking occupancy, live traffic, transit routing/arrivals, safe-route certification, measured
carbon savings, Vision AI camera feeds, public team leagues, Green Shop and personalized AI coaching.
These do not appear as working controls or fabricated statistics.

## Verification actually completed

- `pnpm typecheck` passed for all workspaces.
- `pnpm test` passed **102 tests**: 56 shared, 30 backend, 16 frontend.
- `pnpm build` passed and generated a versioned public worker. MapLibre is split into a cacheable
  vendor chunk; its approximately 802 kB minified engine still produces Vite's large-chunk warning.
- `test-premium-browser.cjs` passed the unified shell, 360/390/430/768/1440 widths, theme persistence,
  actual county/local map and municipal search, explicit origin, fixture route-to-Motion handoff,
  activity preservation, wallet/League isolation, City/Data views and 404 recovery.
- `test-motion-browser.cjs` passed permission/sensor/error/reward/demo checks. With
  `MOTION_LIVE_TEST=1`, about 100 seconds of controlled browser GPS was evaluated against the actual
  server clock: 10 coins were granted once; repeat submission kept the same balance.
- `test-navigation-browser.cjs` passed actual MapLibre pitch/bearing and 2D/north-up controls,
  detach/recenter, demo pause/restart/arrival, GPS accuracy, rerouting cooldown and watcher cleanup,
  using explicitly synthetic route/map fixtures.
- `test-site-browser.cjs` passed WebGL-failure recovery and independent navigation loading.
- `test-pwa-browser.cjs` passed cache privacy, offline deep links and safe waiting updates.
- A fresh Chromium production smoke on a separate local port loaded `/` and `/data` directly,
  checked **23 public cache entries and zero API cache entries**, switched offline, opened the actual
  compiled `/motion`, and completed the separate +10-coin DEMO without uncaught exceptions.
- Production HTTP checks: home and `/motion` returned 200; an unknown `/api` route returned JSON 404.

No physical walk, phone installation or resident interview is claimed by these tests.
Screenshots in the execution workspace include Explore in five viewport sizes, actual parking data,
stamped Green Switch fixtures, both themes, Motion, City, Data Trust and navigation fixtures.

Run `pnpm dev` for development, or `pnpm build` followed by
`NODE_ENV=production pnpm -F backend start` behind HTTPS for the combined deployment.
See the README and `docs/jury-demo.md` for setup, configuration, handoff and demonstration steps.
