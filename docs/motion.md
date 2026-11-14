# VLAIQ MOTION

Motion is an additive, lazy-loaded `/motion` section. Explore, destination search,
SmartMatch, official Timpark data and navigation remain accessible at `/` and `/navigation`.
No new runtime dependencies or external assets are required. The original FLOW Coin is
SVG artwork with metallic relief, engraving, CSS perspective, idle movement and a
reflection. It renders without WebGL. The existing system font stack is retained.

## Start and demonstrate

From the repository root, with Node and the pinned pnpm:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

The prepared cloud uses `PATH=/workspace/.tools/node_modules/.bin:$PATH` and
`NODE_USE_ENV_PROXY=1 pnpm dev` (Node 24 proxy support). Backend: 8787; frontend: 5173.
Use the **Motion** link on Explore. A phone needs HTTPS; an HTTP LAN address does not
enable browser geolocation. Serve frontend and `/api/motion` through the same origin
so the HttpOnly cookie is available; this prototype is not a cross-site identity SDK.

1. Choose walking, running or cycling and press **Începe activitatea**.
2. Grant browser location access. No location permission is requested on page load.
3. Keep the app visible and move at a safe pace. Provisional distance comes from
   filtered GPS observations. The trace is explicitly an observation trace, not roads.
4. Optional sensors can be enabled by an additional user gesture. They never add distance.
5. Pause/resume as needed. Hiding the app pauses tracking; background tracking is not promised.
6. End the activity. The server evaluates its observations and clock bounds, then writes
   any allowed reward exactly once. The completion screen reveals the exact award,
   moves the coin toward the wallet counter, and settles the counter after 1.8 seconds.
   The animation is skippable and reduced-motion users receive an immediate update.
7. Inspect the wallet history. Cancelling instead of finishing cannot grant coins.

For a reproducible visual backup, choose **Explorează experiența DEMO**. It explicitly
generates synthetic, accelerated observations at 20×, never submits them to the server,
and keeps its coins in a separate in-memory DEMO balance. After about eight seconds
of the walking demo, finish to show the reward reveal, then open the wallet. Refreshing
clears this demo balance. It never contributes to the server wallet or League preview.

## Eligibility and limits

`shared/src/motion.ts` holds deterministic, configurable product rules:

- At least six accurate samples, 90 seconds of valid intervals, and 80 m displacement.
- Minimum accepted GPS distance: 150 m walking/running; 300 m cycling.
- Samples with accuracy worse than 35 m are excluded. Jitter within uncertainty is
  ignored. Non-increasing timestamps, gaps over 25 seconds, segment breaks and
  implausible speeds never create distance. At most 20% discarded observations for eligibility.
- Mode speed ceilings: 3.2 m/s walk, 7 m/s run, 16 m/s cycle. Speed is a rejection
  guard, never a reward multiplier. These are prototype policy choices, not scientific
  recognition of activity modes or proof that a cyclist was not in a slow car.
- Ten coins for eligibility, plus five per complete 250 accepted metres; at most
  40 per session and 80 per Bucharest calendar day, per browser wallet.
- The server checks its own session start time and submitted timestamp bounds.
  A quick click on Complete or a frontend timer cannot bypass the minimum server duration.

**Browser GPS is not attested.** A determined client can fabricate plausible observations,
clear a browser identity, or imitate cycling with a vehicle. The UI calls the outcome
“GPS evaluat · prototip”, not proof of physical activity. No carbon savings are inferred.
Do not use this prototype ledger for monetary rewards or a trusted public competition.

## Persistence, privacy and security

An opaque 256-bit HttpOnly, SameSite=Strict cookie identifies a browser wallet. The
server hashes it for storage. This is a pseudonymous prototype, not an authenticated,
recoverable cross-device account. Erasing the cookie loses access to that wallet.

`backend/.data/motion.json` is ignored by Git. It contains session IDs, ledger entries,
mode, assessed summary metrics and an evidence digest. **Raw GPS coordinates are not
persisted.** No GPS traces, aliases or routines are published to another participant.
The server controls coin amounts; the strict submission schema rejects coin overrides,
mode overrides and demo flags. Completion is idempotent by server activity ID. Request
origins are checked against the app host/configured CORS origins. Cookie responses use
`Cache-Control: no-store`; secure cookies are used on HTTPS.

The append-only reward ledger is written through atomic file replacement before the
in-memory state is committed. The directory and files use owner-only permissions.
**Erasure and retention.** `DELETE /api/motion/wallet` (the „Șterge portofelul” button in the Wallet)
removes the browser wallet from the file and clears the cookie. Wallets with no activity or
reward for `MOTION_RULES.retentionDays` (365) are purged when the store loads and on every
activity start. Both are stated on the privacy page (`/confidentialitate`).

Run one backend process against this file. Multi-process deployment, serverless ephemeral
disks, account recovery, abuse-resistant public rewards and backups require a transactional
database and proper authentication. Make the data directory persistent on a VM. A fresh
installation without that directory starts with empty wallets. Do not commit runtime data.

## Missions and League

The daily mission follows the same activity reward; it does not silently add another bonus.
Wallet history and seven-day charts use actual server transactions and show empty states
when none exist. The League screen is explicitly a **local preview**, opt-in and reversible,
with only the current browser shown. It excludes demo coins. There are no fabricated city
participants, live rankings, prizes, shop items or environmental impact numbers.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright \
MOTION_TEST_OUTPUT=/workspace/artifacts/motion \
MOTION_LIVE_TEST=1 node scripts/test-motion-browser.cjs
```

The optional `MOTION_LIVE_TEST=1` branch needs about 100 seconds. It sends controlled
browser GPS updates against the actual running server and real server clock, then checks
the award, wallet and duplicate submission. It is not a physical walk or ride.
Without this flag the script covers responsive widths, permission denial, absent sensor
API, stationary/short-session rejection, tampering rejection, demo isolation, pause/resume,
local League opt-in, reduced motion and GPS cleanup. Unit tests cover jump rejection,
caps, timestamp bounds, cancellations, cookie-owner separation and ledger persistence.

Physical Android/iOS GPS, iOS DeviceMotion permission, battery-policy wake locks and
performance on real phones still require device testing. `DeviceMotionEvent` is optional
and browser dependent; Web Geolocation and Wake Lock are used only where supported.

## Scope status

- **WORKING:** Motion home, GPS recording flow, filtering/evaluation, idempotent server
  ledger, wallet/history, coin SVG and reward animation, pause/cancel, isolated demo.
- **PARTIAL:** mode recognition/anti-cheat (browser input only), sensor assistance,
  physical-device support (not tested), daily mission and local League preview.
- **NOT IMPLEMENTED:** trusted public League, accounts/sync, purchases, team competition,
  Green Shop, AI missions, background tracking and quantified carbon savings.

Key files: `frontend/src/features/motion/`, `shared/src/motion.ts`,
`backend/src/routes/motion.ts`, `backend/src/services/motionStore.ts` and the tests beside them.
