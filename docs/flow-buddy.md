# FLOW Buddy

FLOW Buddy is an authenticated Romanian-first mobility learning companion: an articulated original SVG robot, Gemini text conversation, six versioned lessons, a deterministic educational city and cosmetic customization using the existing FLOW wallet. English questions are supported. The public Explore page has no Buddy chat.

## Baseline and identity handoff

- Buddy base: `54ca27e1b3a0a65fa3780ce655613a33d2bedd7a`, on the existing `feature/flow-buddy-gemini` branch, descending from `f036822190c3b7009e8a5a792355bea290344450` (`school-drop-off-zones`).
- Original workspace `work` at `bcbeb88` was clean and preserved. The existing remote Buddy branch was fetched and checked out; no replacement remote branch was created.
- All six branches named in the brief were enumerated and their current commits inspected.
- Independent implementation checkpoint: `867d779`.
- The user explicitly confirmed `8fba1c8799758ead0a6e51990837ea362c364653` as the stable Auth0 handoff. It was first validated in a detached worktree, including its PostgreSQL and RS256 tests, then merged into Buddy at `3f99e38`. The sole merge conflict was the dependency lockfile, reconciled by pnpm from both package manifests.
- Later Auth0 commits were observed but were not silently substituted for the agreed handoff. No commit or push was made to the Auth0 branch or main. The parallel contract is preserved unchanged.

See [verification and release gates](flow-buddy-verification.md) for actual evidence and limitations.

## Product journey

`/challenges` remains the existing protected Motion page, with a lazy-loaded Buddy introduction above its missions. The CTA opens `/buddy`. The existing AuthGateway and validated return-path logic protect the route. An account change remounts the session and clears chat, requests, previews and audio. Passport shows account-owned educational history; the wallet displays physical rewards, lessons and cosmetic debits distinctly.

The desktop screen places Buddy and genuine progress beside the conversation. The educational city expands below, with a second compact synchronized character next to an active mission. On phones the stage becomes compact and controls stack vertically. A city choice points the compact character toward the visible city. Before/after switches compare the baseline against the server-evaluated strategy. The interface supports both existing themes, keyboard controls, text alternatives, reduced motion and touch controls.

## Character and controller

`BuddyRobot.tsx` is original vector artwork inspired by the user's white/mint robot references. It has a rounded white casing, glossy dark display, green eye geometry, individual pupils/highlights, brows, several mouth shapes, movable head, neck, torso, visible fingers, articulated shoulder/elbow/wrist groups on both arms, knees, feet, antenna and chest light. Per-instance SVG IDs prevent collisions between the full and compact rigs.

`animation.ts` owns a single reducer and idle scheduler. It prioritizes celebration, actual assistant playback, listening, thinking and ordinary gestures in that order. Generation numbers reject stale gesture endings. Finite CSS timeline events return gestures to idle. The arm wave separately rotates shoulder, elbow and wrist; celebration lifts both arms outside the head, with a brief bounce and particles. Idle blinking has irregular intervals and occasional double blinks; gaze changes are restrained. The reducer also exposes curious, explaining, pointing, happy, encouraging and sleeping poses. Sleeping is an available pose, not a claimed automatic inactivity feature.

CSS interpolates animation; React does not render on every animation frame. The memoized rig has a stable completion callback, and the city calculation and SVG are memoized independently from typing. Reduced motion retains state feedback and static expressive poses while suppressing loops and travel. Mouth motion occurs only during player playback callbacks. It is a stylized open/close animation, **not** amplitude analysis or phoneme synchronization.

## Gemini

The backend uses official `@google/genai`. `BUDDY_GEMINI_MODEL` defaults to `gemini-3.5-flash`, which was returned by the actual project's model listing and successfully answered an unscripted Romanian energy question. A listed `gemini-2.5-flash` returned 404 on generation; that failed attempt is recorded, not hidden. Model availability is account/provider dependent: rerun the bounded CLI smoke check after provisioning or changing the model.

Only a trimmed question (maximum 1,200 characters), eight bounded recent messages and minimal application-owned learning context reach Gemini. No profile, nickname, email, wallet amount or GPS trace is sent. The response is bounded to 900 output tokens and 1,800 text characters, validated through a strict Zod action union. No HTML/code executes. Invalid provider output produces an unavailable state; no scripted production fallback is presented as Gemini.

Allowed actions: answer, start a known mission, hint, change difficulty, explain a result, next mission, show progress/city, open workshop, or propose a navigation handoff. Difficulty changes reissue an active mission with a new instance. Navigation requires a second explicit user action and only opens the existing planner. The model cannot issue credits, complete lessons, set prices, purchase, start GPS or query arbitrary data.

Server conversation context is in memory, expires after 30 minutes of inactivity, and is swept every minute. The browser attempts an authenticated session-end request on exit; expiry also covers failed cleanup. History is not persisted in PostgreSQL. Account erasure also clears the process-local Buddy session through the host account lifecycle hook. Shared session/erasure propagation is a prerequisite for a multi-instance conversation deployment. Multi-instance deployments currently require sticky routing for a continuing conversation/issued mission; a restart requires restarting a mission. Durable progress and receipt idempotency do not depend on that memory.

## Missions and city

`MissionEngine` owns answer keys and evaluation on the server. Public definitions contain a UUID instance, stable mission ID, version, difficulty, question, options and optional controlled city parameters. Issued instances are bound to the verified account's server session. Forged options, stale instances, unexpected body fields and another account's instance are rejected.

The six lessons cover city balancing, short green routes, honest parking recommendations, regenerative braking, time constraints and electric-vehicle misconceptions. Beginner lessons have two options; intermediate lessons add a third. The advanced city objective includes a virtual transit alternative and a different explicitly stated constraint. Replaying a lesson is safe. Hints and explanations never grant money.

The city reuses `makeBalanceScenario` / `simulateFlowBalance`, rather than creating a competing allocator. Its fixed scenario has 30 people, 36 virtual parking spaces and seed 7. Nearest minimizes driving; balanced minimizes driving + walking + `8 × occupancy fraction`. Transit moves 12 people to an assumed available virtual bus and allocates the other 18. Bus travel time is intentionally unmodeled; displayed drive/walk averages cover only parked drivers. No real traffic, live occupancy or CO₂ savings are claimed. A screen-reader description and numerical summaries explain the scene without relying on animation or color.

The stylized SVG contains a bounded street network, buildings, trees, parking, a person, cyclist, optional bus and at most 30 vehicle nodes. Server-result allocation counts change vehicle destinations with CSS transitions. This is an educational visual allocation, not traffic physics or verified routing.

## Wallet, PostgreSQL and cosmetics

There is **one** currency and balance: the existing `flow_accounts.wallet` and `MotionStore` journal. `EducationTransaction` and `CosmeticTransaction` extend its transaction union alongside the original GPS transaction; no negative fake activity is created. Lifetime earnings sum positive credits. Motion distance, duration, activity counts and the unchanged daily 80-coin cap filter only GPS transactions.

`PostgresBuddyUnitOfWork` begins a transaction, locks the same account row with `SELECT ... FOR UPDATE`, loads Buddy state, runs the deterministic economy operation, inserts unique SQL receipts, updates the shared wallet and Buddy state, then commits. Failure rolls back all of them. `flow_buddy_receipts` has a primary key on verified issuer + subject + idempotency key and source/amount checks. Progress and receipts have foreign keys with account-deletion cascade. SQL is parameterized. No account ID or amount from the client selects ownership or rewards.

Policy: 5 FLOW Coins once per mission ID/version for the lifetime of the account, at most 20 educational coins per UTC day. Completing a lesson after the cap still saves learning progress, without a later backdated award. Motion's separate Bucharest-day policy and GPS evaluator are unchanged. Chat, hints, planning and selecting routes never earn coins. A wallet erasure does not reset completed lesson eligibility or cosmetic ownership. Full FLOW-account deletion removes them through the foreign key.

The six-item catalog includes free mint, ocean/sunrise colors at 15, and leaf antenna/star badge/pulse light at 10 coins. The server owns prices. Preview is explicitly unsaved and costs nothing. Purchase requires confirmation and an atomic debit; equip requires ownership and persists separately. The UI refreshes the global wallet only after server confirmation and shows the existing FLOW Coin artwork after a committed reward. In-memory test fixtures label their economy synthetic and disable purchase in the UI.

Learning levels are derived from actual distinct completions: Green Beginner, Eco Explorer (2), Mobility Thinker (4), City Strategist (6). Correct-answer runs influence suggested difficulty; an incorrect answer simplifies the next suggestion. This is educational adaptation, not psychological profiling.

## Voice

Buddy uses an optional **push-to-talk pipeline**, separate from the pinned FLOW Voice navigation agent: browser speech recognition → editable text → Gemini → explicitly requested ElevenLabs TTS. The user confirms sending the transcript and explicitly presses Listen for a reply. It is not a hands-free ElevenLabs conversational agent. The navigation agent's prompt, tools, pinned version and recording settings were not changed.

`BuddyAudioBridge` is lazy-loaded, never starts on entry and supports stop/error/dispose. The existing navigation conversation gate arbitrates playback; navigation can stop Buddy and stale output never resumes. Browser recognition is feature-detected and requires a secure context. The browser/provider may process speech remotely; FLOW stores no recording. Server TTS accepts only the last validated assistant turn for the verified account, requires the profile's existing voice-consent setting, and is limited to six requests/minute. Audio objects and blob URLs are released on stop, error, exit and account change.

Actual ElevenLabs TTS returned a 28,464-byte clip. Real microphone recognition, device permissions and a full two-way conversation were **not** verified. Synthetic lifecycle tests prove cancellation and playback-state handling only. Text remains available when voice is unavailable.

## Security and deployment

Every `/api/buddy/**` operation is behind the reviewed `jwtGuard` and `requireIdentity`: RS256, configured issuer/audience, expiry validation and consumer subject checks. Missing JWT integration fails closed. Anonymous requests to the actual mounted state/chat/answer/purchase/speech routes returned 401 and `no-store`. A missing PostgreSQL URL/migration or Gemini key fails visibly, without localStorage, demo credit or public AI fallback.

Request rates per verified identity: 120 operations/minute overall, 12 chat generations/minute and six TTS requests/minute. Gemini generation is abortable and limited to 15 seconds; TTS is bounded to 12 seconds and two MB, with no automatic retries. CORS and the host API safety limits are retained. In-memory rate limits and sessions are per replica; larger deployments need a shared provider budget and shared session storage/sticky routing.

Provision server-side `DATABASE_URL`, `GEMINI_API_KEY`, optional `ELEVENLABS_API_KEY`, and the existing Auth0 issuer/audience. Browser Auth0 configuration contains only the SPA's public domain/client ID/audience. `BUDDY_GEMINI_MODEL` and `BUDDY_VOICE_ID` are optional server settings. No secret or live token is committed, logged or bundled for the browser. The privacy page describes Buddy's provider processing and stored data. Provider data policies and the operator's unresolved privacy-contact/backup-retention obligations remain deployment prerequisites.

Apply migrations explicitly:

```bash
pnpm install --frozen-lockfile
pnpm -F backend db:migrate
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

`db:migrate` now applies the existing identity migration and Buddy's additive progress/receipt schema. Use a durable PostgreSQL service and backups for real accounts. The disposable Docker database used in verification is not a production database. Configure HTTPS, real Auth0 callback/logout/web origins and CORS for the deployed origin. No tenant setting, production voice pin or public deployment was changed by this feature.

Developer-only live provider check, run from backend with server secrets supplied by the environment:

```bash
pnpm exec tsx src/features/buddy/smoke.ts
# Optional bounded TTS check:
BUDDY_SMOKE_VOICE=1 BUDDY_VOICE_ID=EXAVITQu4vr4xnSDxMaL pnpm exec tsx src/features/buddy/smoke.ts
```

## Adapters and files

Typed boundaries in `shared/src/buddy/contracts.ts`: `BuddyIdentity`, `BuddyWalletGateway`, `BuddyAIService`, `BuddyMissionEngine`, `BuddyAudioBridge`, `BuddyProgressRepository`, `BuddyCosmeticsRepository`. Frontend account calls reuse the existing `privateFetch` generation/expiry handling. Backend composition is in `features/buddy/integration.ts`. Test identity/AI/wallet fixtures are isolated from production imports and server startup.

Main modules: `frontend/src/features/buddy/**`, `backend/src/features/buddy/**`, `shared/src/buddy/**`. Narrow post-handoff edits register the route/API, extend the existing journal, refresh wallet views, add Passport progress, apply migrations and update configuration/privacy. See the verification document for test commands, evidence, limitations and the complete acceptance table.

## Honest 60–90 second demonstration

With a working **real** Auth0 session, configured providers, migrations and a wallet:

1. Open Provocări; show that existing Motion missions remain. Enter Buddy and watch the articulated wave.
2. Ask an unfamiliar green mobility question. Confirm the reply is labeled Gemini only after the real response succeeds.
3. Start the city lesson, choose a policy, compare before/after and open the simulation assumptions.
4. Submit the correct policy; show the server-confirmed reward and the same wallet's educational transaction. A replay must not add coins.
5. With sufficient legitimately earned balance, preview, confirm a cosmetic purchase and equip it. Reload to show persistence. Open Passport for educational history.
6. Voice is optional: only demonstrate microphone → transcript → Gemini → spoken reply after a real device check. Otherwise say that TTS was verified and microphone conversation remains unverified.

The automated fallback uses conspicuously labeled synthetic identity/AI with real PostgreSQL and the existing journal. It must never be presented as external Auth0 or live Gemini end-to-end verification.
