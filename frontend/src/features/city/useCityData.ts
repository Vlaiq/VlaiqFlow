import { useCallback, useEffect, useState } from 'react';
import type {
  DestinationsResponse,
  HealthResponse,
  ParkingsResponse,
  TimparkSnapshot,
} from '@vlaiq/shared';
import { api } from '../../services/api';

export interface CityData {
  parkings: ParkingsResponse | null;
  timpark: TimparkSnapshot | null;
  destinations: DestinationsResponse | null;
  health: HealthResponse | null;
}
export function useCityData() {
  const [data, setData] = useState<CityData>({
    parkings: null,
    timpark: null,
    destinations: null,
    health: null,
  });
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErrors([]);
    void Promise.allSettled([api.parkings(), api.timpark(), api.destinations(), api.health()]).then(
      (results) => {
        if (!alive) return;
        setData((previous) => ({
          parkings: results[0].status === 'fulfilled' ? results[0].value : previous.parkings,
          timpark: results[1].status === 'fulfilled' ? results[1].value : previous.timpark,
          destinations:
            results[2].status === 'fulfilled' ? results[2].value : previous.destinations,
          health: results[3].status === 'fulfilled' ? results[3].value : previous.health,
        }));
        const labels = [
          'parcările OpenStreetMap',
          'datele Timpark',
          'destinațiile',
          'diagnosticul API',
        ];
        setErrors(results.flatMap((r, i) => (r.status === 'rejected' ? [labels[i]!] : [])));
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  return { data, loading, errors, retry };
}

export function coverageSummary(data: CityData) {
  const osm = data.parkings
    ? [...new Map(data.parkings.parkings.map((p) => [p.id, p])).values()]
    : [];
  const official = data.timpark
    ? [...new Map(data.timpark.data.features.map((p) => [p.id, p])).values()]
    : [];
  return {
    osmLocations: data.parkings ? osm.length : null,
    officialAreas: data.timpark ? official.filter((f) => f.kind === 'zone').length : null,
    officialLots: data.timpark ? official.filter((f) => f.kind === 'lot').length : null,
    officialStreets: data.timpark ? official.filter((f) => f.kind === 'street').length : null,
    officialFeatures: data.timpark ? official.length : null,
    knownCapacityLocations: data.parkings
      ? osm.filter((p) => p.capacity.value != null).length
      : null,
    knownCapacitySum: data.parkings ? osm.reduce((s, p) => s + (p.capacity.value ?? 0), 0) : null,
    sourcedAvailabilityLocations: data.parkings
      ? osm.filter((p) => p.availability.value != null && p.availability.quality === 'confirmed')
          .length
      : null,
    destinations: data.destinations
      ? new Set(data.destinations.destinations.map((d) => d.id)).size
      : null,
  };
}

export function formatSourceDate(raw: string | null | undefined) {
  if (!raw) return 'Actualizare necunoscută';
  const date = new Date(raw);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('ro-RO', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Bucharest',
      }).format(date)
    : 'Actualizare necunoscută';
}

export function exportCitySummary(data: CityData) {
  return {
    generatedAt: new Date().toISOString(),
    purpose: 'Non-personal dataset coverage summary. Not live parking occupancy or city impact.',
    coverage: 'Date Timpark în zona municipiului Timișoara; nu acoperire completă a județului.',
    uniqueWithinSourceCounts: coverageSummary(data),
    deduplication:
      'Unique source IDs within each dataset. OSM and municipal features are not summed as distinct parking locations.',
    sources: [
      ...(data.parkings
        ? [
            {
              name: 'OpenStreetMap',
              source: data.parkings.dataset.source,
              updatedAt: data.parkings.dataset.generatedAt,
              license: 'ODbL 1.0',
              attribution: data.parkings.dataset.attribution,
            },
          ]
        : []),
      ...(data.timpark
        ? [
            {
              name: 'Timpark / Primăria Timișoara',
              source: data.timpark.source,
              updatedAt: data.timpark.fetchedAt,
              version: data.timpark.data.version,
            },
          ]
        : []),
      ...(data.destinations?.sources ?? []).map((s) => ({
        name: s.name,
        source: s.source,
        updatedAt: s.fetchedAt,
      })),
    ],
    limitations: [
      'Occupancy is not measured live.',
      'Cross-source parking identity linkage is not established.',
      'Capacity tags are partial and may be outdated.',
      'No personal routes, wallets or identities are included.',
    ],
  };
}

export function downloadData(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
