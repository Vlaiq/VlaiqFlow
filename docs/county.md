# Timiș county map scope

The county mask uses a real Natural Earth Admin-1 polygon, not a hand-drawn outline or
an arbitrary rectangle. Source: [Natural Earth vector repository](https://github.com/nvkelso/natural-earth-vector),
`geojson/ne_10m_admin_1_states_provinces.geojson`, 1:10m scale. Natural Earth data is
**public domain**; its upstream terms are retained in
`docs/data-sources/natural-earth-public-domain.txt`.

The feature was selected after inspecting actual metadata: `iso_3166_2=RO-TM`,
`adm1_code=ROU-280`, `name=Timis`, `name_alt=Timiș`, `type_en=County`,
`admin=Romania`, `wikidataid=Q185586`. It has one closed polygon ring with 355
vertices. Coordinates are WGS84 `[longitude, latitude]`. Six decimal digits are
retained in the local snapshot. The source file SHA-256, source URLs, snapshot date
and precision note are embedded in `shared/src/data/timis-county.json`.

This is a **generalized cartographic boundary**, not a cadastral/legal survey.
It defines the visible app scope; it does not certify municipal service coverage or
eligibility at an address near the border. Official Timpark data still covers primarily
Timișoara. The app must not infer parking/transit data in other county localities.

The map uses the polygon as an outside-area visual mask and a visible dashed county
outline. Camera bounds are derived from its vertices as a panning guardrail. Markers
and destination choices are checked against the polygon. Complete provider route
geometries are retained rather than clipped to the mask.

Preferred ANCPI/geo-spatial and geoBoundaries downloads could not be retrieved through
the current network policy. No unverified ArcGIS license or data with unclear terms
was used. Natural Earth's source and license were both retrieved and verified.

To refresh, download the public upstream GeoJSON and LICENSE.md over HTTPS, select
the single `RO-TM` feature by actual metadata, verify its shape/rings and known localities,
then update the local snapshot, retrieval date and source checksum. Do not substitute a
bounding box or guessed vertices when a source is unavailable.

Tests in `shared/src/county.test.ts` check source identity, ring closure, derived camera
bounds, four known county localities, outside cities and an outside point that lies
inside the rectangular bounding box.
