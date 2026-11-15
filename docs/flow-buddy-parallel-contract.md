# FLOW Buddy — parallel-development integration contract

Status: integration contract only. This document is **not** an assertion that FLOW Buddy is implemented or connected.

## Source and branch isolation
- Buddy branch: `feature/flow-buddy-gemini`, created from `school-drop-off-zones` (already contains the verified FLOW Voice ancestor).
- Concurrent identity development: `feature/flow-identity-auth0` (draft PR #1). Do not merge it blindly or change it from this branch.
- Develop independent Buddy code under `frontend/src/features/buddy/**`, `backend/src/features/buddy/**`, `shared/src/buddy/**`, and Buddy-specific tests/docs.
- Do not modify shared integration touchpoints while the identity agent owns them: `frontend/src/app/App.tsx`, `frontend/src/app/AppShell.tsx`, `frontend/src/features/motion/MotionScreen.tsx`, `frontend/src/features/identity/**`, `backend/src/index.ts`, `backend/src/middleware/identity.ts`, `backend/src/services/identityStore.ts`, `backend/src/services/motionStore.ts`, `shared/src/identity.ts`. Instead document minimal integration patches and execute them only after an agreed, verified identity handoff.

## Buddy feature targets
- Authenticated-only dedicated route `/buddy`, discoverable from the existing protected `/challenges` page after integration.
- Original SVG/Rive-style *articulated* robot: moving eyes/face/mouth/head, blinking, arm wave, listening/thinking/talking/pointing/celebrating states; reduced-motion mode.
- Gemini-backed text chat and adaptive educational mission selection; real API requests from server-side `GEMINI_API_KEY` (key already present as a config variable but live access unverified).
- One lightweight deterministic Living Green City educational scenario with animated feedback; label all synthetic inputs/results.
- Reusable typed mission definitions, validated answers and bounded hints/explanations.
- Dedicated voice bridge compatible with existing navigation audio arbitration; do not modify the pinned navigation ElevenLabs agent. Actual bidirectional audio unverified until tested.
- Account-scoped persistent progress, educational rewards and cosmetics **integrated with the existing FLOW Coins economy**, not a separate balance.

## Adapter boundaries (implement as explicit injectable interfaces)
`BuddyIdentity`: verified subject+issuer, authenticated state, profile nickname when consented, logout/account-change event.

`BuddyWalletGateway`: server-authenticated load balance, grant eligible educational reward, check idempotency, atomic spend, list owned cosmetics; all rewards and purchases validated server-side.

`BuddyAIService`: bounded intent parsing and explanations; strict validated outputs; no authority to mutate wallet or account.

`BuddyMissionEngine`: deterministic authoritative missions, versioned keys, server-side evaluation, explicit rewards; generic chat cannot earn spendable coins.

`BuddyAudioBridge`: explicit user initiated voice; no overlap with navigation audio; cleanup on unmount/logout; verified real conversation required before marking pass.

## Security rule
Until the Auth0 merge is validated, **do not register or expose production Buddy Gemini/coins APIs publicly**. Build/test core services with injected authenticated-identity fixtures in test-only harnesses; keep production authorization fail-closed. Do not use a public anonymous API or an unauthenticated client-side Gemini key as a temporary shortcut. No localStorage coins or fake successful purchases.

## Parallel work stages
A. Start now, without touching Auth0-owned files: robot animation component, styling, BuddyScreen component, chat state, Gemini service, vetted mission templates, city simulator and visualization, adapters, tests.
B. Build safe integrations behind Buddy-specific service interfaces: typed account/progress ledger API contracts, real Gemini smoke test through a secure developer-only test, reward validator and cosmetics domain logic.
C. After Auth0 agent hands over a stable tested commit/PR: branch from the verified integrated ancestor or merge selectively with conflict review, register `/buddy` through the existing protected-route gateway, add one card to `/challenges`, connect verified Auth0 JWT to every Buddy API, implement PostgreSQL row-locked idempotent unified wallet integration, verify real login/rewards/voice.
D. Run repository typechecks/tests/build, local browser end-to-end, Gemini live API, wallet concurrency, voice only if live SDK transport works; report PASS/PARTIAL/BLOCKED honestly.

## Completion gates
- No Buddy files in the Auth0 agent branch before integration handoff.
- No changes to `main` from Buddy branch.
- No backend API that credits rewards without verified identity and deterministic completion.
- No synthetic scenario presented as live traffic or CO2 measurements.
- Do not mark Gemini, Auth0, spending or speech as live verified without an actual successful test.
- Prioritize the complete jury path: authenticated open -> animated robot waves -> Gemini text chat -> Living Green City choice -> authoritative evaluation -> verified reward -> persistent cosmetic unlock.
