# FLOW Identity: Windows acceptance

Use native PowerShell. Start from `feature/flow-identity-auth0`, continuing from `27220d6`; do not reset newer work. This guide starts the existing app and official Auth0 SDK. It creates no fake users, disables no JWT checks, and never changes the production ElevenLabs pin.

**Evidence boundary:** Windows CI is Windows Server, not the owner's Windows 10/11 desktop. Browser login, real tokens, mail, Windows Hello/passkeys and microphone acceptance remain pending until performed privately on that desktop. The cloud environment still cannot reach Auth0. See the measured matrix in `flow-identity-verification.md`.

## 1. Prerequisites and versions

| Component | Use | Evidence / limitation |
|---|---|---|
| Windows | Prefer maintained Windows 11 x64, 23H2/build 22631 or later | Windows 10 22H2/build 19045 needs an applicable maintained servicing arrangement for Docker support; no blanket desktop certification is claimed |
| PowerShell | Windows PowerShell 5.1 or PowerShell 7 | Commands below avoid Bash and changes to execution policy; CI uses PowerShell 7 |
| Node.js | **24.22.1 LTS x64** | Tested Linux and Windows CI; install the official MSI from nodejs.org, then reopen PowerShell |
| pnpm | **12.18.0**, matching `packageManager` and the frozen lockfile | Installed and exercised on Windows CI |
| Corepack | Optional **0.34.6** | Bootstrap tested on Linux. Not required with the npm installation of pnpm below; do not disable signature checks |
| Git | Git for Windows **2.56.0.windows.4** was exercised in CI | Commands require `git switch` (Git 2.23+); use a maintained official Git for Windows release |
| Docker Desktop | **4.99.0** is the published current version on the verification date | Actual Desktop installation is NOT TESTED here; start its Linux-container engine. Existing compatible supported Desktop installations need not be replaced |
| PostgreSQL | **17.12**, image `postgres:17.12` | Actual local PG17.12 migration/integration tested. Use a named volume; do not use a `_test` DB for real accounts |

The full Windows CI run also exercises native PostgreSQL **17.11** and actual launcher startup/IPC shutdown, including releasing both service ports. Docker Desktop, an interactive desktop TTY, Ctrl+C, browsers and Windows Hello remain owner-device checks. Full repository tests additionally need Python 3 (3.12+ recommended; Linux run used 3.12.14), available as `python` on Windows; running the application itself does not invoke Python.

Docker needs hardware virtualization, 8 GB RAM, and its supported Windows components. Its WSL2 backend requires WSL **2.1.5+**; the Hyper-V backend on supported Pro/Enterprise editions avoids WSL. No WSL shell is required for these commands. Follow the official installer rather than weakening firewall/virtualization policies. A native PostgreSQL alternative is below.

Official sources: [Node releases](https://nodejs.org/en/download), [Git for Windows](https://gitforwindows.org/), [Docker Windows requirements](https://docs.docker.com/desktop/setup/install/windows-install/), [Docker release notes](https://docs.docker.com/desktop/release-notes/). Desktop version requirements were checked on 15 November 2026; Docker's servicing policy still applies.

Open a fresh, ordinary PowerShell terminal after installing prerequisites:

```powershell
$PSVersionTable.PSVersion
node --version
npm.cmd --version
git --version
docker version
docker info --format '{{.OSType}}'
# If pnpm.cmd is absent or has a different version:
npm.cmd install --global pnpm@12.18.0
pnpm.cmd --version
```

Expected: Node `v24.22.1`, pnpm `12.18.0`, a responding Docker server, engine type `linux`. Using `pnpm.cmd` avoids PowerShell selecting an unsigned `pnpm.ps1`; do not set an unrestricted execution policy. If an existing Corepack shim conflicts, use `corepack.cmd pnpm@12.18.0` in place of `pnpm.cmd` rather than forcing an overwrite. Corepack itself can be installed with `npm.cmd install --global corepack@0.34.6` if absent.

## 2. Get the existing branch

```powershell
$flowRoot = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'VlaiqFlow'
if (-not (Test-Path $flowRoot)) { git clone https://github.com/Vlaiq/VlaiqFlow.git $flowRoot }
Set-Location $flowRoot
git status --short --branch
if (git status --porcelain) { throw 'Preserve or commit existing edits before switching branches.' }
git fetch origin
git switch feature/flow-identity-auth0
if ($LASTEXITCODE -ne 0) { throw 'Branch checkout failed; do not reset another branch.' }
git pull --ff-only origin feature/flow-identity-auth0
if ($LASTEXITCODE -ne 0) { throw 'The local branch diverges; preserve it and resolve before continuing.' }
git merge-base --is-ancestor 27220d6 HEAD
if ($LASTEXITCODE -ne 0) { throw 'This is not the expected identity history.' }
git log -1 --oneline
pnpm.cmd install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed; keep the lockfile unchanged.' }
```

Compare the printed commit with PR #1's head. Spaces in the directory are supported; no global Git line-ending setting needs changing. No existing `.env` is overwritten. The launcher supplies the public Auth0 values and preserves inherited provider keys and backend `.env` loading.

## 3. PostgreSQL: one-time local setup

Use a private development workstation. The following simplified cluster trusts connections **only through a port published to 127.0.0.1**. It is unsuitable for production or a machine with untrusted local users/processes: local processes could impersonate DB roles. The application role is non-superuser and owns only its acceptance database. For password authentication, use the native alternative below or your existing securely configured local PostgreSQL.

First check whether the container already exists and whether 5432 is occupied:

```powershell
docker ps -a --filter 'name=flow-identity-postgres' --format '{{.Names}} {{.Status}} {{.Ports}}'
Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess
```

For a **new** container/database only:

```powershell
docker volume create flow-identity-postgres-data
docker run --detach --name flow-identity-postgres --restart unless-stopped --publish 127.0.0.1:5432:5432 --env POSTGRES_HOST_AUTH_METHOD=trust --mount type=volume,source=flow-identity-postgres-data,target=/var/lib/postgresql/data postgres:17.12
if ($LASTEXITCODE -ne 0) { throw 'Database container did not start. Check Desktop, port conflicts and the existing container.' }
docker exec flow-identity-postgres pg_isready -U postgres
```

If the last command says “no response”, wait a few seconds and rerun it until it says “accepting connections”. Then create the application role/database once:

```powershell
docker exec flow-identity-postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'CREATE ROLE flow_identity_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
docker exec flow-identity-postgres createdb -U postgres -O flow_identity_app flow_identity
$env:DATABASE_URL = 'postgresql://flow_identity_app@127.0.0.1:5432/flow_identity'
pnpm.cmd -F backend db:migrate
```

Expected: `CREATE ROLE`, then `FLOW Identity migration applied.` The migration creates missing tables without deleting records. The launcher repeats it safely after checking PostgreSQL availability and schema privileges. It refuses remote, system and `_test` databases.

For an **existing** container, use `docker start flow-identity-postgres`; skip creation. Never remove/recreate its volume to fix an error. If the previous guide created tables owned by postgres, create the application role if missing and grant it access to those existing local tables:

```powershell
docker exec flow-identity-postgres psql -U postgres -d flow_identity -v ON_ERROR_STOP=1 -c 'GRANT USAGE, CREATE ON SCHEMA public TO flow_identity_app; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO flow_identity_app'
```

Do not apply these development trust/grant instructions to production. If 5432 belongs to another service, preserve it and publish a new container at `127.0.0.1:5433:5432`, then use port 5433 in `DATABASE_URL`.

## 4. Check Auth0 from Node and the browser separately

**Measured Windows CI result:** [this run](https://github.com/Vlaiq/VlaiqFlow/actions/runs/43691785665) resolved DNS and received real Auth0 discovery/JWKS **HTTPS 200 through both transports**, with default TLS checks enabled and no credentials. The owner's browser and local network are separate and still need the following checks.

From the repository root, using the same Node as Express:

```powershell
pnpm.cmd identity:connectivity
```

Expected: DNS resolved (or a documented proxy-side DNS result), then four PASS lines: discovery and JWKS via Node fetch **and** Node HTTPS/JWT transport. Responses must be HTTPS 200, match the exact issuer, and include expected RSA/RS256 key material. No credentials or payloads are printed. This verifies connectivity/metadata, not a JWT or a logged-in user.

In the Windows browser, open these exact addresses independently:

```powershell
Start-Process 'https://dev-3a2ijpzkw4p8cng6.us.auth0.com/.well-known/openid-configuration'
Start-Process 'https://dev-3a2ijpzkw4p8cng6.us.auth0.com/.well-known/jwks.json'
```

Expected: JSON, no TLS warning, issuer `https://dev-3a2ijpzkw4p8cng6.us.auth0.com/`, matching JWKS URL and public RSA keys. Record only PASS/FAIL, browser, error code and time; do not export a HAR or share login/callback URLs containing codes.

If the browser succeeds and Node fails, Windows browser proxy/PAC and certificate settings may differ from Node. On an authorized explicit environment proxy, use Node 24's `$env:NODE_USE_ENV_PROXY = '1'`; preserve the approved `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY` settings. Loopback addresses must remain excluded from the proxy. For an administrator-installed corporate CA, Node 24 can use `$env:NODE_USE_SYSTEM_CA = '1'` or an administrator-provided `NODE_EXTRA_CA_CERTS` file, then restart both preflight and app. Do not print proxy credentials, bypass a managed policy or use `NODE_TLS_REJECT_UNAUTHORIZED=0`. `EAI_AGAIN`/`ENOTFOUND` indicates local DNS; `ERR_PROXY_TUNNEL`/CONNECT 403 indicates the proxy path; certificate errors need a correct trusted chain, not disabled verification. The cloud's known CONNECT rejection does not establish a tenant outage.

## 5. Start and confirm the app

Keep the terminal with `DATABASE_URL` open:

```powershell
pnpm.cmd identity:acceptance
```

Expected: migration applied, then **`READY: http://localhost:5173  API: http://localhost:8787 (loopback only).`** Both services must respond before READY. The launcher checks IPv4/IPv6 conflicts on 5173/8787, PostgreSQL and migration privileges; it does not kill unrelated processes. Child services use installed Node entry points with literal argument arrays, avoiding `spawn('pnpm')` and Windows `.cmd` shell resolution.

In a second PowerShell window:

```powershell
(Invoke-WebRequest -UseBasicParsing 'http://localhost:5173/').StatusCode
(Invoke-RestMethod 'http://localhost:8787/api/health').status
Start-Process 'http://localhost:5173/motion?mode=cycle#identity-acceptance'
```

Expected: `200`, `ok`, and the FLOW gateway. Always use **localhost:5173** in the browser. `127.0.0.1`, a LAN address, another port or a preview URL is a different Auth0 origin. Both services bind IPv4 loopback; the Vite API proxy explicitly uses 127.0.0.1 to avoid IPv6 backend ambiguity. Do not grant public firewall exposure. A phone needs a separately configured real HTTPS deployment for the full app; do not replace localhost with a LAN IP.

Existing Auth0 SPA settings: client `97hHmp8qdXa5H5eVcJz3nah9uBlNjvaU`, callback/logout **`http://localhost:5173/`**, allowed web/CORS origin **`http://localhost:5173`**. API audience **`https://api.vlaiqflow.app`**, RS256. Reuse the existing tenant/app/API; no SPA client secret is needed.

## 6. Real acceptance: perform privately and record statuses

Use two real owned accounts: A ordinary, B the intended contributor. Passwords, emails, codes, token contents and photos stay out of chat/reports. Unperformed checks remain NOT TESTED; blocked checks remain BLOCKED.

| Sequence | Action and expected result |
|---|---|
| A signup | From the protected deep link choose **Creează cont**, complete official Universal Login yourself. Expect `/oauth/token` 200 and `/api/me` 200 in browser Network, then return to `/motion?mode=cycle#identity-acceptance`. A visible hosted page alone is insufficient |
| A profile | Open `/profile`: neutral new profile, empty earned balance/activity. `/profile/edit`: change display name, nickname and biography, save; PATCH `/api/me` 200 |
| A real photo | Use an owned JPEG/PNG/WebP (≤5 MB): picker → preview → zoom → drag/reposition → save. Expect avatar PUT 200, GET 200 `image/webp`/`no-store`, correct crop in Passport and header. Refresh, remove photo and verify initials; invalid input must show an error |
| Persistence | Save, refresh, logout/login, restart app, then restart only the PostgreSQL container and log in again. Expect the same profile/avatar/wallet. A refresh alone does not prove cross-device persistence |
| Session behavior | Test deep link, Back, cancelled login/retry, expired session/reconnect and two tabs. No loops or stale private data. Refresh may require explicit reconnect under cookie restrictions; record whether silent restoration actually passed |
| Logout | Account menu → **Deconectare**. Expect public local origin, protected gateway, no private data in another open tab, unauthenticated API 401 |
| B isolation | Sign out A; create B and choose distinct profile/photo/preferences. Switch back and forth; never share avatar/profile/wallet/history/preferences. API has no user-ID selector to alter; do not invent one |
| Google | Choose the existing Google button and complete provider consent yourself. Expect successful return, token exchange and private API 200. Development Google credentials may suffice for local testing; visibility alone is not acceptance. Do not merge matching-email password/Google identities |
| Email verification | Receive the actual message, open its actual link, sign out/in and inspect fresh verified-email state. “Sent” is not delivery evidence |
| Recovery | Database account A: sign out → hosted login → enter email → real Forgot password action. Receive mail, open link privately, set a new password yourself, sign in; make one old-password attempt (must fail), and reuse the consumed link (must refuse). An expired-link check requires actual expiry. Google-only recovery belongs to Google |
| Passkey | On the actual physical device with screen lock/Windows Hello or a security key, accept hosted passkey enrollment if offered. Complete native prompt, log out, authenticate with that passkey, verify the same account, cancel once and test fallback. No virtual biometric device. Passkey login is not a separately tested MFA challenge |
| Native RBAC | Admin: inspect existing API RBAC/Add Permissions settings and active plan; confirm B's intended identity, assign existing **VLAIQ Team Contributor** role containing `update:team-presentation`; leave A ordinary. Log B out/in for a fresh token. Never self-promote through profile fields |
| MFA | Handoff says disabled. Inspect plan entitlement, factors, policies and Actions separately; do not enable paid features. Only call MFA PASS after authorized real enrollment, an independent challenge and recovery. Leave it NOT TESTED otherwise |
| Motion | Real new wallets are empty; DEMO stays separate. Only a genuine eligible outdoor GPS session may earn rewards. Never seed coins for the jury |
| Voice | Real Auth0 login → nickname + explicit consent → real microphone session → real mobility question/response → opt out/repeat → account switch/logout closes session. Verify no email/biography/token is sent to ElevenLabs. The production first greeting is generic; candidate promotion requires separate complete acceptance and explicit authorization |

Google production setup, if required: edit the existing Google connection's client ID/secret in Auth0 using an operator-owned Google OAuth client, register Auth0's exact provider callback shown by the dashboard, configure the consent screen/domains, then retest. Do not create a duplicate connection or put the secret in Vite.

The development email provider does not certify production delivery. A supported production option is Auth0's SMTP provider with a verified sender/domain, host/port, user/password and TLS from the operator's provider (for example Amazon SES SMTP), plus SPF/DKIM/DMARC and production sending permission. Enter these privately in **Auth0 → Branding → Email Provider**, enable the intended templates, then test actual delivery. Do not register a provider or pay for it as part of this guide.

## 7. Real-token JWT and contributor proof, with no files

In a second local PowerShell terminal at the repository root:

```powershell
pnpm.cmd -F backend identity:verify-live
$env:IDENTITY_ACCEPTANCE_EXPECT = 'ordinary'
pnpm.cmd -F backend identity:verify-live
```

First command: missing-token private APIs and team PATCH **401**, with an explicit “No Auth0 authentication claimed” output. Second command opens a **hidden interactive terminal prompt**. From your own logged-in A browser, locally copy only the access token after `Bearer ` from Network → `/api/me` → Request Headers. Paste **only into that local hidden prompt**, then Enter. No token appears in arguments, history, env vars, files or reports. The token lives in process memory for the check; JavaScript does not promise cryptographic memory erasure. Ctrl+C cancels and restores terminal state. Do not use recording/transcript software or third-party JWT websites; clear the clipboard afterward with `Set-Clipboard -Value ''`.

Expected A: production middleware verifies actual Auth0 RS256 signature, issuer/JWKS, audience and expiry; profile **200**; contributor access/PATCH **403**. Repeat using fresh B token:

```powershell
$env:IDENTITY_ACCEPTANCE_EXPECT = 'contributor'
pnpm.cmd -F backend identity:verify-live
Set-Clipboard -Value ''
Remove-Item Env:IDENTITY_ACCEPTANCE_EXPECT
```

Expected B: native `auth0-permissions` source and actual team PATCH **200**. The probe re-saves the exact public presentation; coordinate against concurrent editing. No fallback grant is enabled. Token files, command arguments and redirected/piped input are refused. A valid token PASS checks its actual signature/issuer/audience/expiry; automated local-key negative tests separately cover forged, malformed, expired, wrong-audience/issuer tokens. A corrupted real-token payload is not evidence of a legitimately issued wrong-audience token. Do not create another API merely for this test.

## 8. Stop, restart and persistence

Finish active saves/Motion/voice first, then Ctrl+C in the launcher terminal. Both services should stop. On Windows the launcher targets only its own active service process trees with native `taskkill /T /F`; PostgreSQL remains running. The CI IPC shutdown exercises the same cleanup, while interactive console Ctrl+C still needs this owner check.

```powershell
Get-NetTCPConnection -LocalPort 5173,8787 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess
docker restart flow-identity-postgres
docker exec flow-identity-postgres pg_isready -U postgres
# Once accepting connections, in the original terminal:
pnpm.cmd identity:acceptance
```

No 5173/8787 listeners should remain after stopping. A new terminal needs the same local `$env:DATABASE_URL` assignment again. Log A in and verify saved fields/photo. Optional privacy-safe aggregate check:

```powershell
docker exec flow-identity-postgres psql -U postgres -d flow_identity -c 'SELECT count(*) AS accounts, count(avatar_bytes) AS avatars FROM flow_accounts'
```

To finish for the day, `docker stop flow-identity-postgres` preserves the named volume; restart later with `docker start flow-identity-postgres`. Never use `docker volume rm`, `docker rm -v` or `docker compose down -v` as troubleshooting. No account cleanup/deletion is automated. Remove only stale `IDENTITY_ACCEPTANCE_TOKEN_FILE` environment settings from the earlier guide; new bearer-token files are never created.

## 9. Troubleshooting and native PostgreSQL alternative

| Failure | Safe next action |
|---|---|
| `pnpm` blocked | Use `pnpm.cmd` or `corepack.cmd pnpm@12.18.0`; inspect PATH in a new terminal. Keep execution policy intact |
| 5173/8787 conflict | Inspect `Get-NetTCPConnection` and `Get-Process -Id` for the returned owned PID. Close its original terminal. Never kill every Node process or let Vite silently pick another callback port |
| Docker not responding | Open Desktop, select Linux containers and wait for the engine. The Node app needs no WSL shell; use existing native PG17 instead if virtualization/Desktop is unavailable |
| Callback mismatch | Existing Auth0 app → Settings → Application URIs: exact callback/logout `http://localhost:5173/`, web/CORS origin `http://localhost:5173`. Check that the browser uses that origin |
| Login works, API 401 | Use an access token, not ID token; correct API audience, issuer, RS256, fresh expiry, Authorization forwarding and both Node transport preflights. Never bypass the guard |
| Profile 503 / migration failure | PostgreSQL readiness, local URL/port/database, app role schema/table privileges, migration, connection limits. Do not substitute fake profile data |
| Avatar failure | Valid owned format/size, current auth, crop decoding, PUT response and PG write privileges; retain visible error rather than claim a saved image |
| Passkey missing | Actual device/screen lock/browser support plus the existing connection's Identifier First/passkey enrollment policy. Mark unperformed enrollment pending |
| Refresh loses session | Record cookie/privacy behavior and supported silent SDK recovery. Reconnect safely; do not change tokens to insecure persistent storage |

For **existing native PostgreSQL 17 on Windows**, use its installed `psql.exe` from the operator's known installation path. Keep it listening only locally. Open `psql -h 127.0.0.1 -U postgres -d postgres -W` and privately enter the admin password. At the **psql** prompt (not PowerShell):

```text
CREATE ROLE flow_identity_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
\password flow_identity_app
CREATE DATABASE flow_identity OWNER flow_identity_app;
\q
```

The password command prompts privately twice. In PowerShell, construct the runtime URL without showing the password or writing it to a file/history:

```powershell
$flowSecret = Read-Host 'Local flow_identity_app password' -AsSecureString
$flowPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($flowSecret)
try {
  $flowPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($flowPtr)
  $env:DATABASE_URL = 'postgresql://flow_identity_app:' + [Uri]::EscapeDataString($flowPassword) + '@127.0.0.1:5432/flow_identity'
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($flowPtr)
  Remove-Variable flowPassword -ErrorAction SilentlyContinue
  $flowSecret.Dispose()
}
pnpm.cmd identity:acceptance
```

Do not echo `DATABASE_URL` or dump environment values. After stopping the app, `Remove-Item Env:DATABASE_URL` removes that terminal's copy. Native service installation/startup is managed by its existing installer/operator; the launcher does not change Windows services or firewall rules.

## 10. Rehearsal and acceptance record

Record status/time/device only: PASS (real external service/device), LOCAL PASS, AUTOMATED PASS, BLOCKED, FAIL, or NOT TESTED. Do not attach tokens, subject IDs, mail links, photos or private transcripts. The final report contains the complete feature matrix and the 90-second verified-only fallback; the live login/profile/RBAC script is conditional on this guide actually passing. Production HTTPS, durable DB backups/restore, production Google/email settings and device PWA testing remain separate release gates. A localhost acceptance build must not be deployed publicly.
