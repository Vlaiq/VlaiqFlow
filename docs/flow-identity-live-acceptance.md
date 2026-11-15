# FLOW Identity: live acceptance runbook

15 November 2026, Europe/Bucharest. Starting revision: `2a2adb0`, draft PR #1.

**Current release decision: keep the PR in draft.** The app and local PostgreSQL checks pass. This environment's proxy rejects CONNECT to the actual Auth0 tenant with HTTP 403 before reaching Auth0. Discovery and JWKS both fail; this is not evidence of a tenant outage or a bad account. The shared browser also failed to open a tab (`Browser Use could not read requirements`); an independent fresh headless Chromium navigation failed with `ERR_TUNNEL_CONNECTION_FAILED`. There is no connected Auth0 management tool or authenticated CLI. No real user signup/login/token exchange, email, Google, passkey, MFA or native contributor assignment has been verified in this run.

Use this runbook on a computer whose browser **and backend** can reach `dev-3a2ijpzkw4p8cng6.us.auth0.com`. Browser access alone cannot fix backend JWKS access. In the managed environment, an administrator must allow the exact tenant host; Google login also needs the provider hosts used by its redirects. Preserve TLS validation and the configured proxy. Do not work around the policy with a different network route.

## Start the real local application

The current Cloud workspace has PostgreSQL 17, container `flow-identity-postgres`, named volume `flow-identity-postgres-data`, loopback port 5432. Databases: `flow_identity` for actual acceptance and `flow_identity_test` for disposable tests. Both have migrated tables. The real-account database contains **zero accounts** at the time of this report; fixture users were never inserted into it. This development volume is not a provisioned production database or a backup.

On another development computer, create equivalent local infrastructure once (the trust setting is exclusively for a loopback development database):

```sh
docker run -d --name flow-identity-postgres --restart unless-stopped \
  -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:5432:5432 \
  -v flow-identity-postgres-data:/var/lib/postgresql/data postgres:17
docker exec flow-identity-postgres pg_isready -U postgres
docker exec flow-identity-postgres createdb -U postgres flow_identity
docker exec flow-identity-postgres createdb -U postgres flow_identity_test
pnpm install --frozen-lockfile
export DATABASE_URL=postgresql://postgres@127.0.0.1:5432/flow_identity
pnpm identity:acceptance
```

For an existing container/database, start it and skip the create commands. The launcher runs the idempotent migration and starts the existing API and Vite app with the supplied public Auth0 configuration. It preserves inherited provider keys, writes no `.env` files, uses the actual SDK and normal JWT middleware, and explicitly disables application-managed contributor grants. It refuses a `_test` database and refuses a different frontend port. Stop other servers on 5173/8787 first. On Node 24 in the managed proxy environment, export `NODE_USE_ENV_PROXY=1` before starting it.

Open **`http://localhost:5173`**, including that hostname. A phone's LAN address, `127.0.0.1`, a preview URL and port 8887 are different origins and are not the configured Auth0 callback. Do not use the synthetic browser test server for live acceptance.

Confirm these existing SPA settings in Auth0 before starting:

| Setting | Local acceptance value |
|---|---|
| Client ID | `97hHmp8qdXa5H5eVcJz3nah9uBlNjvaU` |
| Callback URLs | `http://localhost:5173/` |
| Logout URLs | `http://localhost:5173/` |
| Allowed Web Origins / CORS | `http://localhost:5173` |
| API audience | `https://api.vlaiqflow.app` |
| API signing algorithm | RS256 |

These public values are in the examples; no SPA client secret is needed. No new application, connection or tenant is required.

## Browser acceptance and expected results

Use two accounts controlled by the testers, with real owned mailboxes: **A ordinary**, **B intended team contributor**. Create them through Universal Login using personal credential entry. Do not invent addresses, mark email verified administratively, use locally signed fixture tokens, or link accounts merely because their emails match. Credentials, reset links, verification links, tokens and recovery codes stay outside chat and screenshots.

Record each row as PASS / FAIL / BLOCKED with browser/device and time. An unperformed row remains pending.

| Check | Exact action | Expected evidence |
|---|---|---|
| Signup A | Open `/motion?mode=cycle#identity-acceptance`, select **Creează cont**, complete hosted database signup yourself | Auth0 hosted page; successful return to the exact path/query/hash; `/oauth/token` 200 and `/api/me` 200 in Network. Record status only, never export a HAR |
| First profile | Open `/profile` | Neutral new profile and empty activity/wallet; no fabricated rewards. This is the FLOW creation date, not the Auth0 signup date |
| Verification mail | Open the actual mail from Auth0 in A's mailbox and complete its link; sign out/in | Mail received and a fresh SDK `email_verified` status. A "mail sent" page alone is insufficient |
| Profile edit | `/profile/edit`: set nickname `Alex`, a short test biography, save | Save succeeds; `/api/me` PATCH 200 |
| Real photo | Select a photograph you own/have permission to use; zoom and reposition the crop; **Salvează fotografia** | PUT `/api/me/avatar` 200; image GET 200, `image/webp`, `no-store`; intended crop appears |
| Refresh | Reload `/profile`, then `/profile/edit` | Same nickname, biography and photograph. Record whether silent SDK restoration succeeds or a reconnect gateway is required by browser privacy settings |
| Return and cancel | Sign out, open `/motion?mode=cycle#identity-acceptance`; cancel hosted login, retry and complete it | Safe retry, no redirect loop, exact return path after completion |
| Logout/session | Account menu → **Deconectare**, then open `/profile`; also inspect a second open FLOW tab | Return to public origin; both tabs lose private content; protected page shows gateway; a fresh unauthenticated API request is 401 |
| Login persistence | Log back into A with the same method | Same saved profile/photo/wallet; not a newly seeded identity |
| Signup B / isolation | Sign out A, create B, edit B to a distinct nickname/photo; sign out and return to A | B starts separately; A never shows B's profile/avatar/activities and vice versa. No identities need to be shown to the jury |
| Google | Sign out; choose the existing Google option in hosted login; complete the provider consent/login yourself | Provider and Auth0 redirect succeed, `/oauth/token` and private API 200; exact return route. Same-email database/Google identities are separate unless deliberately linked through a separate approved process |
| Restart persistence | After saving A, stop/restart the backend and PostgreSQL container, preserving its named volume; log back in | Same profile and avatar. Repeat on production and another device before claiming production/cross-device persistence |

If refresh fails to restore silently, record it as a session-restoration limitation on that browser. Reconnecting with a retained route is implemented fallback behavior, not proof that silent restoration passed. Memory token storage remains enabled.

## Password recovery and passkeys: human gates

For A's **database** identity: sign out → **Conectează-te** → enter A's email in Universal Login → **Forgot password / Nu îți amintești parola?** (wording depends on tenant locale). Request the reset, check inbox/spam and delivery time, open the actual link, and enter/confirm the new password yourself. Sign in with the new password. Then make one controlled old-password attempt in a separate fresh login: it must fail. Reuse the consumed reset link: it must not permit another reset. Record a separately expired link only after its real expiry. Never call a generic success screen evidence of email delivery. Google-only identities recover their password through Google.

For passkeys: use a real compatible phone/laptop browser with a configured screen lock, at the actual secure login origin. Sign in with A, accept Auth0's progressive passkey enrollment **if it is offered**, complete the native biometric/PIN/security-key prompt, sign out, then select the hosted passkey login and complete another native prompt. Confirm the same profile returns and the password fallback still works. If enrollment is not offered, inspect the existing database connection's passkey/Identifier First settings in Auth0; report a configuration gate instead of fabricating a button or using a virtual WebAuthn device. A cloud browser run does not certify a physical device. **Passkey login is not a separately tested MFA challenge.**

## Native permissions and MFA entitlement

An Auth0 administrator must inspect the existing tenant's active plan/subscription without activating a trial or paid upgrade. In **Applications → APIs → the API with identifier `https://api.vlaiqflow.app`**, inspect **Enable RBAC**, **Add Permissions in the Access Token**, the permission `update:team-presentation`, and the existing contributor role. A role name alone is insufficient; the real access token must carry the permission. Record whether these settings are available under the active plan. They cannot be inferred from the app's local tests.

Keep A unassigned. Assign the existing intended contributor role only to owned test account B after confirming that identity in the dashboard. Log B out/in to obtain a new token after assignment. The access endpoint must return `source: auth0-permissions`; `application-managed` does not pass native Auth0 acceptance. No fallback grants are enabled by the acceptance launcher.

Separately inspect **Security → Multi-factor Auth** and the plan's factor entitlements, enabled factors, enforcement policies and login Actions. Record what is available and what is actually enabled. No new MFA factor/policy or paid feature was activated by this mission. An enabled factor alone is not enforcement. If an authorized real MFA test is possible, enroll a supported factor, retain recovery information privately, complete a fresh login challenge and verify recovery. Mark MFA pending until that independent challenge passes. Do not enable tenant-wide enforcement without a usable factor/recovery path.

### Repeatable real-token API evidence

`pnpm -F backend identity:verify-live` tests the **running app**, including team PATCH 401 without a token. It never substitutes a local signing key.

For A/B, take a fresh API **access** token locally from your own browser's Network → `/api/me` → Request Headers → Authorization. Copy only the token after `Bearer ` into the **local hidden terminal prompt** below; never paste it in chat, the command line, a JWT website or a screenshot. This step requires a real completed browser login. The test cannot obtain an account on your behalf.

```sh
umask 077
flow_token_path="$(mktemp)"
IFS= read -r -s -p 'Paste the access token locally (hidden): ' flow_access_token
printf '%s' "$flow_access_token" > "$flow_token_path"
unset flow_access_token
printf '\n'
# Run A first; repeat with B's fresh token and change ordinary to contributor.
IDENTITY_ACCEPTANCE_EXPECT=ordinary \
IDENTITY_ACCEPTANCE_TOKEN_FILE="$flow_token_path" \
pnpm -F backend identity:verify-live
rm -f "$flow_token_path"
unset flow_token_path
```

Run these Bash commands in your own terminal, where the clipboard/token stays private. Ensure shell tracing is off. The file must have mode 600. For another deployment, set `IDENTITY_ACCEPTANCE_API` to its exact HTTPS API origin. The probe refuses redirects, fallback grants and a different tenant/audience. It runs the production middleware's real discovery/JWKS verification, checks `/api/me` 200, then checks access and PATCH. Expected A: **403**; expected B: **200** with a native Auth0 permission. B re-saves the exact public presentation, exercising the write without changing jury text; coordinate the test so nobody edits that presentation concurrently. A profile read can create the normal first account row. The probe prints no token, subject, nickname, biography or photo. Delete the temporary file even if a test fails.

No real-token PASS output was produced in this environment. Successful local-key tests are labeled separately in the verification report.

## Voice candidate and production boundary

Production application pin remains `agtvrsn_7001m7dwanv7fe385wxb8f4zbc6c`. Its first message remains **"Salut! Sunt FLOW Voice. Unde ai vrea să ajungi?"**. Opt-in nickname context is sent after connection; subsequent actual spoken use still needs authenticated app acceptance.

An isolated ElevenLabs branch `flow-identity-greeting-acceptance` was created from that exact pin:

- Branch: `agtbrch_0001m7ez1j3afhssg2m1yarjnz1r`.
- Candidate: `agtvrsn_4901m7ez41sgfsp9h0zgcsqdex8y`.
- First message: `Salut{{flow_nickname_salutation}}! Sunt FLOW Voice. Unde ai vrea să ajungi?`.
- Placeholder configuration: empty string. For consented `voicePersonalization(profile)` only, the candidate client must supply `flow_nickname_salutation: ", " + nickname` in SDK **startSession dynamicVariables**, before connection. Opt-out must explicitly supply `flow_nickname_salutation: ""`. The configured placeholder is not a proven runtime default: an omitted-variable test timed out without a greeting. Do not pass biography, email, IDs, tokens or unrestricted greeting text.
- First-message/prompt/voice/tool override restrictions remain in place. The four existing tool IDs, prompt, LLM and voice are preserved. Production traffic remains on Main; the app pin was not changed. Explicitly targeted test calls can reach a branch at 0% traffic.

Live provider tests used an API-key-authorized signed WebSocket URL pinned to the candidate and a non-personal test nickname. Named and explicit-empty tests returned the expected first-message text and complete PCM audio (122,880 and 115,200 bytes at 16 kHz on the final successful samples). The omitted-variable case failed the 25-second greeting timeout; do not promote the candidate as fully verified. A full remote configuration comparison found only the greeting and its placeholder changed. This is provider-level evidence, **not Auth0 authentication, an app WebRTC/microphone test, a physical listening test, or a regression test of all four client tools**.

Remaining voice gate: using real A, save nickname and opt in under `/settings`; start FLOW Voice with a real microphone, listen to the current generic greeting, ask a real mobility question, then opt out and repeat. Confirm no nickname context is sent when opted out; test logout/account switch closes the session. To promote the candidate later, first test it in an isolated app integration that passes the bounded variable at startup; verify the personalized audio, empty/missing-variable fallback, all existing tools, interruption/navigation behavior and account switching. Then review the separate immutable app-pin change. No production switch is authorized by a provider greeting check alone.

## HTTPS deployment audit

No deployment was made. Existing Caddy example supports one-origin HTTPS; Express serves compiled SPA deep links in production. The current build has a **localhost-only** callback and must not be deployed as-is.

| Requirement | Implemented / checked here | Required before release |
|---|---|---|
| PostgreSQL | Parameterized issuer+subject rows; local PG17 named volume and migration; all DB integration tests run | Provision durable production service/volume, restricted DB user, verified provider TLS, encrypted backups and a tested restore. Run migration against the actual deployment DB |
| Avatars | Private bytea in the same PostgreSQL account row; actual processing/crop/persistence tested locally | Back up/restore avatar bytes with the DB. Do not put permanent photos in `/tmp`, the container filesystem or localStorage |
| Frontend build variables | Public domain/client/audience and exact same-origin redirect/logout checks | Build with `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`, `VITE_AUTH0_REDIRECT_URI=https://<actual-host>/`, `VITE_AUTH0_LOGOUT_URI=https://<actual-host>/`. Empty `VITE_API_URL` for one origin. Never put secrets in any `VITE_` variable |
| Backend configuration | Required account storage fails visibly; actual JWT guard protects all account, Motion and voice routes | Set `DATABASE_URL`, `AUTH0_ISSUER_BASE_URL`, `AUTH0_AUDIENCE`, exact HTTPS `CORS_ORIGINS`; retain existing ORS/Gemini/ElevenLabs keys. Native challenge uses empty fallback grants |
| Auth0 URLs | Local public values documented; actual tenant access blocked | Add exact **HTTPS** callback/logout URLs and web/CORS origin to the existing SPA before the build goes live. Keep localhost entries only for development; no wildcard production callbacks |
| Backend exposure | App assumes one trusted Caddy hop (`trust proxy = 1`) | Restrict port 8787 to loopback/trusted reverse proxy using host/container firewall/binding. Public traffic must reach Caddy HTTPS; adjust proxy trust for a different topology. CORS does not replace JWT authentication |
| CORS / proxy | Vite `/api` proxy; allowlist origin middleware; voice also requires exact Origin and intent header | Verify deployed preflight and Authorization forwarding, no response/header stripping, valid body limits, and denied origins receive no ACAO. API egress must reach Auth0 discovery/JWKS and ElevenLabs |
| API privacy | Missing-token private APIs/team PATCH 401; permissions enforced server-side; no-store, private avatars, sanitized errors | Repeat ordinary 403/contributor 200 with real tokens at HTTPS origin. Keep token/body/query logging disabled, including callback codes in reverse-proxy logs |
| ElevenLabs | Existing immutable version, server-only key, voice origin/intent checks; candidate tested separately | Preserve owning workspace/key, `X-Flow-Voice` forwarding, exact frontend Origin, outbound API/LiveKit access and real microphone/WebRTC test. Do not change the production pin prematurely |
| PWA | Compiled public-only cache, callback query exclusion, no Authorization/API caching | Real HTTPS certificate, install/standalone callback behavior on intended device, update/offline/public shell check and reconnect on expired session. Offline shell is not offline authenticated account access |
| Google/email/MFA | Current configuration only reported by the earlier handoff | Inspect active plan, actual connection settings, production Google credentials and verified email provider/sender. Test delivery and each claimed factor independently |

Build only after configuring the actual HTTPS values, then run typecheck, full tests and build, start behind Caddy and complete the above live acceptance on that exact origin. The backend issuer remains `https://dev-3a2ijpzkw4p8cng6.us.auth0.com/`; the API audience is an identifier, not a URL that must host the backend. This audit does not certify a deployment that does not yet exist.

## Dependable jury rehearsal now: 60 seconds

Only these capabilities have evidence in this environment:

1. **0–20s:** public FLOW homepage, existing map/parking exploration. Open `/motion` and show the account gateway. Explain that private progress requires Auth0.
2. **20–35s:** show the real API's missing-token 401 checks with `pnpm -F backend identity:verify-live`. Explain the local automated 401/403/200/JWKS tests separately; do not call their fixture identities real Auth0 users.
3. **35–50s:** show the passing verification report/build and the explicit pending real-login gate. The profile/photo UI may be described as implemented and tested locally; do not pass off a synthetic browser session as a live account.
4. **50–60s:** explain PostgreSQL account ownership and the staged voice greeting. The production greeting is generic. Do not include an unverified live voice/email/passkey/MFA demonstration.

After A/B browser and real-token rows pass, rehearse the 90-second live script in `flow-identity.md` using the actual prepared accounts: login → exact return → profile/photo → reload → 401/403/200 → logout. Add Google, password recovery, passkey or voice only after that exact capability has passed on the presentation device. Keep the no-network fallback above available. No sponsor-success or complete live-auth claim is justified by the present evidence.
