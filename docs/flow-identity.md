# FLOW IDENTITY — implementation, evidence and release handoff

Your city. Your identity. Your journey.

Windows operators: [exact PowerShell setup and acceptance](flow-identity-windows-acceptance.md). The latest pass preserves the original 631 tests and adds operator/security coverage, direct Node startup, process-tree cleanup, connectivity diagnostics and hidden in-memory token entry. See `flow-identity-verification.md` for measured counts and Windows CI scope. No real account flow is implied by Windows CI or metadata checks.

**Final acceptance update:** the original 628 tests were preserved and rerun; three local discovery/JWKS tests bring the total to 631. Actual Auth0 access is still blocked before reaching the tenant. Use [the live acceptance runbook](flow-identity-live-acceptance.md) for the ready-to-run real-SDK launcher, owned-account browser steps, native 401/403/200 token probe, current voice candidate limitations, HTTPS audit and dependable jury fallback. The production voice pin remains unchanged. This document's original implementation evidence and conditional live script remain below.

## Repository audit and selected baseline

The supplied clean workspace was `work` at `bcbeb88`, without an Auth0 implementation or installed SDK. Remote branches were enumerated using GitHub and `git ls-remote`, then fetched before changes. No Auth0 branch existed. `main` was `f8ae474`; the previously verified voice branch was `0888886`. The latest integrated `school-drop-off-zones` branch was `f036822` and already contained `feature/flow-voice-elevenlabs` as an ancestor. It includes later hands-free voice, shared journey, School Shield, Bega and transit work. This task branches from that integrated baseline; it does not merge independent branches. Work is on `feature/flow-identity-auth0`. No changes were made directly to main.

Preserved: SmartMatch, public parking/map/journey exploration, Timpark, MapLibre, navigation, school zones, Motion evaluator and reward limits, separate DEMO, ElevenLabs tool handlers and immutable agent version, PWA and source explanations. No admin dashboard was added. Existing FLOW City remains a protected feature.

## Applied configuration

The existing tenant/app/API were reused, not recreated:

- Domain: `dev-3a2ijpzkw4p8cng6.us.auth0.com`
- SPA client: `97hHmp8qdXa5H5eVcJz3nah9uBlNjvaU`
- Audience: `https://api.vlaiqflow.app`
- Issuer: `https://dev-3a2ijpzkw4p8cng6.us.auth0.com/`
- Local callback/logout: `http://localhost:5173/`
- CORS: `http://localhost:5173`

Public values were added to ignored frontend/backend `.env` files, preserving unrelated ORS and ElevenLabs configuration. `.env.example` files include the public Auth0 values. No browser secret, Management API credential, fake service secret, or live user token is committed. The supplied environment has an ElevenLabs key; its value was not printed. Local PostgreSQL uses a loopback-only container with a named volume; it is development infrastructure, not a production database.

Official dependencies: `@auth0/auth0-react` 2.30, `express-oauth2-jwt-bearer` 1.11, `pg` 8.23, `sharp` 0.35, plus dev-only `jose` for locally signed test JWTs. The lockfile pins actual resolutions. Auth0 official React and Express integration documentation was checked. React 18, Vite 5 and Express 4 remain unchanged. The unnecessary `browser-tabs-lock` postinstall donation message is explicitly skipped in pnpm build policy.

No tenant configuration was changed remotely. Management credentials/CLI session were unavailable; the shared browser failed to open requested pages. An independent actual Chromium navigation to the existing tenant failed with `ERR_TUNNEL_CONNECTION_FAILED`, and an issuer-discovery HTTP request returned 403. Neither result proves a tenant outage or a tenant configuration defect. Native plan/RBAC/MFA settings and mail delivery cannot be inspected from this environment.

## Routes

| Route | Access | Behavior |
|---|---|---|
| `/` | Public | Existing map, parking and journey discovery; login entry in header |
| `/help`, `/confidentialitate`, `/privacy` | Public | Help and accurate privacy notice |
| `/team` | Public | Authentic presentation, branded photo placeholder until a real photo is supplied |
| `/auth/callback` | Public | Callback infrastructure; configured callback remains `/` |
| `/profile` | Authenticated | FLOW Passport, real balance, activity summaries and derived milestones |
| `/profile/edit`, `/settings` | Authenticated | Edit name/nickname/biography, avatar, preferences, voice consent, data deletion |
| `/activities` | Authenticated | Passport activity timeline |
| `/wallet`, `/motion`, `/challenges`, `/community` | Authenticated | Existing Motion experience under verified account ownership |
| `/navigation`, `/city`, `/data`, `/sources`, parking-data/chance routes | Public (15 Nov) | Core trip and data explanations; CLAUDE.md rule 5 requires them to work when Auth0 is down, and judges run the DEMO without an account |
| Static/PWA assets | Public | Required for startup and installation |

All other internal paths receive the gateway when logged out; unknown paths show existing 404 when authenticated. Public homepage APIs (parkings, destinations, recommendations, journeys, public city snapshots and routing) remain available. Private APIs are `/api/me/**`, `/api/motion/**`, and `/api/flow-voice/**`. Team content GET is public; team access check/PATCH are protected.

Login uses Universal Login with PKCE through the official SDK, `openid profile email`, the API audience and Romanian locale. Signup sets only `screen_hint=signup`; neither flow forces a connection or hides Google. Tokens stay in SDK memory; there is no localStorage token cache or refresh-token grant added without tenant configuration. On refresh the SDK tries its supported silent session recovery. When browser privacy restrictions prevent recovery, the user sees a reconnect gateway, with the intended route retained. No automatic redirect loops are used.

The original pathname, query and fragment are passed as appState and revalidated after callback. External, protocol-relative, backslash/control, encoded-path-separator and callback destinations are rejected. Callback query data is excluded from service-worker handling and private APIs are never cached. Cancellation gets a retry state and safe saved-route recovery. Logout clears private in-memory state, object URLs and prior-device travel shortcuts, ends voice/GPS components by unmounting, and broadcasts logout to other tabs. Bearer tokens are not revocable by this SPA and retain their normal Auth0 expiry; account deletion is explicitly distinct from Auth0 identity/session revocation.

## Profile and database architecture

`database/migrations/001_flow_identity.sql` creates account rows keyed by **verified issuer plus subject**, a private JSONB profile, avatar bytes/version and a JSONB wallet. No email-based identity merging is performed. There is no user-ID path parameter. All database queries are parameterized. Strict shared zod schemas reject coin, role, permission and owner fields in profile writes. Preferred names and biographies are rendered as text, never HTML.

Profile fields: display name (80), nickname (30, bounded character set), biography (280), explicit voice consent (default false), and supported SmartMatch settings (mode, 2–30 walking minutes, School Shield). These settings actually update the existing homepage recommendation settings. The app initializes a real new profile with neutral default text; no fabricated activity or earned coin balance is added. Profile creation time is the FLOW profile creation date, not a claimed Auth0 signup date.

The application refuses to replace PostgreSQL persistence with localStorage. Without a database URL or migration, account operations fail visibly; public exploration remains usable. The SQL migration is idempotent and is an explicit deployment step. It does not run destructive schema synchronization at startup.

Deletion removes FLOW profile, avatar, wallet, activities and preferences. Auth0 identity remains and is clearly reported as not deleted. Reconnecting can create a fresh profile. The separate wallet deletion action erases Motion history/rewards while preserving the profile. This is not an Auth0 account-management portal. Publish the actual controller/contact and backup retention before production; existing privacy-contact configuration is still an operator responsibility.

## Avatar storage

The browser offers file selection, image preview, circular crop, zoom, drag and keyboard range controls. The crop uploads a binary WebP; no base64 photo is put into a token or profile JSON. The server independently accepts only JPEG/PNG/WebP, limits input to 5 MB and 25 million pixels, decodes via sharp, rejects unsupported/animated/invalid input, rotates/resizes and re-encodes to 512px WebP without original metadata. MIME/filename alone is not trusted. Output is private, `no-store` and `nosniff`.

A random UUID versions each avatar. Replacing/deleting bytes is atomic in PostgreSQL, leaving no filesystem object or original filename to clean up. Owned bytes are fetched with a bearer token and displayed with short-lived browser object URLs, revoked on replacement/logout/account change. Initials are the default. PostgreSQL must have persistent storage and backups in deployment; the app never depends on ephemeral server photo files.

## Wallet and progress

The original `MotionStore` evaluator is reused with an additional in-memory snapshot adapter. Every authenticated wallet operation loads the account row with `SELECT ... FOR UPDATE`, runs the existing server-side start/finish/cancel/evaluate logic, and commits the snapshot in the same PostgreSQL transaction. This serializes concurrent devices and backend replicas. The client cannot set coins. Existing minimum durations/distances, daily/session caps, duplicate-finish handling, digest checks and timestamp validation are preserved. Browser GPS is plausibility evidence, not hardware attestation.

Only summaries and observation digests persist, never raw GPS points. The Passport uses evaluated activity summaries, including eligible activities that hit a coin cap, to derive distance, duration and milestones. Reward ledger balances are server-derived. Empty/error/loading are distinct; a failed fetch shows dashes, not invented zero statistics. Inactive wallet summaries are purged after the existing 365-day threshold on the next wallet operation. Profile data has its own explicit deletion policy.

Legacy anonymous `backend/.data/motion.json` is untouched. **Guest import is not implemented**: no silent reassignment, overwriting, duplicate import or DEMO migration occurs. Retain the old file securely if real legacy records exist. Designing an owner-confirmed migration with durable receipts is separate work. Existing DEMO state remains local and excluded from account statistics.

## ElevenLabs

The connected ElevenLabs exploration skill was used to inspect the existing FLOW Voice agent and branch. Agent `agent_8701m7dvvhhyexj9771tqawz23vm`, pinned version `agtvrsn_7001m7dwanv7fe385wxb8f4zbc6c`, voice and tools are preserved. That production configuration has **first-message override disabled** and no nickname variable placeholder. The final acceptance pass created an isolated candidate branch, changing only its first-message template and placeholder; see the live runbook for exact IDs and evidence. No production prompt, override policy, traffic split or application pin was changed.

With opt-in, `voicePersonalization` produces only a normalized, length-bounded preferred name. After connection, the existing SDK `sendContextualUpdate` receives data-only JSON with preferred name and consent. No email, biography, full activity history or arbitrary instructions are sent. Opt-out produces no nickname context. Leaving voice pages or logging out/account switching closes the existing session; account-specific state is remounted. The initial pinned greeting remains generic. A spoken personalized first greeting is **not claimed**; it would require a separately tested agent version with an appropriate bounded variable. Subsequent use of the contextual nickname also needs a real authenticated audio session test.

## Permissions and tenant limitations

The backend requires the verified access token's `permissions` array to contain `update:team-presentation`. Team edit controls appear only after the backend access endpoint succeeds. Missing/invalid token returns 401, valid non-contributor 403, contributor 200. There is no email/nickname/front-end role bypass and no access to other accounts. Tests exercise actual HTTP handlers with locally signed RS256 tokens. No real Auth0 user was granted a role; the handoff says the existing role has no assigned users.

An optional application-managed fallback is implemented but disabled by default. `FLOW_TEAM_CONTRIBUTORS_JSON` is a backend-only JSON array of exact verified `{issuer, subject}` grants (maximum 20). Deployment operators control it; there is no browser grant API/UI. An empty list fails closed. Grants from another issuer, emails and client role flags cannot authorize access. The access endpoint reports `application-managed` separately from `auth0-permissions`, and the team editor labels the source. No fallback identities were configured here. This is not native Auth0 RBAC. Reassess active plan and native permission entitlement before production; no paid plan was activated.

## Password recovery, email, Google, Passkey, MFA

- **Recovery:** real Auth0-hosted password recovery is retained by Universal Login; no custom/fake reset form or existence-check API was added. Email delivery, reset-link expiry and invalidation of the old password are not exercised here.
- **Google:** connection visibility and successful full sign-in are not verified. No connection filter was introduced. Replace existing development Google credentials with a production Google OAuth client in the same Auth0 connection; register the tenant's exact callback URL shown by Auth0, publish the consent screen, and configure authorized production domains. Do not create a new connection/identity solely for this task.
- **Email verification:** UI displays only the SDK's actual `email_verified` claim or an explicit unavailable state. It does not label all users verified. Delivery is unverified.
- **Email provider:** the handoff reports Auth0's development provider. Auth0 documentation says it is for testing; Auth0 Support documents a maximum of 10 emails per minute and limited reliability. Actual tenant usage/limits/delivery were not inspected. Production requires a verified sender/domain and a real provider.
- **Passkey:** preserved official New Universal Login/Identifier First, no fingerprint simulation or biometrics collection. Enrollment/login are unverified on a physical compatible device. A passkey may use biometrics or a PIN, and is not represented as a separate MFA challenge.
- **MFA:** the handoff reports disabled. No factor was enabled or challenged. Plan eligibility, recovery and actual MFA remain unverified. No paid plan activated. Separate email OTP passwordless was left inactive to avoid splitting account ownership.

Production SMTP configuration is entered **in Auth0**, never Vite. Obtain `smtp_host`, provider-supported `smtp_port` (usually 587), `smtp_user`, `smtp_pass`, and a verified `default_from_address` such as an operator-owned sender. Configure SPF/DKIM/DMARC for that actual provider and domain, verify TLS support and sender identity, then enable the provider. Management API shape (values must be supplied by operator, not fabricated credentials):

```json
{
  "name": "smtp",
  "enabled": true,
  "default_from_address": "<verified sender>",
  "credentials": {
    "smtp_host": "<provider host>",
    "smtp_port": 587,
    "smtp_user": "<provider username>",
    "smtp_pass": "<provider password>"
  }
}
```

## Local development and deployment

1. Install the Node version supported by all locked packages (Node 24 was used here) and pnpm. `pnpm install --frozen-lockfile`.
2. Copy `.env.example` to ignored env files. The task workspace already has the supplied public Auth0 values. Preserve existing ORS/ElevenLabs keys.
3. Supply a PostgreSQL `DATABASE_URL` using provider-required TLS verification. Use a dedicated application database/user with access only to FLOW tables. Provision durable volumes or a managed service; use encrypted backups and test restoration. Do not use the local trust-authenticated test container in production.
4. Run `pnpm -F backend db:migrate` from the repository. Migrations run in the backend working directory through pnpm. Back up existing data first.
5. `pnpm dev`; frontend `http://localhost:5173`, backend `http://localhost:8787`. Access this exact hostname for the supplied Auth0 callback configuration.
6. For production, set frontend Auth0 redirect/logout to the **actual HTTPS production origin**; add these exact URLs plus web origin in the existing Auth0 SPA settings. Keep the issuer/audience unchanged. Configure backend CORS with the actual origin. The localhost build must not be deployed as production configuration.
7. `pnpm typecheck`, integration tests and `pnpm build`. Start backend with `NODE_ENV=production pnpm -F backend start` behind existing Caddy/HTTPS. It serves compiled SPA deep links. Forward only through a trusted proxy; `trust proxy = 1` assumes the existing Caddy topology. Keep the backend port private.
8. Verify live login before release. Populate real team photo under `frontend/public/team/` and real member details through controlled configuration or contributor access. Publish privacy operator/contact, retention, data-export support and production provider terms.

### Repeatable test commands

```sh
# Use a disposable database ending in _test. Never point tests at production.
IDENTITY_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/flow_identity_test pnpm -F backend test
pnpm -F frontend test
pnpm -F shared test
pnpm typecheck
pnpm build

# Synthetic Auth0 browser contract + real PostgreSQL handlers (separate terminal):
IDENTITY_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/flow_identity_test pnpm -F backend exec tsx scripts/identity-browser-server.ts
# With pnpm dev already running and Playwright available:
node scripts/test-identity-browser.cjs
```

Set `PLAYWRIGHT_MODULE` to your installed Playwright if needed. The test SDK is intercepted only by the browser runner. Neither fixture nor local JWT issuer is reachable through production startup, and no auth bypass flag exists in application code. Browser screenshots from the authenticated fixture must always be labeled synthetic identity.

## Live acceptance checklist (currently pending)

Use a real owned test account and an actual configured deployment origin:

1. Open `/`, then directly open `/motion?mode=cycle`. Verify gateway context and exact route recovery after real Universal Login. Refresh, browser back and cancel login. Simulate offline/session expiration; reconnect without a loop.
2. Email/password signup: receive verification mail, verify, sign out/in. Confirm actual email status. Request password recovery from hosted login; receive mail, reset, confirm new password works and old password fails. Test an expired reset link. Google accounts recover through Google, not a FLOW password form. Do not disclose arbitrary email existence.
3. Google login: complete the provider redirect and verify return/deep link. Compare subject ownership carefully: a password account with the same email must not automatically merge its wallet.
4. Edit nickname/biography/preferences, upload a real authorized photograph, crop, save, refresh, sign out/in and open another device. Confirm the same persisted data. Remove image and verify initials. Inspect invalid/oversized image error handling.
5. Record a genuine outdoor GPS Motion session meeting server thresholds. Show the actual reward and summaries on another device. A chosen green route alone earns nothing. Demo values must remain separate.
6. Opt into voice and start a real session; verify consented context and a real recommendation. Test opt-out, logout and account switching. Do not promise a personalized first utterance with the current pinned agent.
7. Use a contributor-assigned real Auth0 user to exercise team PATCH success; ordinary user must receive 403 and no-token request 401. Do not assign permissions to an arbitrary user merely to pass the test.
8. On a physical compatible browser/device, complete official passkey enrollment (progressive if configured), sign out, authenticate with that passkey and verify fallback password/Google. Confirm the device prompt belongs to Auth0 and never captures biometric data in FLOW. Test unsupported device behavior.
9. Inspect plan before configuring real MFA. If eligible, enroll a real supported factor, retain recovery information securely, verify an actual challenge and recovery. If unavailable, record the actual entitlement limitation. Do not substitute passkeys for a separately tested MFA challenge.

## Jury script: 90 seconds, conditional on completed live gates

- **0–12s:** public homepage → Motion → gateway. “FLOW starts with an open city. Your personal progress starts with your verified identity.”
- **12–27s:** real Auth0 login, return to exact route. Use a real tested passkey only if the device acceptance check passed; otherwise use the verified login method.
- **27–48s:** Passport → edit nickname and an authorized real photo → save → refresh. “This profile is in PostgreSQL and follows the account, across sessions and devices.”
- **48–62s:** show actual wallet and validated summaries. If empty, say “This is a new account; no activity has been invented.” Never seed earned coins for the presentation.
- **62–75s:** start actual FLOW Voice only if authenticated voice has been verified; explain opt-in preferred-name context. Otherwise show the implemented consent control and clearly call the spoken demonstration pending.
- **75–85s:** prepared real API requests: no token 401, ordinary contributor operation 403, correctly assigned contributor succeeds. No private account IDs/data are revealed.
- **85–90s:** “Auth0 is not just how users enter VLAIQ FLOW. It is how their mobility identity, progress, personalization and private information remain protected.”

Do not include untested email delivery, passkey enrollment, MFA or a personalized initial voice greeting in the live script. Rehearse after resolving the external blockers.

## Sources consulted

- https://auth0.github.io/auth0-react/
- https://github.com/auth0/node-oauth2-jwt-bearer
- https://developer.auth0.com/resources/get-started/api/express
- https://support.auth0.com/center/s/article/Emails-to-Gmail-from-Auth0-never-arrive
- https://auth0.github.io/auth0-cli/auth0_email_provider_create.html
- https://developer.auth0.com/resources/labs/authentication/implement-passwordless-login-with-passkeys

See `flow-identity-verification.md` for the final measured results and completion table. This document describes implemented behavior and pending release checks; it is not a declaration that all live identity flows have passed.

Additional repeatable browser verification:

```sh
node scripts/test-identity-public-browser.cjs
# Start NODE_ENV=production API_PORT=8887 pnpm -F backend start after building:
node scripts/test-identity-production-browser.cjs
# With the disposable identity fixture server running and axe-core available:
AXE_CORE_PATH=/absolute/path/to/axe-core/axe.min.js node scripts/test-identity-accessibility.cjs
```

`PLAYWRIGHT_MODULE` selects an installed Playwright module; the default is `playwright`.
`IDENTITY_FIXTURE_FILE` selects the local test token file. It contains only test credentials, stays
outside Git and must never be included in evidence bundles. The automated WCAG scan supplements,
but does not replace, a screen-reader and physical-device accessibility review.
