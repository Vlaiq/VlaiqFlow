# Bega Green Spine: future visualization handoff

This document specifies a proposed integration into the existing Smart Journey and MapLibre view. No frontend integration is implemented by this mission. Keep one mounted map, one comparison panel, and the existing Motion handoff.

**Current geographic gate: BLOCKED.** The committed production corridor snapshot has `metadata.status: "blocked"` and no features because live source retrieval failed. The engine returns `data_unavailable`; production must show that state. Synthetic test geometry must never reach production sources, screenshots presented as live evidence, or route cards. Rendering becomes eligible only after a legitimate snapshot and live provider route pass the acceptance gates in [bega-green-spine.md](bega-green-spine.md).

## 1. Data and selection boundary

The response contract is `shared/src/schemas/bega.ts`. Parse future HTTP responses with `BegaResponse` before updating the map or card. A Bega request concerns one explicit origin, destination, and `walk | cycle` mode. Reuse the backend's validated baseline of the same mode; browser input must not establish trusted provider provenance.

Only `status === "available"` permits a selectable Bega alternative. The map consumes the same response object as the comparison card. Selecting the baseline or alternative changes presentation without another provider request. Changing origin, destination, mode, or detour constraints invalidates the previous response immediately; cancel its request and guard against out-of-order completion.

Do not put the multipart alternative into a `NavigationRoute.geometry` or an existing single-leg `CompleteJourney` through concatenation. Existing complete-journey geometry is a LineString, whereas this contract retains three provider geometries. Keep Bega analysis alongside the selected active CompleteJourney until a later shared-contract change explicitly supports multipart routes. Reuse baseline metrics from the validated result rather than maintaining separate editable copies.

## 2. Three proposed GeoJSON sources

These source and layer identifiers are proposed names, not existing exports. Use `addSource` once per style and `GeoJSONSource.setData()` on selection changes. Set source `tolerance: 0` for these bounded route features when precise corridor alignment is needed; preserve all original coordinates in application data. An unavailable source is an empty FeatureCollection, never a placeholder route.

| Proposed source ID | GeoJSON | Exact input | Presentation properties |
|---|---|---|---|
| `flow-bega-baseline` | FeatureCollection containing one LineString | `response.baseline.geometry` in original order | `role: "baseline"`, `mode`, `selected` |
| `flow-bega-alternative` | FeatureCollection containing one MultiLineString | `response.alternative.geometry` unchanged | `role: "bega"`, `mode`, `selected` |
| `flow-bega-overlap` | FeatureCollection of LineStrings | `response.alternative.overlap.features` | Preserve each `osmIds` and `infrastructureTypes` array |

Set visible source attribution to `© OpenStreetMap contributors`. Retain the routing provider attribution required by the actual adapter, including the existing FOSSGIS "fix the map" link when applicable. Source metadata describes OSM-contributed mapping and provider estimates, not municipal verification.

The alternative's three coordinate arrays correspond to origin→entry, entry→exit, and exit→destination. Preserve array boundaries even when endpoints happen to coincide. Do not flatten, interpolate, smooth, or add a line across `joinGapsMeters`. The engine discloses any accepted sub-meter numerical gaps; those gaps remain undrawn. A fit-bounds calculation may iterate every position, but it does not create new movement geometry.

The overlap source contains clipped portions of the **routed geometry** matched to eligible infrastructure. It is neither a canal centerline nor the complete OSM dataset. Highlight only these features. Never color the entire alternative as verified corridor merely because it visits an entry anchor. Each `osmIds` value identifies the contributing mapped way; multiple matching ways do not imply multiple traversals or extra measured distance.

The renderer may derive a scalar `displayInfrastructure` property for filtering: use the one returned type when there is exactly one, and `multiple` when several types contributed. `multiple` is a presentation label only. Do not infer a protected lane from either `cycling_path` or shared use. Keep the original arrays for source details.

## 3. Layer order and mode treatment

Insert route layers above the basemap's roads and below route endpoint controls and essential labels. Coordinate ordering with the existing `flow-journey-*` layers so that one active comparison is emphasized at a time. Avoid drawing the same active baseline twice through the existing complete-journey source and the Bega source.

| Proposed layer ID | Source | Purpose |
|---|---|---|
| `flow-bega-baseline-casing` | baseline | Narrow theme-aware outline for legibility |
| `flow-bega-baseline-route` | baseline | Secondary ordinary route when Bega is selected |
| `flow-bega-alternative-casing` | alternative | Theme-aware outline around provider geometry |
| `flow-bega-alternative-route` | alternative | Prominent selected Bega route |
| `flow-bega-overlap-casing` | overlap | Thin contrasting boundary around measured overlap |
| `flow-bega-overlap-route` | overlap | Distinct highlight of mapped corridor use |
| `flow-bega-overlap-hit` | overlap | Transparent wider hit target for source inspection |

Use the established theme palette from `frontend/src/styles/tokens.css`, `docs/themes.md`, and current journey layer colors. Resolve CSS semantic colors into MapLibre paint values for Forest Night and Mist Day; do not introduce a second token system. Emerald/teal emphasis is appropriate only if readable against both actual basemaps. Keep primary-button foreground dark as required by existing tokens.

Suggested starting widths are 3 px baseline / 5 px selected alternative / 6 px overlap at normal planning zoom. Treat these as values to validate in integration, not measured accessibility guarantees. Reduce the baseline opacity while retaining enough contrast to compare it. A subtle static casing is sufficient; a glow is optional and must not obscure paths or intersections.

Walking retains the existing dashed route language; cycling remains solid with a bicycle label in the card and legend. The highlighted corridor uses a contrasting border plus an explicit text legend so route state and mode are understandable without color. For `unknown` infrastructure show "Infrastructură cartografiată · tip necunoscut" in details. `shared_use_path` means mapped permission for both modes, not segregated lanes. No shield, safety, pollution, wheelchair, or official-approval icon may be inferred from these properties.

The transparent hit layer should cover a practical touch area without an opaque line. On overlap selection, show the mapped type and OSM references in the existing sheet/details region; avoid popups that hide the destination or comparison controls. Do not intercept map gestures across the entire canvas.

## 4. Map lifecycle, camera, and motion

Keep `MapView` mounted. Reuse the existing `mapRef`, `styleRevision`, `style.load` handling, `visibleMapPadding()`, and panel `ResizeObserver` pattern. Reinstall Bega sources/layers after a theme style reload, then restore current selection with `setData`. Register handlers once per layer installation, remove handlers on cleanup, cancel pending animation frames, and never accumulate duplicate listeners.

On explicit Bega selection, frame all three original provider segments, with baseline bounds included when the user chooses comparison view. On "Vezi porțiunea de lângă Bega", frame the returned overlap features. Entry and exit references may use existing marker facilities; they are mapped path nodes, not surveyed accessible entrances.

Compute camera padding from the actual search controls, desktop sidebar, mobile sheet, safe areas, and bottom navigation. Refit on meaningful panel resize and explicit route selection; do not repeatedly recenter on background rerenders or steal the map after a user pans. The existing `maxZoom: 16` overview / `17` detail behavior is a suitable starting point. Call `map.stop()` before replacing an active camera transition.

Honor `prefers-reduced-motion` dynamically: camera duration zero, no decorative glow pulses or route-drawing animation. Otherwise use one short interruptible emphasis/camera transition consistent with the existing 650 ms camera movement. Never animate a line extending through unreturned or disconnected geometry. Route choice, source details, and all metrics remain available with animation disabled.

## 5. Comparison card and source disclosure

Place an expandable contextual Bega option inside the current active Smart Journey comparison. Do not create a separate Bega screen. Preserve the ordinary route and user-selected mode. A selectable card includes:

- Mode and selected state, with keyboard-focusable "Ruta obișnuită" / "Prin coridorul Bega" controls.
- Provider-estimated total duration and distance for both routes.
- Signed additional time and distance, measured mapped-corridor length, and corridor share.
- "Estimat" and "OpenStreetMap" text badges; a source-details disclosure.
- The response's deterministic Romanian `explanation`, with no added environmental claim.

Use raw units for comparisons and round only for display:

`deltaTimeSeconds = alternative.durationSeconds − baseline.durationSeconds`

`deltaDistanceMeters = alternative.distanceMeters − baseline.distanceMeters`

`corridorShare = alternative.corridorMeters / alternative.distanceMeters`

Positive time means "în plus"; negative time means "mai puțin"; exact zero means the same calculated time. For a nonzero difference below one displayed minute, use "sub un minut în plus/mai puțin" rather than zero or an invented saving. For larger differences use one documented rounding rule and "aproximativ"; offer exact seconds in expanded details. Do not subtract separately rounded minute totals. Format distances and percentages with `ro-RO`; e.g. kilometres to one decimal and share to a whole percent, while details retain raw values. A rounded share is an approximation, not a precision claim.

Source details display `integrity.routingProvider`, `dataSources`, `corridorSnapshotDate`, `corridorSnapshotVersion`, `calculatedAt`, assumptions, limitations, entry/exit node references, and actual matching `osmIds`. Display user-facing dates in `Europe/Bucharest` and preserve the original ISO timestamp in details. A null snapshot date remains "Data snapshot-ului OSM: necunoscută"; never substitute the request timestamp. Preserve ODbL attribution and link to OSM copyright. Construct way-history links only from validated `way/<numeric ID>` references. Do not start background source fetches or route-location telemetry when details open.

Explain the three evidence levels plainly: OSM contributor mapping, provider-estimated metrics, and derived geometric overlap. No field establishes current surface condition, lighting, physical safety, universally permitted access, or wheelchair accessibility. Do not translate corridor length into pollution reductions, avoided emissions, air-quality rankings, or a green score.

## 6. Loading, empty, failure, and cancellation states

| State | Map behavior | Contextual Romanian message/action |
|---|---|---|
| No explicit origin/destination | Existing map state | Ask for the ordinary explicit origin flow; no Bega request |
| Loading | Keep current valid ordinary route; clear superseded Bega overlays | "Verificăm o alternativă pe lângă Bega…"; `aria-busy`, cancellable request |
| `available` | Enable comparison and measured overlap | Use validated metrics and response explanation |
| `not_relevant` | No Bega overlay | "Nu am identificat o alternativă practică pe lângă Bega pentru acest drum." |
| `no_valid_alternative` | No Bega overlay | "Nu am găsit o alternativă conectată cu un ocol acceptabil." |
| `provider_unavailable` | Keep independently valid ordinary route | "Nu putem verifica alternativa acum."; explicit retry, no polling |
| `data_unavailable` | No Bega overlay | "Datele verificabile pentru coridorul Bega nu sunt disponibile momentan." |
| Invalid HTTP/schema response | Clear the affected Bega selection | "Nu putem verifica răspunsul primit."; ordinary planner remains usable |
| User cancels/supersedes | Clear loading without stale updates | Do not announce a cancelled request as a new route error |

Use the service response explanation where available; the examples above specify presentation intent. Technical `reason` codes support controlled diagnostic mapping and should not appear as raw errors to users. Never show a disabled Bega card as if a geometry exists, and do not replace provider failure with a straight line. A null baseline in a Bega failure does not erase an independently validated ordinary CompleteJourney.

## 7. Touch, responsive behavior, and accessibility

Use the existing `BottomSheet`, `AppCard`, `AppButton`, `IconButton`, `QualityIndicator`, and source disclosure patterns. Controls need visible focus, accessible names, and recommended touch targets of at least 44 CSS px. Selection uses `aria-pressed` or an appropriate single-selection pattern; announcing a metric update must not move keyboard focus to the map. Keep source/legend information in readable DOM content, not solely canvas tooltips. Announce loading completion or failure through a polite live region once, without narrating every map update.

| Layout to verify later | Required behavior |
|---|---|
| Small Android, 320–360 CSS px | Two-line metric wrapping, full-width controls, sheet scroll, no horizontal overflow; map locate/zoom still reachable |
| iPhone Safari, 375–430 CSS px | Account for `env(safe-area-inset-bottom)` and dynamic viewport height; sheet controls above browser/bottom navigation; portrait and landscape |
| Tablet, approximately 768 CSS px | Keep contextual sheet/sidebar consistent with shell breakpoint; usable touch targets and visible map comparison |
| Desktop, approximately 1280–1440 CSS px | Existing sidebar holds comparison; camera padding accounts for its actual width; complete keyboard operation |

Test browser text zoom to 200%, both themes, long Romanian/provider/source strings, denied GPS, absent network, slow routing, interrupted selection, theme reload, and reduced motion. A map path's accessible equivalent is the textual route/mode/metrics/source summary. Avoid placing explanatory paragraphs over the only usable map interaction area. Physical Android/iOS verification is still a future task; this handoff makes no claim that it occurred.

## 8. Proposed callbacks and ownership

The following is an illustrative future UI contract, not implemented API:

```ts
type AvailableBega = Extract<BegaResponse, { status: 'available' }>;
type BegaMapSelection = {
  response: AvailableBega;
  selected: 'baseline' | 'bega';
  inspect: 'route' | 'corridor';
};

// Planning hook: AbortSignal + request identity protect stale responses.
requestBega(input: BegaRequest, signal: AbortSignal): Promise<BegaResponse>;
// Selection changes only map/card state, never starts another routing request.
onBegaSelection(selection: BegaMapSelection | null): void;
onInspectBegaSource(osmIds: string[]): void;
// Reuse the existing callback after explicit user activation.
onStartActivity(mode: 'walk' | 'cycle', journey?: ActiveJourneyContext): void;
```

Prepare `ActiveJourneyContext` with a stable selected-plan ID, mode, the current destination ID/name, selected route distance/duration/source, and calculation timestamp. Validate it with the existing schema. This is a planned summary; selecting Bega does not start GPS, override an ongoing activity, submit a recording, award Motion coins, or alter wallet/reward rules. Preserve any current activity exactly as the existing shell does.

Backend composition belongs to the integration agent: call `createBegaEngine` with the approved injected active-routing adapter and legitimate dataset; reuse the server-side baseline; propagate cancellation where supported; expose only the parsed Bega contract. Keep credentials/backend policies out of these callbacks.

## 9. Exact future integration files

These files are intentionally untouched by this mission. Apply reviewed changes later:

| File | Future responsibility |
|---|---|
| `backend/src/index.ts` | Register a proposed isolated Bega endpoint, body/rate limits, no-store response behavior, and cancellation lifecycle |
| `backend/src/services/completeJourneys.ts` | Optional server-side baseline reuse and orchestration hook; preserve existing categories/rankings |
| `shared/src/index.ts` | Optional exports for the new Bega schemas/types; direct imports work before this change |
| `shared/src/schemas/completeJourney.ts` | Only if the integration deliberately versions the response to carry Bega analysis or multipart geometry; not required for a separate companion response |
| `frontend/src/services/api.ts` | Typed proposed Bega request method and strict response validation, if this is the chosen API client boundary |
| `frontend/src/features/journey/useCompleteJourneys.ts` | Optional companion request orchestration or a new adjacent isolated hook; cancellation/stale-response handling |
| `frontend/src/features/journey/GreenSwitch.tsx` | Contextual Bega option, comparison metrics/source disclosure, selected route/activity callbacks |
| `frontend/src/features/map/journeyLayers.ts` | Proposed GeoJSON conversion helpers and coordinated active-baseline visibility |
| `frontend/src/features/map/MapView.tsx` | Three sources/layers, data updates, style restoration, source inspection, camera behavior |
| `frontend/src/app/App.tsx` | Carry a single Bega selection through existing planner/map props |
| `frontend/src/features/journey/journeyPresentation.ts` | Optional signed-delta formatting and planned-activity summary helper |
| `frontend/src/features/journey/journey.css` | Optional responsive contextual card styling using current semantic tokens |
| `frontend/src/features/trust/PrivacyScreen.tsx` | Update accurate provider/cache disclosure before any new location transmission or retention begins |

No change to current HeiGIT/provider infrastructure is required by this presentation design. Reuse the adapter contract instead of adding a second ORS client. No global CSS/token rewrite, standalone Bega app, or separate navigation screen is required.

## 10. UI acceptance checklist for the integration mission

The integration is ready only when the same parsed result drives card and map; both modes retain their semantics; only measured overlap is highlighted; all three provider segment boundaries survive; signs/units match raw metrics; ordinary-route selection restores the prior planner state; themes and camera padding preserve one mounted map; cancelled requests cannot replace current selection; all failure states remain honest; source and quality details are accessible; and selection never triggers a reward. Verify the responsive/accessibility cases above and a legitimate live Bega route before claiming an integrated or deployed capability.
