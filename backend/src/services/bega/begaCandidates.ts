import { distanceM, type LngLat } from '../../../../shared/src/geo';
import type { BegaDataset, BegaMode, BegaRequest } from '../../../../shared/src/schemas/bega';

type Feature = BegaDataset['features'][number];
export interface BegaAnchor {
  nodeId: number;
  coordinate: LngLat;
  osmIds: string[];
}
export interface BegaCandidate {
  entry: BegaAnchor;
  exit: BegaAnchor;
  networkMeters: number;
  lowerBoundMeters: number;
}
export interface BegaCandidatePolicy {
  maxCandidates: number;
  maxAccessMeters: number;
  maxDistanceRatio: number;
  minCorridorMeters: number;
}
const allowed = new Set(['yes', 'designated', 'permissive', 'official']);
const denied = new Set(['no', 'private', 'customers', 'destination', 'delivery', 'permit', 'agricultural', 'forestry']);
const lifecycle = ['construction', 'proposed', 'abandoned', 'disused', 'demolished', 'razed'];

/**
 * Conservative snapshot eligibility, never a certification of current physical access.
 * General access restrictions and time/direction-dependent rules are excluded rather than guessed.
 * A cycleway is not necessarily protected; a footway requires explicit cycling permission.
 */
export function eligibleForMode(feature: Feature, mode: BegaMode): boolean {
  if (!feature.properties.modes.includes(mode)) return false;
  const t = feature.properties.tags;
  if (!['footway', 'cycleway', 'path'].includes(t.highway ?? '')) return false;
  if (t.area === 'yes' || t.footway === 'crossing') return false;
  if ((t.bridge && t.bridge !== 'no') || (t.tunnel && t.tunnel !== 'no')) return false;
  if (Object.keys(t).some((key) => key.includes('conditional') ||
      lifecycle.some((prefix) => key === prefix || key.startsWith(`${prefix}:`)))) return false;
  if (t.opening_hours && t.opening_hours !== '24/7') return false;
  if (t.access && !allowed.has(t.access) && t.access !== 'public') return false;
  // For this undirected graph, exclude any mode-specific or generic directional rule.
  if (Object.entries(t).some(([key, value]) =>
    (key === 'oneway' || key.startsWith('oneway:')) && !['no', '0', 'false'].includes(value))) return false;
  const specific = mode === 'walk' ? t.foot : t.bicycle;
  if (specific && (denied.has(specific) || !allowed.has(specific))) return false;
  if (mode === 'cycle') return t.highway === 'cycleway' || (specific !== undefined && allowed.has(specific));
  return t.highway === 'footway' || (specific !== undefined && allowed.has(specific));
}

interface Vertex extends BegaAnchor {
  edges: Map<number, number>;
  endpoint: boolean;
}
/** Tiny binary min-heap avoids O(V²) shortest-path scanning. */
class MinHeap {
  private entries: [number, number][] = [];
  get size() { return this.entries.length; }
  push(entry: [number, number]) {
    const a = this.entries;
    a.push(entry);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(a[i]!, a[p]!)) break;
      [a[i], a[p]] = [a[p]!, a[i]!];
      i = p;
    }
  }
  pop(): [number, number] {
    const a = this.entries;
    const first = a[0]!;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        let j = i;
        const l = 2 * i + 1, r = l + 1;
        if (l < a.length && this.less(a[l]!, a[j]!)) j = l;
        if (r < a.length && this.less(a[r]!, a[j]!)) j = r;
        if (j === i) break;
        [a[i], a[j]] = [a[j]!, a[i]!];
        i = j;
      }
    }
    return first;
  }
  private less(a: [number, number], b: [number, number]) {
    return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  }
}
function distances(graph: Map<number, Vertex>, start: number, maxMeters: number): Map<number, number> {
  const result = new Map<number, number>([[start, 0]]);
  const queue = new MinHeap();
  queue.push([0, start]);
  while (queue.size) {
    const [d, id] = queue.pop();
    if (result.get(id) !== d) continue;
    for (const [next, length] of graph.get(id)!.edges) {
      const sum = d + length;
      if (sum > maxMeters || sum >= (result.get(next) ?? Infinity)) continue;
      result.set(next, sum);
      queue.push([sum, next]);
    }
  }
  return result;
}
function anchor(vertex: Vertex): BegaAnchor {
  return { nodeId: vertex.nodeId, coordinate: [...vertex.coordinate], osmIds: [...vertex.osmIds].sort() };
}

/**
 * Bounded network screening only: candidates are NOT routable recommendations until a provider
 * returns connected mode-correct geometry with measured corridor overlap. No proximity links exist
 * in this graph: two ways connect only through an identical original OSM node ID.
 */
export function discoverBegaCandidates(
  req: BegaRequest,
  dataset: BegaDataset,
  baselineDistanceMeters: number,
  policy: BegaCandidatePolicy,
): { candidates: BegaCandidate[]; eligibleFeatures: BegaDataset['features'] } {
  if (!Number.isInteger(policy.maxCandidates) || policy.maxCandidates < 1 || policy.maxCandidates > 2 ||
      !Number.isFinite(policy.maxAccessMeters) || policy.maxAccessMeters <= 0 || policy.maxAccessMeters > 2000 ||
      !Number.isFinite(policy.maxDistanceRatio) || policy.maxDistanceRatio < 1 || policy.maxDistanceRatio > 2 ||
      !Number.isFinite(policy.minCorridorMeters) || policy.minCorridorMeters <= 0 ||
      !Number.isFinite(baselineDistanceMeters) || baselineDistanceMeters <= 0)
    throw new RangeError('Invalid bounded Bega candidate policy');
  if (dataset.metadata.status !== 'available' || dataset.features.length > 400 ||
      dataset.features.reduce((n, f) => n + f.geometry.coordinates.length, 0) > 12000)
    return { candidates: [], eligibleFeatures: [] };
  const eligibleFeatures = dataset.features.filter((f) => eligibleForMode(f, req.mode));
  const graph = new Map<number, Vertex>();
  for (const feature of eligibleFeatures) {
    const ids = feature.properties.nodeIds;
    const coords = feature.geometry.coordinates;
    for (let i = 0; i < ids.length; i++) {
      const nodeId = ids[i]!;
      const v = graph.get(nodeId) ?? {
        nodeId, coordinate: coords[i]!, osmIds: [], edges: new Map<number, number>(), endpoint: false,
      };
      if (!v.osmIds.includes(feature.properties.osmId)) v.osmIds.push(feature.properties.osmId);
      v.endpoint ||= i === 0 || i === ids.length - 1;
      graph.set(nodeId, v);
      if (i > 0) {
        const prev = graph.get(ids[i - 1]!)!;
        const length = distanceM(prev.coordinate, v.coordinate);
        if (length > 0) {
          prev.edges.set(nodeId, Math.min(length, prev.edges.get(nodeId) ?? Infinity));
          v.edges.set(prev.nodeId, Math.min(length, v.edges.get(prev.nodeId) ?? Infinity));
        }
      }
    }
  }
  const nodes = [...graph.values()].filter((v) => v.endpoint || v.edges.size !== 2 || v.osmIds.length > 1);
  const near = (point: LngLat) => nodes
    .map((v) => ({ v, d: distanceM(point, v.coordinate) }))
    .filter(({ d }) => d <= policy.maxAccessMeters)
    .sort((a, b) => a.d - b.d || a.v.nodeId - b.v.nodeId)
    .slice(0, 4);
  const entries = near(req.origin), exits = near(req.destination);
  const limit = baselineDistanceMeters * policy.maxDistanceRatio;
  const candidates: BegaCandidate[] = [];
  for (const entry of entries) {
    const paths = distances(graph, entry.v.nodeId, limit);
    for (const exit of exits) {
      if (entry.v.nodeId === exit.v.nodeId) continue;
      // Require forward geographic progress at both ends, rejecting obvious reversal/backtracking.
      if (distanceM(req.origin, exit.v.coordinate) <= entry.d ||
          distanceM(req.destination, entry.v.coordinate) <= exit.d) continue;
      const networkMeters = paths.get(exit.v.nodeId);
      if (networkMeters === undefined || networkMeters < policy.minCorridorMeters) continue;
      const lowerBoundMeters = entry.d + networkMeters + exit.d;
      if (lowerBoundMeters > limit) continue;
      candidates.push({ entry: anchor(entry.v), exit: anchor(exit.v), networkMeters, lowerBoundMeters });
    }
  }
  candidates.sort((a, b) => a.lowerBoundMeters - b.lowerBoundMeters ||
    b.networkMeters - a.networkMeters || a.entry.nodeId - b.entry.nodeId || a.exit.nodeId - b.exit.nodeId);
  return { candidates: candidates.slice(0, policy.maxCandidates), eligibleFeatures };
}
