# Bega corridor data: extraction blocked

**Status on 14 November 2026: BLOCKED.** No Bega infrastructure geometry or OSM
object identifiers were retrieved in this environment. The committed production
snapshot `shared/src/data/bega-corridor.json` is intentionally empty and carries
`metadata.status = "blocked"`. It cannot support an available Bega alternative.
Synthetic engine and converter test fixtures are separate and are not geographic
evidence.

## Actual source attempts

The selected cloud environment's inherited HTTPS proxy denied these bounded,
read-only source requests on 14 November 2026:

| Source | Request | Observed result |
| --- | --- | --- |
| `https://overpass-api.de/api/interpreter` | Bega canal/river ways within 45.735,21.175,45.765,21.255; `out meta geom` | HTTP 403 |
| `https://overpass.kumi.systems/api/interpreter` | Same bounded waterway query | CONNECT tunnel HTTP 403 |
| `https://overpass.private.coffee/api/interpreter` | Same bounded waterway query | CONNECT tunnel HTTP 403 |
| `https://www.openstreetmap.org/api/0.6/map?bbox=21.21,45.745,21.22,45.751` | Small central Bega map rectangle | CONNECT tunnel HTTP 403 |
| `https://overpass-api.de/api/interpreter` | Initial extractor query via Node `--fetch` (also allowed `highway=pedestrian` before conservative alignment) | `fetch failed`; no snapshot overwritten |

The startup network policy did not include Overpass or OpenStreetMap hosts. TLS,
proxy settings and policy were not bypassed. No assertion about source availability
outside this environment follows from these failures. In particular, a denied
extraction is not evidence that the paths do not exist.

The snapshot's `extractedAt` records the failed research attempt (16:24:16 UTC /
18:24:16 Europe/Bucharest). `osmBaseTimestamp: null` explicitly means that no upstream
OSM snapshot timestamp was acquired. The query hash identifies the current
reproducible extractor query, not an acquired data response. The final query excludes
pedestrian streets; this narrowing was not retried after the proxy denial.

## Reproduce once source access is available

Run from the repository root with Node 22+ and the environment's normal TLS trust:

```sh
NODE_USE_ENV_PROXY=1 node scripts/fetch-bega-corridor.mjs --fetch
```

This makes **one** POST to the fixed primary Overpass endpoint, with a team-naming
User-Agent, no retries, a 45-second client deadline, 30-second query deadline,
16 MiB server memory budget and 8 MiB response cap. It saves the exact successful
raw response to `work/bega-overpass.json` for review/replay. Public Overpass must
never become a per-user dependency or a polled application backend. Honor a
provider's rate-limit response; do not immediately retry on another instance.

Replay an explicitly supplied local raw response without external requests:

```sh
node scripts/fetch-bega-corridor.mjs --input work/bega-overpass.json
```

The converter rejects runtime/partial errors, absent OSM base timestamps, invalid
way provenance and excess resource budgets. Conversion and writing are atomic: a
failed download/conversion leaves the existing committed snapshot intact. Before
committing a refreshed snapshot, validate it through `BegaDataset.parse` and review
its ways, tags, node identities and corridor association on OSM. A schema-valid
automated extraction still requires actual geographic inspection before presenting
a verified Timișoara corridor result. Do not commit the
raw extraction by default. A new extraction is a new dated snapshot; preserve its
OSM object versions/timestamps to identify the observations used.

## Selection and conservative interpretation

The query identifies named Bega `waterway=river|canal` ways and nearby
`highway=footway|cycleway|path` ways within a small rectangle:

`[west,south,east,north] = [21.175,45.735,21.255,45.765]`.

This intended extent covers Iosefin and the central corridor toward Regina Maria.
Iosefin, Piața Maria, Parcul Justiției, Michelangelo and Parcul Regina Maria are
research area names, **not verified routing anchors**. No anchors were invented
from those names.

The pure converter retains original consecutive OSM node-to-node geometry only:

- A segment's endpoints and midpoint must be within 65 m of a returned Bega
  centerline; its midpoint must be at least 6 m away, avoiding centerline artifacts.
- Its absolute tangent alignment with the closest waterway segment must be at
  least `cos(45°)`. This rejects crossing-only approaches conservatively.
- All bridges, tunnels, crossing footways, conditional access, directed ways,
  area highways, lifecycle tags (including prefixed construction/proposed/abandoned/
  disused/demolished/razed tags), limited opening hours and generally restricted
  access are excluded. Any `oneway:*` tag other than an explicit false value is
  excluded, matching the runtime's conservative undirected network policy.
- Walking requires explicit `foot=yes|designated|permissive|official`, or an
  unrestricted `footway` default. Cycling requires explicit
  `bicycle=yes|designated|permissive|official`, or an unrestricted `cycleway` default.
  `bicycle=dismount` does not enable cycle mode. Untagged `highway=path` has no
  assumed supported mode. A specific permission never silently overrides a
  generally restricted-access way in this conservative extraction. Pedestrian
  streets are excluded because that classification is not evidence of a path.
- For each original OSM way, only the longest qualifying contiguous fragment is
  kept; ties retain the earliest fragment. This preserves unique source way IDs
  without inventing connectors. Smaller or disconnected fragments are omitted.

These numbers are **prototype extraction thresholds**, not official recommendations
or a field-survey method. They can omit useful paths and include an adjacent path
that merits manual review. Every retained feature is still an actual OSM path;
proximity to water does not establish its legal, protected, accessible, well-lit,
safe or physically current condition. Bridges are excluded from corridor evidence;
the routing provider can still traverse legitimate bridges in its full route.

Infrastructure labels describe mapped path type and permitted modes. A path
permitting a bicycle is not automatically a protected bicycle lane. The preliminary
shared-use label means both modes are permitted by this extraction; it does not
certify segregation. General motor roads are not included. Node barriers and turn
relations are not extracted; actual mode-specific provider geometry and the engine's
topology/overlap checks remain necessary. Wrong riverbanks are never linked by
geometric proximity alone.

All distances use a local equirectangular projection anchored at
`[21.215,45.75]`, Earth radius 6,371,000 m. This is suitable for bounded city-scale
screening; thresholds must be reviewed before expanding the extent. The converter
caps raw elements at 3,000, raw coordinates at 20,000, canal segments at 3,000,
individual path vertices at 2,000, final features at 400 and final coordinates at
12,000. It does no geometric densification or citywide extraction.

## Provenance and licensing

Each future feature retains the exact original node IDs and coordinates, OSM way
ID, version, timestamp, relevant complete tags, permitted modes, infrastructure
classification and canonical OSM history URL. Collection metadata retains extraction
time, upstream base timestamp, version, extent, source URL, query SHA-256, license,
attribution and limitations. The checked-in blocked snapshot contains no OSM object
references because none were observed; an invented object list would be misleading.

Existing OpenStreetMap/Overpass rows in `docs/third-party.md` cover these sources.
The extractor is original project code and introduces no copied third-party code
or new npm dependencies. OSM data remains under
[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/); display
**© OpenStreetMap contributors**, link the
[OSM copyright/licensing page](https://www.openstreetmap.org/copyright), and preserve
share-alike obligations when redistributing an adapted database. No municipal
endorsement, current physical-path inspection, air-quality benefit or safety
certification is claimed.

Primary references consulted for extraction semantics and service use:

- [OSM highway=footway](https://wiki.openstreetmap.org/wiki/Tag:highway%3Dfootway)
- [OSM highway=cycleway](https://wiki.openstreetmap.org/wiki/Tag:highway%3Dcycleway)
- [OSM access tagging](https://wiki.openstreetmap.org/wiki/Key:access)
- [OSM routing access defaults and limitations](https://wiki.openstreetmap.org/wiki/OSM_tags_for_routing/Access_restrictions)
- [Overpass public instances](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [Overpass resource-use guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)

Research pages explain interpretation; they do not prove a particular Bega path's
existence. No pollution or environmental reduction measurement was acquired.

## Reproducible converter checks

```sh
node --test scripts/fetch-bega-corridor.test.mjs
```

The Node built-in test suite makes no network requests and never writes a production
snapshot. All constructed way IDs and coordinates are explicitly synthetic. It
checks original-node/provenance preservation, deterministic replay, mode and access
semantics, excluded bridges/crossings/lifecycle/directional rules, geometric
crossing/centerline rejection, longest-fragment selection without artificial joins,
bounded payloads, malformed source rejection and committed snapshot/query-hash
consistency. These checks do not establish live source retrieval or physical path
connectivity.
