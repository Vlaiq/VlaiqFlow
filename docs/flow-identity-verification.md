# FLOW Identity — measured completion report

Verification date: 15 November 2026 (Europe/Bucharest). Repository: `Vlaiq/VlaiqFlow`.

The implementation is ready for code review and local demonstration. **It is not certified as an end-to-end live Auth0 release.** Auth0 metadata is now verified from a separate native Windows CI runtime; the cloud workspace still cannot reach the tenant. No real user email, Google session, passkey device, MFA enrollment, production database or contributor assignment was used to claim success.

## Windows acceptance mission: current result

Continued directly from `27220d6` on `feature/flow-identity-auth0`, preserving the original 631 tests. **648 unique tests now pass on both Linux and native Windows CI: 408 backend + 103 frontend + 130 shared + 7 operator tests.** Targeted reruns are not counted again. The PostgreSQL integration suite ran on both systems. Typecheck and production build pass on both; existing large-chunk warnings remain. Windows CI also passed actual launcher migration/startup, private API 401, IPC shutdown and both service ports becoming free.

Evidence: [full Windows regression run](https://github.com/Vlaiq/VlaiqFlow/actions/runs/43691548353), [Windows regression plus real Auth0 metadata](https://github.com/Vlaiq/VlaiqFlow/actions/runs/43691785665). Runner logs identify **Windows Server 2025**, Node **24.22.1**, pnpm **12.18.0**, Git **2.56.0.windows.4**, and native PostgreSQL **17.11**. Linux used PostgreSQL **17.12** and the same Node/pnpm. This is native Windows evidence, **not certification of Windows 10/11 interactive Ctrl+C, desktop TTY, Docker Desktop, browsers, NVDA, Windows Hello or microphone behavior**.

**PASS — actual Auth0 public metadata from Windows:** at 09:51:50 Europe/Bucharest, 15 November 2026, DNS resolved; default TLS verification stayed enabled; discovery and JWKS returned **200 through both Node fetch and Node HTTPS/JWT-library transport**. Exact issuer, JWKS location, RS256 metadata and RSA key structure were checked. No credentials were used. **This does not validate a user token, complete token exchange, or prove a user session.** Cloud Node still reports `EAI_AGAIN` plus `ERR_PROXY_TUNNEL`; curl records CONNECT 403/HTTP 000, and fresh Linux Chromium reports `ERR_TUNNEL_CONNECTION_FAILED`. The owner's Windows browser/runtime preflight remains a separate step.

Confirmed compatibility defects and fixes:

- Replaced child `spawn('pnpm')` with direct installed Node/tsx/Vite entry points and literal argument arrays. No `.cmd` shell interpolation; spaces and shell metacharacters are exercised natively on Windows.
- Added explicit local-database, PostgreSQL/schema privilege, IPv4/IPv6 port and HTTP readiness checks. The acceptance API/frontend bind loopback and the Vite API proxy explicitly uses IPv4. No volumes or account rows are deleted.
- Windows cleanup now targets owned active service process trees; POSIX cleanup covers descendant process groups. Startup failure stops the sibling. Native descendant cleanup and full launcher IPC shutdown pass; console Ctrl+C remains an owner check.
- An additional actual Linux check terminated the backend child: the launcher exited nonzero and both service ports closed. An unavailable PostgreSQL port produced a concise readiness failure without printing the URL or starting either service.
- Removed Unix token-file mode checks: they did not establish NTFS ACL privacy. The verifier now accepts bounded hidden interactive TTY input in memory, never files/arguments/pipes, and restores terminal state on completion/cancellation. Unit contracts pass on Windows; an actual Linux PTY paste also produced no echo or saved file. Desktop Windows TTY acceptance is pending.
- The first full Windows run exposed three existing transit **test-harness** failures. Python stdin now explicitly uses UTF-8; malicious backslash ZIP names are restored in raw fixture headers after Windows normalizes them. Existing parser behavior/security assertions remain unchanged. No tests were removed or weakened.

Fresh Linux Chromium checks pass: real SDK authorize/PKCE construction and running API 401; synthetic-identity profile edit/crop/reload, account switching, keyboard/menu, light/dark and 320/390/768/1440 widths; compiled public-shell/PWA/offline checks. Passport mobile dark and desktop light screenshots were inspected. Fresh axe scans of Passport, editor, Team and gateway report **zero violations**. These are local browser/fixture checks, not real accounts, physical-device testing or a screen-reader study. Existing reduced-motion rules are preserved; desktop assistive-technology acceptance remains pending.

Status vocabulary: **PASS** = real external service/device verified; **LOCAL PASS** = local implementation exercised; **AUTOMATED PASS** = executed automated tests; **BLOCKED** = external condition prevents acceptance; **FAIL** = observed failing behavior; **NOT TESTED** = no evidence. “Implemented” is independent of all verification columns. Windows below refers to Server CI unless explicitly marked desktop.

| Feature | Implemented | Automated | Real Auth0 | Windows | Blocker | Evidence |
|---|---|---|---|---|---|---|
| Signup | Official hosted PKCE flow | AUTOMATED PASS: request construction | BLOCKED: owned-account flow pending | NOT TESTED: desktop signup | Owner browser/account | Real SDK browser test; no token exchange |
| Login | Official SDK | AUTOMATED PASS: routing/PKCE | BLOCKED: real login pending | NOT TESTED: desktop login | Owner credentials entered privately | Public SDK test and gateway |
| Google | Existing hosted connection reported; no filter | AUTOMATED PASS: no forced connection | BLOCKED: provider consent/token exchange pending | NOT TESTED: desktop | Owned Google session/configuration | No visible-button success claim |
| Forgot password | Hosted recovery retained | NOT TESTED: delivery | BLOCKED: real mail/reset pending | NOT TESTED: desktop/mailbox | Owned database account/mailbox | Exact private steps in Windows guide |
| Email verification | Actual SDK claim displayed | LOCAL PASS: UI | BLOCKED: delivery/link/fresh claim pending | NOT TESTED: mailbox | Actual received message | Never inferred from “sent” |
| Passkey | Tenant configuration reported | NOT TESTED: physical enrollment | BLOCKED: real enrollment/login pending | NOT TESTED: Windows Hello/security key | Compatible physical device | No virtual authenticator used |
| MFA | Handoff says disabled | NOT TESTED | BLOCKED: entitlement/challenge/recovery pending | NOT TESTED | Admin plan/factor inspection | Passkey is not an MFA acceptance result |
| OIDC discovery/JWKS reachability | Explicit secure preflight | AUTOMATED PASS: metadata contracts | PASS: real endpoints/metadata over verified TLS | AUTOMATED PASS: both native Node transports | Owner browser/network still needs its own check | Windows Auth0 metadata job; no credentials |
| JWT signature | Production RS256 guard | AUTOMATED PASS: signature/JWKS negatives | BLOCKED: real-token validation pending | AUTOMATED PASS: local-key middleware | Fresh owned-account access token | Public key metadata alone is not signature acceptance |
| Issuer/audience | Server-enforced | AUTOMATED PASS: wrong issuer/audience rejected | BLOCKED: actual token claims pending | AUTOMATED PASS: middleware | Actual user token | No hand-decoding substitute |
| Logout | SDK logout + private-state cleanup | AUTOMATED PASS: fixture/browser | BLOCKED: real Auth0 cookie/logout pending | NOT TESTED: desktop session | Real browser session/two tabs | Synthetic browser contract |
| Protected routes | Gateway + private API guards | AUTOMATED PASS | BLOCKED: positive real-account access pending | AUTOMATED PASS: actual startup/private 401 | Real login for positive case | Launcher smoke + public browser |
| Profile persistence | PostgreSQL issuer+subject | AUTOMATED PASS: DB/reload | BLOCKED: real-account persistence pending | AUTOMATED PASS: actual PG integration | Owner save/restart/login | No fixture rows in real-account DB |
| Avatar persistence | Private processed DB bytes | AUTOMATED PASS: processing/crop/ownership | BLOCKED: real-photo/account test pending | AUTOMATED PASS: native sharp/PG; desktop NOT TESTED | Owned photo + browser | Geometric fixture crop, no invented photo |
| Wallet ownership | Account-row transactions/locks | AUTOMATED PASS: ownership/concurrency/caps | BLOCKED: real account/GPS pending | AUTOMATED PASS: PG/evaluator | Genuine eligible physical activity | No seeded earned coins |
| Account isolation | Issuer+subject and stale-response guards | AUTOMATED PASS: A/B fixture + DB | BLOCKED: two real accounts pending | AUTOMATED PASS: server isolation; desktop NOT TESTED | Owned A/B | No email linking |
| Contributor RBAC | Verified native permission + labeled fallback | AUTOMATED PASS: 401/403/200 | BLOCKED: real B assignment/native claim pending | AUTOMATED PASS: synthetic permission checks | Admin confirms intended B/plan | Fallback disabled in launcher |
| Voice personalization | Consented bounded context; generic first greeting | AUTOMATED PASS: opt-out/bounds/tools | BLOCKED: authenticated FLOW audio pending | NOT TESTED: WebRTC/microphone | Real account + microphone | Pin re-read unchanged; candidate named/empty provider PASS retained, omission FAIL/timeout |
| PWA | Public cache, API/callback exclusion | AUTOMATED PASS: build/compiled browser | NOT TESTED: authenticated standalone callback | AUTOMATED PASS: build; device NOT TESTED | Actual HTTPS/device | Offline public shell only |
| Accessibility | Existing accessible controls preserved | AUTOMATED PASS: fresh axe/keyboard | NOT TESTED: real hosted/device path | NOT TESTED: Windows screen reader | NVDA/device study | Four local axe routes: zero violations |
| Production readiness | Minimum deployment design audited; not deployed | AUTOMATED PASS: typecheck/build | BLOCKED: production live acceptance | AUTOMATED PASS: build; deployment NOT TESTED | HTTPS origins, durable DB/restore, Google/email/plan/operator configuration | Localhost build must not be deployed as-is |

The application acceptance DB remains empty of real accounts. No passwords, access tokens, subject IDs, mailbox links or private photos were collected for this report. Native tenant plan/RBAC/MFA entitlement was not inspected; supplied settings remain reported configuration. No real contributor assignment, SMTP change, paid upgrade, production deployment or voice promotion was made.

Operator instructions: [Windows PowerShell acceptance](flow-identity-windows-acceptance.md). It covers prerequisites, least-privileged local role, named-volume persistence, native PG alternative, both network preflights, real A/B acceptance, recovery/passkey/MFA gates, hidden terminal token input, troubleshooting and safe restart. Existing [live runbook](flow-identity-live-acceptance.md) retains the deployment audit and candidate details, with obsolete token-file commands removed.

### Defensible 90-second jury fallback now

The requested live login/profile/RBAC demonstration must wait for owner acceptance. Until then use only these verified capabilities:

- **0–15s:** public homepage and parking exploration; keep municipal snapshots/estimates labeled accurately.
- **15–30s:** open Motion and show the branded account gateway. Explain official Auth0 PKCE integration; do not pretend the gateway is a completed login.
- **30–45s:** show the Windows CI public Auth0 preflight: real issuer discovery and JWKS 200 over validated TLS. Say explicitly that this is metadata, not a user session.
- **45–60s:** run the missing-token API probe: real running app returns 401. Describe automated 403/200 tests as signed fixture tests, pending genuine A/B proof.
- **60–75s:** show the green Windows full suite/PG/startup/build evidence. Describe issuer+subject ownership and private avatar DB storage without showing a fake account as a real one.
- **75–85s:** state that FLOW Voice keeps its working generic greeting and that authenticated nickname/audio acceptance is still pending. No unverified audio demonstration.
- **85–90s:** “Auth0 doesn't just let users enter VLAIQ FLOW. It protects the identity behind every profile, every activity and every FLOW Coin.” Keep the real-account release gate visible.

After real A/B login, profile/photo/restart and token-probe checks pass, use the conditional live script in `flow-identity.md`. Include Google, passkey, email, MFA or voice only after that exact capability passes on the presentation device. A service outage fallback must never substitute synthetic authentication.

## Earlier live-acceptance pass (27220d6; historical evidence)

The existing feature branch and draft PR #1 were resumed at exactly `2a2adb00db25114536d406e4fc863ce0fee7f219`. No identity architecture, mobility feature or UI was rebuilt. The original **628 tests passed again** before changes. This pass adds three meaningful network-discovery/JWKS regressions; **631 tests now pass: 398 backend, 103 frontend, 130 shared**, with no skipped PostgreSQL integration suite. Typechecks now also include the backend acceptance/migration scripts. Workspace typecheck and the production build pass; existing large-chunk warnings remain.

| Evidence category | Result in this pass |
|---|---|
| Implemented | Existing account/profile/avatar/wallet/route guards preserved. Added `pnpm identity:acceptance` and `pnpm -F backend identity:verify-live`. The token-file input at that revision has now been replaced by hidden in-memory terminal input in the Windows mission |
| Tested locally | Real PG17 named volume and migration; 631 tests; real-SDK PKCE construction; profile edit/crop/reload/isolation with **synthetic** identity; compiled PWA/offline public shell; missing-token private APIs and team PATCH 401 with no-store; allowed CORS origin receives ACAO, unlisted origin does not |
| Verified against real Auth0 | **None.** Discovery and JWKS each fail with curl error 56, `CONNECT tunnel failed, response 403`, HTTP result `000`. The environment's enforced allowlist omits the tenant. This is a proxy rejection before an Auth0 response, not evidence of invalid tenant configuration |
| Verified against real ElevenLabs | Isolated greeting candidate saved and read back; only greeting/placeholder differ from the immutable production pin; named and explicit-empty signed WebSocket sessions return expected text and PCM audio. Omitted-variable test times out, so candidate is not promotion-ready. Main retains 100% automatic traffic, candidate 0%; production app pin unchanged |
| Requires manual testing | Two owned real accounts; signup/login/Google; callback/refresh/logout; real profile/photo persistence and isolation; received verification/reset email and new/old password behavior; physical passkey enrollment/login; authenticated FLOW WebRTC/audio/tools; independent MFA challenge/recovery |
| Blocked by external configuration | Auth0 tenant egress and management access; actual native RBAC/plan/MFA entitlement inspection and intended contributor assignment; production DB/HTTPS origin/allowlists, email/Google production settings and device acceptance |

An independent fresh headless Chromium issuer navigation also failed with `net::ERR_TUNNEL_CONNECTION_FAILED`. No authorize request was completed and no token was obtained.

The local acceptance database `flow_identity` has zero account rows; synthetic users are confined to `flow_identity_test`. No legitimate accounts or real tokens were fabricated. No production deployment, Auth0 tenant change, paid upgrade, role assignment or MFA enrollment was performed.

**Exact browser steps, hidden local token instructions, expected 401/403/200 results, the HTTPS deployment audit and a verified-capabilities-only 60-second jury rehearsal:** [live acceptance runbook](flow-identity-live-acceptance.md). The earlier 90-second live script remains conditional on those real-account gates. Keep the PR in draft while they are open.

Acceptance additions: `scripts/start-identity-acceptance.mjs`, `backend/scripts/verify-live-identity.ts`, `backend/src/middleware/identity.jwks.test.ts`, and `docs/flow-identity-live-acceptance.md`. Package scripts, backend script typechecking and both original identity documents were updated. The original implementation manifest below is retained for review.

## Original implementation evidence (retained; reruns above)

- Backend full suite: **395 passed**, 26 files, including real PostgreSQL integration with locally signed RS256 JWTs. Final full run: 41.71 seconds.
- Frontend full suite: **103 passed**, 16 files. Final full run: 18.92 seconds.
- Shared full suite: **130 passed**, 13 files. Total unique automated tests exercised: **628**. Selective reruns are not added to that total.
- TypeScript: backend, frontend and shared all passed.
- Production build: TypeScript, Vite and PWA preparation passed. 31 public assets were included in the shell. Vite still reports large existing map/voice/application chunks; this is a performance warning, not a failed build. Passport and Team are lazy-loaded.
- Real SDK browser test: public homepage, legal/help/team access, protected routes, real Auth0 SDK login/signup request construction with PKCE S256, correct audience/client/callback/Romanian locale and no forced social connection passed. Authorize navigation was intercepted after construction; no hosted login or token exchange was performed by this automated check.
- Real running application private endpoints `/api/me`, `/api/motion/wallet` and `/api/flow-voice/session` returned **401** without tokens.
- Signed-token/PostgreSQL integration verified invalid signature, wrong issuer, wrong audience, expired token, missing token, non-user machine token, strict ownership, profile persistence across independent DB connections, image decoding/re-encoding/metadata stripping, avatar isolation, 401/403/200 team permissions, concurrent reward idempotency, no raw GPS storage, strict rejection of client coin/role/user IDs, and data erasure isolation.
- Browser contract with a **synthetic Auth0 SDK and a local RS256 issuer**, using actual PostgreSQL and production route handlers: nickname/biography/preferences save and reload; real crop/upload/reload; unsaved edit cancellation; account-menu keyboard/Escape/focus; safe callback destinations and query/hash preservation; actual API 401 session-expiry gateway; account-switch isolation; contributor editing; logout/signup passed. This does not prove Auth0 token exchange or a physical GPS/voice session.
- Responsive browser checks: 320, 390, 768 and 1440 pixels; light and dark; horizontal overflow and mobile account-menu bounds passed. Fresh mobile screenshots were also inspected. This is browser viewport testing, not a physical phone, font-scaling or device-biometric certification.
- axe-core WCAG 2 A/AA and 2.1 AA scans of Passport, editor, Team and authentication gateway at mobile width: **zero violations in the final scan**. Review found and fixed an unnamed mobile login icon, low-contrast mint links and active navigation text. Keyboard tests also passed. This is not a full screen-reader user study.
- Compiled production server on a local preview port: public homepage, protected deep link, service-worker registration, static-only cache, no API cache, and offline public shell passed. Preview port was deliberately not claimed as an allowed Auth0 callback; the build uses the supplied localhost:5173 configuration.
- Build contents were searched: the synthetic SDK, fixture identities and local test issuer are absent from production assets. Ignored `.env` files were confirmed excluded by Git. `git diff --check` passed.

## Completion table

“Live Verified” distinguishes real external identity/device exercise from local browser and database evidence. **No external identity flow is marked verified.**

| Feature | Implemented | Automated Tests | Live Verified | Remaining Blockers |
|---|---|---|---|---|
| Public homepage + protected-route gateway | Yes | Unit + real-SDK browser | Local browser only | External Auth0 redirect completion |
| Login / signup / safe return path | Yes, official SDK PKCE | Real request construction + synthetic callback routing | No real token exchange | Tenant network access and owned account |
| Logout / expiry / cross-account cleanup | Yes | Browser + stale-response unit checks | Synthetic identity only | Real Auth0 logout/session recovery acceptance |
| Romanian account header + accessible menu | Yes | Keyboard, focus, viewport bounds, axe | Local browser | Physical-device/screen-reader acceptance |
| Name / nickname / biography persistence | Yes, PostgreSQL | Real DB connections + browser reload | Synthetic identity only | Production DB and real account/device acceptance |
| Avatar preview / crop / zoom / drag / removal | Yes, private DB bytes | Actual crop/upload, decoding, invalid input, metadata, isolation | Synthetic identity + geometric image only | Real authorized photo/device acceptance |
| FLOW Passport / empty states / milestones | Yes, actual summaries | Real handler + browser checks | Synthetic identity only | Genuine outdoor eligible activity acceptance |
| Account wallet / concurrent rewards | Yes, row-locked PostgreSQL | Isolation, duplicate prevention, existing caps/evaluator | No genuine new GPS activity | Production DB and physical GPS acceptance |
| Guest wallet import | No; old file retained | Not claimed | No | Optional receipt-based confirmed migration not implemented |
| Motion DEMO separation | Preserved | Existing Motion tests + real ledger tests | No new physical session | Rehearse account demo after real login |
| Voice preferred-name context + opt-out | Partial: supported consented contextual update | Bounded-name/opt-out and existing voice-tool suites | No authenticated audio session | Real audio test; pinned initial greeting stays generic |
| Contributor team editing | Yes, server permission enforcement | HTTP 401/403/200 + browser controls | No real assigned contributor | Existing Auth0 role needs an authorized real assignment |
| Application-managed contributor fallback | Yes, opt-in backend exact identity grants | Issuer/subject and source-label unit checks | No grants configured | Operator enables only if needed; label remains distinct from Auth0 RBAC |
| Meet Team VLAIQ | Yes, truthful branded placeholder | Browser, axe, permission UI | Local browser only | Real team photo, names and responsibilities not supplied |
| Google sign-in | Hosted flow retained; no connection filter | Redirect construction only | No | Tenant reachability, real account, production OAuth credentials |
| Password recovery + verification emails | Auth0 hosted recovery retained | No delivery test claimed | No | SMTP/provider configuration and owned mailbox flow |
| Passkey | Existing official experience preserved | No enrollment/login test claimed | No | Compatible real device and tenant access |
| MFA / plan inspection | No new factor configured | Not claimed | No | Management access, actual entitlement, enrollment/recovery/challenge |
| Tenant branding | Existing tenant untouched; app surrounding UI polished | App visual checks | No remote tenant change | Management access if further supported branding is desired |
| Privacy + FLOW data deletion | Yes, explicit Auth0 identity distinction | Owned erasure/isolation + browser labels | Local API only | Publish operator/contact and backup-retention policy; Auth0 identity deletion is operator-managed |
| PWA + production build | Yes, preserved and callback-safe | Compiled browser, offline shell/cache checks | Local production-mode server | Actual HTTPS deployment and origin allowlists |

## External limitations observed

A real Chromium navigation toward the supplied Auth0 host failed with `ERR_TUNNEL_CONNECTION_FAILED`. The issuer discovery request returned HTTP 403. The shared-browser tool also could not open requested pages. These are current environment limitations; they do not prove a tenant outage, bot block, wrong password or invalid tenant settings. An authenticated Auth0 management connection/CLI was not available, so active plan, native role assignments, MFA entitlement and delivery logs could not be inspected.

The original pinned ElevenLabs agent disables first-message overrides and defines no nickname placeholder. Its pinned version and security settings remain unchanged; application code uses bounded, consented, data-only contextual updates. The final pass staged and provider-tested a separate candidate, documented above and in the live runbook. A personalized production first greeting and a new live Auth0-authenticated voice conversation are not claimed.

Auth0 tenant configuration described in the supplied handoff (Google, database signup, verification/reset templates, Identifier First, Passkeys, Romanian localization, branding, API permissions and role) remains **reported configuration**, not newly verified evidence. The handoff reports MFA disabled, development Google credentials and the development email provider. No plan was purchased and no OTP connection was enabled.

## Architecture, configuration and release instructions

The complete implementation audit, route map, schema/storage/wallet design, consented ElevenLabs behavior, permission and fallback design, recovery/Passkey/MFA status, production SMTP fields, deployment instructions, manual acceptance steps and precise conditional 90-second jury script are in `docs/flow-identity.md`.

The current local database is PostgreSQL 17 in named Docker volume `flow-identity-postgres-data`, bound only to 127.0.0.1:5432. Migration was applied to `flow_identity`; disposable tests use `flow_identity_test`. Test databases end in `_test` and fixture servers refuse other names. Production requires a separately provisioned durable PostgreSQL service, configured HTTPS origins, actual Google/email provider credentials where applicable, verified tenant features, a real team image/member list, and the privacy operator/contact. There is no localStorage substitute for account persistence and no production auth bypass.

Legacy anonymous wallet data was not destroyed or automatically reassigned. This version does not expose a guest-import action. Existing browser-only parked-car/favorite shortcuts remain device data and are cleared on logout; they are not represented as cross-device profile fields.

## Files and branch

See the changed-file manifest below. The integration baseline is `f036822190c3b7009e8a5a792355bea290344450`; the branch is `feature/flow-identity-auth0`. The delivery commit and patch identify the final implementation. No direct push to main or production deployment was performed.

```text
README.md
backend/.env.example
backend/package.json
backend/scripts/identity-browser-server.ts
backend/scripts/migrate.ts
backend/src/config.ts
backend/src/index.ts
backend/src/middleware/identity.test.ts
backend/src/middleware/identity.ts
backend/src/routes/flowVoice.ts
backend/src/routes/identity.integration.test.ts
backend/src/routes/identity.ts
backend/src/routes/motion.ts
backend/src/services/identityStore.ts
backend/src/services/motionStore.ts
database/migrations/001_flow_identity.sql
docs/flow-identity-verification.md
docs/flow-identity.md
docs/third-party.md
frontend/.env.example
frontend/identity-auth0-mock.tsx
frontend/package.json
frontend/public/service-worker.js
frontend/src/app/App.tsx
frontend/src/app/AppShell.tsx
frontend/src/app/router.tsx
frontend/src/features/identity/AccountMenu.tsx
frontend/src/features/identity/AuthGateway.tsx
frontend/src/features/identity/AvatarCropper.tsx
frontend/src/features/identity/IdentityProvider.tsx
frontend/src/features/identity/Passport.tsx
frontend/src/features/identity/TeamPage.tsx
frontend/src/features/identity/identity.css
frontend/src/features/identity/identity.test.ts
frontend/src/features/identity/privateApi.ts
frontend/src/features/identity/redirects.ts
frontend/src/features/motion/MotionScreen.tsx
frontend/src/features/motion/motionApi.ts
frontend/src/features/trust/PrivacyScreen.tsx
frontend/src/features/voice/FlowVoice.tsx
frontend/src/features/voice/speech.ts
frontend/src/main.tsx
pnpm-lock.yaml
pnpm-workspace.yaml
scripts/test-identity-accessibility.cjs
scripts/test-identity-browser.cjs
scripts/test-identity-production-browser.cjs
scripts/test-identity-public-browser.cjs
shared/src/brand.ts
shared/src/identity.ts
```
