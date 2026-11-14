# FLOW Voice — integration and verification

## A. Repository audit

Baseline: `feature/unihack-final-integration` at `f142c73255031771787799dc309d8e9e0a195bdc`.
This branch contains the validated HeiGIT integration and the existing parking-first planner,
SmartMatch, complete journeys, MapLibre, GPS/DEMO navigation and parking-full confirmation flow.
Work is isolated on `feature/flow-voice-elevenlabs`; no other feature branch was merged or edited.

Integration map:

| Capability | Reused location | Change | Verification |
|---|---|---|---|
| Planner/preferences | `App.tsx`, `GreenSwitch.tsx`, `useCompleteJourneys.ts` | One controlled planner shared by manual and voice actions | Existing Smart Journey browser suite + voice harness |
| Journey orchestration | `POST /api/journeys/complete`, `completeJourneys.ts` | Existing service and response validation retained | Existing service tests; real HeiGIT calculation |
| Place resolution | Shared destination search/index and municipal/OSM catalog | Reject ambiguity; return candidate labels | Tool/browser cases |
| Map selection | `MapView.tsx`, journey layers | Comparison/journey tags; loaded source/layer acknowledgement | Actual MapLibre with synthetic routes and blank test style |
| Navigation | `useNavigation.ts`, `geometry.ts` | Revision-bound speech events and one audio owner | Speech unit tests; navigation browser suite |
| Provider security | Express, Zod, existing CORS/rate-limit conventions | Private token/TTS proxy; immutable agent version | HTTP tests, bundle/source inspection |

## B. Functionality and evidence boundaries

The implementation registers all four exact client tool names. Inputs are strict Zod objects;
unknown fields, malformed text, invalid modes/priorities and walking limits outside integer 0–180
are rejected. Every callback returns a JSON-stringified success/error envelope. The official SDK
correlates that result with `tool_call_id`; the installed client implementation was inspected.

The existing parking settings are authoritative for stay/arrival/walking and parking preference.
The planner owns journey ranking and temporary comparison mode. A cheaper follow-up changes the
priority without replacing destination or walking limit. Cycling in `compare_journeys` is temporary;
`update_journey_preferences.journey_mode` explicitly changes the preference.

Voice comparisons filter the entire walking component, preserve unknown tariffs as null, include
all movement legs in duration, and disclose unknown parking search/manoeuvring time. Results include
provider provenance and explicit limitations; no live occupancy, traffic or physical accessibility
is inferred. Coordinates and geometry stay local to the application/tool implementation.

Session-bound callbacks, revision checks, bounded handlers, AbortControllers and in-flight
deduplication prevent terminated or superseded operations committing. Selection requires a current
comparison and refuses route replacement during navigation. A missing map acknowledgement returns
`map_highlighted: false`, even when the selection itself persists.

Automated routing fixtures are only in test files/harnesses. They are not application LIVE data.
Passing a mocked SDK test does not establish a real microphone, WebRTC or audio connection.

## C. ElevenLabs connection

- Agent: `agent_8701m7dvvhhyexj9771tqawz23vm`.
- Configuration branch: `agtbrch_7201m7dvvk3heh2rcra471qb03ms`.
- **Server-pinned target version:** `agtvrsn_7001m7dwanv7fe385wxb8f4zbc6c`.
- Mirela: `neZC2DQ42NvDV1SyoMxN`; conversation model `deepseek-v41-flash`;
  conversational TTS `eleven_v4_turbo`.
- SDK: `@elevenlabs/react` 1.22.1 / client 1.36.1, installed and typechecked.
- `POST /api/flow-voice/session` accepts only `{}` and requests
  `GET /v1/convai/conversation/token?agent_id=…&version_id=…` server-side.
  The request specifies the immutable version rather than a branch or deployment split.
  Connected-session version verification remains open; see the live follow-up in section F.
- Response is `{ conversationToken, agentVersion }`; the client also validates the expected version.
  Tokens remain in memory and responses use `Cache-Control: no-store`.
- One `ConversationProvider`, granular controls/input/mode hooks, explicit permission/start,
  connection timeout, stop/retry, independent microphone/output mute and route/unmount cleanup.
  Output is muted and the old raw session is closed before navigation speech takes ownership.

Read-only connector inspection confirmed this exact branch/version, all four tools, authentication
and the privacy settings: audio recording false, retention 0 days, scheduled transcript/PII and audio
deletion true. `zero_retention_mode` is false: 0-day scheduled retention must not be described as
enterprise Zero Retention Mode. The agent, its tools and retention configuration were not modified.

Official references checked:

- [WebRTC token parameters](https://elevenlabs.io/docs/api-reference/conversations/get-webrtc-token)
- [React SDK](https://elevenlabs.io/docs/eleven-agents/libraries/react)
- [HTTP speech synthesis](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)

## D. Navigation voice

The existing geometry/progress engine generates the instruction and decides its timing. Preparation
and immediate thresholds adapt to speed and maneuver distance; poor/stale GPS suppresses precise
guidance. Every event carries a navigation session, route revision, step, phase and expiry. The audio
owner rechecks those values before playback, deduplicates phases and cancels playback/synthesis on
route/step changes, pause, mute, hidden page and stop. An immediate instruction supersedes preparation.
The last valid instruction can be replayed through the same owner.

Turn/straight/roundabout templates, recalculation, final/parking arrival and the existing synthetic
parking-full offer use this owner. Parking-full changes still require the existing explicit acceptance.
Walking remains the existing planner handoff; this change does not manufacture pedestrian guidance
or autonomously navigate that leg. Roundabout exit numbers are not invented when absent from route data.
After parking arrival, a walking-duration announcement is allowed only when the authoritative planner
still holds a matching parking and a walking leg with validated geometry/metrics. Expiry is checked
when context is read, including when no further GPS/React update occurs.

Navigation uses the separate HTTP model `eleven_flash_v2_5`, Romanian language code and Mirela.
The server bounds synthesis time/concurrency/size, caches at most 32 clips for 15 minutes by
voice/model/language/text, and requests `enable_logging=false`. That option requires an eligible
provider account; unsupported accounts safely fall back. The browser warms the upcoming immediate
phrase and uses browser speech if no clip is ready within the playback budget. The live follow-up
generated real RO/EN clips and exercised navigation playback; subjective voice quality still needs
listening tests. No pre-generated phrase library is shipped.

Conversation output is not automatically restored after navigation takes ownership. Explicit restart
is required, avoiding buffered conversation replay. Device audio-volume/teardown latency still needs
iOS/Android verification. Browser speech availability, pronunciation and processing depend on the OS.

## E. Interface and accessibility

The planner uses an inline FLOW Voice card; navigation uses a compact version integrated with existing
controls. Dynamic navigation-panel height keeps DEMO controls above the trip panel. Controls have
44px touch targets, keyboard labels/focus indicators, textual connection/listening/speaking/muted/error
states and independent mute actions. Animation respects reduced motion; input opacity uses real VAD
events, not a fake microphone waveform. The privacy page documents audio/context/TTS processing.

## F. Verification

Run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
PLAYWRIGHT_MODULE=/path/to/playwright node scripts/test-flow-voice-browser.cjs
PLAYWRIGHT_MODULE=/path/to/playwright node scripts/test-flow-voice-session-browser.cjs
PLAYWRIGHT_MODULE=/path/to/playwright node scripts/test-smart-journey-browser.cjs
PLAYWRIGHT_MODULE=/path/to/playwright node scripts/test-navigation-browser.cjs
```

Use the normal `pnpm dev` server for browser tests; `CHROMIUM_PATH` can select an installed Chromium.
The voice harness exercises the actual planner hooks and MapLibre with synthetic routing fixtures.
The session suite explicitly replaces the SDK and token service to check lifecycle/mutes/cleanup.
The existing suites check the manual planner and GPS/DEMO behavior. There is no repository lint script
or configured CI directory; no lint/CI success is claimed.

Implementation-stage results (historical; the live follow-up below lists the checks rerun on
`ee151175`):

| Check | Observed result |
|---|---|
| `pnpm typecheck` | Passed all three packages; final frontend build also typechecks the final hook changes |
| `pnpm test` | 236 passed: shared 69, backend 95, frontend 72; final frontend tests repeated after the last planner changes |
| `pnpm build` / final `pnpm -F frontend build` | Passed; PWA shell prepared with 27 build assets |
| FLOW Voice browser harness | Passed: real planner/MapLibre, synthetic routes; session ID renewal, context/limits/cheaper/bicycle, map true/false, stale/manual/closed-session cases, permission/keyboard/mobile |
| FLOW Voice session browser suite | Passed with mocked SDK and synthetic token; start/stop/restart, independent mute, speaking/listening, old callbacks and route cleanup |
| Existing Smart Journey browser suite | Passed, including 360–1440 layouts, manual planner/map, no redundant ranking requests and Motion handoff |
| Existing navigation browser suite | Passed, including GPS mocks, off-route rerouting/cooldown, DEMO pause/restart/arrival, mobile controls and cleanup; no physical GPS/audio claim |
| Production browser suite | Passed compiled-app/deep-link/PWA checks, public-only cache, unavailable-provider path and synthetic journey/Motion flow; 0 cached API responses |
| Bundle/source inspection | No available environment secret value or voice test harness/synthetic token in frontend output; no application token/transcript storage/logging |
| Actual voice-session endpoint without key | 503 `SERVICE_UNAVAILABLE`, while planning remains available |

Vite reports its normal >500 kB chunk warning for the map and voice engines. They are separate cached
chunks (map approximately 802 kB; voice approximately 661 kB before compression). The build passes;
this is not a claim that cold-start performance on low-end phones was measured.

A real backend request to the existing complete-journey service returned three car+parking+walking
options, one walking route and one cycling route, with HeiGIT/openrouteservice provenance, in **1.315 s**
for that one request. This is API response time, not voice latency or a performance guarantee. The voice
adapter applies the walking constraint to those validated results. No live occupancy was tested or inferred.

### Live follow-up — 2026-11-15 (Europe/Bucharest)

Tested source: `ee1511751b73ea4499b29b452c2735b4108a3535` on
`feature/flow-voice-elevenlabs`, confirmed against the remote before testing. Only this report was
changed. The existing integration, dependencies and ElevenLabs agent were not edited or recreated;
no merge or deployment was performed.

The managed environment now reports `ELEVENLABS_API_KEY` ready as an HTTP secret scoped to
`api.elevenlabs.io`, with that host allowed. The key was used through its existing binding, without
printing it or copying it into a file. The unmodified app ran with `NODE_USE_ENV_PROXY=1 pnpm dev`
(Node 24.22.1; available pnpm 11.25.0; frozen-lockfile install, unchanged lockfile).

| Live check | Observed result |
|---|---|
| Direct authenticated token request | HTTP 200 in 430 ms; nonempty token and conversation ID. Neither value was logged or committed. |
| Existing `POST /api/flow-voice/session` | HTTP 200 in 337 ms, `Cache-Control: no-store`; nonempty `conversationToken` and the expected `agentVersion`. Browser startup also received HTTP 200 from this endpoint. |
| Version request validation | The current provider OpenAPI advertises `version_id`. A nonexistent version was rejected with HTTP 404 `version_not_found`; the configured version was accepted. See the runtime-version qualification below. |
| Existing `POST /api/flow-voice/speech`, Romanian turn | HTTP 200, `audio/mpeg`, `no-store`, 57,721 bytes, 3.579 s; response in 275 ms. |
| Same endpoint, Romanian place names | HTTP 200, 92,412 bytes, 5.747 s; response in 343 ms. Text includes Gara de Nord, Bulevardul Take Ionescu and Calea Șagului. |
| Same endpoint, English turn | HTTP 200, 55,213 bytes, 3.422 s; response in 266 ms. Text includes Piața Victoriei. |
| Repeated Romanian turn | HTTP 200 in 5 ms; SHA-256 identical to the first backend clip, confirming the existing process cache. |
| Audio decoding/signal | All three backend clips decoded successfully with FFmpeg: MP3, 44.1 kHz, mono. Mean levels: RO turn −18.4 dB, RO places −18.2 dB, EN turn −16.7 dB; all have nonzero audio. |
| Real navigation playback | An isolated Playwright probe imported the unmodified `navigationSpeech` module, warmed the real backend clip and triggered `announce` from a test button. The actual `HTMLAudioElement` emitted `playing` and `ended` at 3.529 s. No speech fallback or provider/SDK mock supplied this clip. |
| Navigation mute during real playback | A second playback was active at 0.209 s. Muting the arbiter paused the player, removed its source, cleared the current instruction and settled playback without an `ended` event. The synchronous cancellation call took 0.8 ms in this probe; this does not measure acoustic output-buffer latency. |
| Real SDK WebRTC attempt | **Blocked by the environment proxy.** `wss://livekit.rtc.elevenlabs.io/rtc/v1` failed to establish a tunnel; `/rtc/v1/validate` failed with `net::ERR_TUNNEL_CONNECTION_FAILED`. No connected peer/remote audio track was observed. |
| Application error state | The voice card displayed “Conexiune indisponibilă”, the retry/start control and “Conexiunea vocală s-a întrerupt. Poți reîncerca.” |
| Targeted regression checks rerun | Backend `flowVoice.test.ts`: 5/5 passed. Frontend `speech.test.ts`: 14/14 passed. Full build/test/browser suites above were not rerun in this documentation-only follow-up. |

Speech requests used the existing Mirela voice, `eleven_flash_v2_5`, explicit `ro`/`en` language and
`enable_logging=false`; no fallback request changed that option. The Romanian turn was
“În două sute de metri, virează la dreapta spre Piața Victoriei.” The first backend clip's SHA-256 was
`c3b161e77443a9000e9d0390b9c32464b96188c1937f274b3e6883221bf98778`.
These timings are individual local/backend observations, not end-to-end voice latency guarantees.
FFprobe container duration and browser decoded playback duration differ slightly for MP3.

Read-only ElevenLabs connector inspection again confirmed the exact configured branch/version,
Romanian, `deepseek-v41-flash`, Mirela, `eleven_v4_turbo`, authentication and the privacy settings
in section C. Request-side version selection is verified, but an issued token's decoded metadata
contained `version: null`, the configured `branch_id`, and a signed URL with a branch parameter.
This observation alone does not establish which version a connected conversation executes.
The backend's `agentVersion` field is its own declared target, not independent runtime attestation.
Confirm the executed version on a connected conversation once signaling works.

The browser used a Chromium-provided silent synthetic microphone device to reach the real SDK
transport; it did not mock `getUserMedia`, the SDK or token issuance. Navigation events in the
audio probe were explicitly synthetic scope/step events, not live GPS or a real journey. Playback
events establish browser playback of provider audio, not human listening or physical speaker output.
Microphone barge-in and conversation-to-navigation audio handover remain unverified because no
conversation connected. Generated clips, screenshots and diagnostic scripts were kept outside the
repository; no token, signed URL, private key or transcript was saved in the report.

The environment's enforced allowlist includes `api.elevenlabs.io` but not
`livekit.rtc.elevenlabs.io`. An independent HTTPS request to the latter also failed at CONNECT with
HTTP 403. This is a network-policy blocker before any upstream HTTP response, so it is **not evidence
of the `/rtc/v1` compatibility 404** described in section G. No LiveKit override was applied
(`livekit-client` remains 2.24.0). Allow the observed signaling host in the running environment,
then retry and verify any additional signaling/media/ICE destinations required by the actual session.
The API-key secret should remain scoped to `api.elevenlabs.io`.

## G. Setup and security

Required backend settings: `ELEVENLABS_API_KEY` for voice, `ORS_API_KEY` for the configured preferred
routing service, `CORS_ORIGINS` containing the exact frontend origin and `API_PORT` as in `.env.example`.
Managed Node environments may need `NODE_USE_ENV_PROXY=1`. No secret uses a `VITE_` variable.

FLOW currently has no user accounts. Voice endpoints require an allow-listed browser `Origin`, JSON
body and `X-Flow-Voice: 1`, with IP rate limits, process-wide concurrency and provider timeouts.
These are browser-origin/abuse protections, **not authenticated user identity**; non-browser callers
can spoof an Origin. Restrict exposure or add deployment authentication if the deployment needs it.
Keep the existing Caddy trust boundary and exact production CORS origin configuration.

Allow the backend to reach `api.elevenlabs.io`. Browser WebRTC additionally needs ElevenLabs/LiveKit
signaling, media and ICE connectivity. Test on the target network. If LiveKit reports `/rtc/v1` 404 or
`v1 RTC path not found`, the ElevenLabs skill documents a temporary `livekit-client: 2.16.1` override;
the checked-in current dependency has not been silently downgraded without a live compatibility test.

## H. Git delivery

Repository: `Vlaiq/VlaiqFlow`; feature branch: `feature/flow-voice-elevenlabs`.
The final delivery message supplies the exact commit and remote verification. Main is not merged or pushed.
The commit diff is the authoritative changed-file list: backend proxy/tests/env; shared contracts/limits;
planner/map/navigation/privacy integration; voice modules and unit/browser tests; SDK lockfile/build chunks;
this guide and third-party notices. Generated build assets and test screenshots are not committed.

## I. Competition demo

1. Configure the backend secrets/origin and network access above, install packages, then run `pnpm dev`.
   Production uses HTTPS and the existing Caddy/backend deployment; this task does not deploy it.
2. Open Explore and use the existing **Încearcă DEMO** action to choose the fixed departure/arrival
   scenario without requesting GPS. All DEMO displacement and parking-full events remain labelled.
3. Press **Pornește FLOW Voice**, permit the microphone, and ask:
   “Vreau la Piața Victoriei și maximum cinci minute pe jos.” Resolve any real catalog ambiguity.
4. Ask “Vreau ceva mai ieftin”, then “De ce ai ales varianta asta?” Verify destination/walking limit,
   actual costs/unknowns, total versus walking duration, and the resulting visible comparison.
5. Ask “Prefer bicicleta” for a temporary cycling comparison. No route is invented if unavailable.
6. Return to a valid car comparison, select it and use the existing navigation action. Start **DEMO**
   movement, explicitly enable navigation speech (the navigator starts muted), and observe valid turns.
7. Use **Simulează: parcarea s-a umplut** when a backup exists. Accept the switch; verify old audio
   stops and new route guidance matches. On parking arrival use the existing walking handoff/planner.
8. Disconnect/revoke microphone or network access and verify manual planning remains usable.

## J. Remaining external verification

The earlier missing-key/API-access blocker is resolved: live authenticated token issuance, Mirela
HTTP synthesis, browser navigation playback and navigation mute cancellation are verified in section F.
**A real WebRTC conversation and end-to-end spoken commands remain unverified** because the current
environment blocks the observed LiveKit signaling host. Restore that connectivity before assessing
transport compatibility, connected-session version, real client-tool calls or conversation audio.

Still required: human Romanian/English listening (Piața Victoriei, Gara de Nord, Bulevardul Take Ionescu,
Calea Șagului), a physical microphone/speaker session, microphone interruption, conversation/navigation
handover, real spoken-command/comparison latency, iOS/Android autoplay/volume teardown and
foreground/background GPS tests. A desktop-sized or mobile-sized Chromium viewport is not
physical-device verification. The app must not be presented as certified navigation.
