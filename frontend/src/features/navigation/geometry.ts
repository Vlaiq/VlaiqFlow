import type { Coordinate, NavigationRoute } from '@vlaiq/shared';

const RAD = Math.PI / 180;
export function distance(a: Coordinate, b: Coordinate) {
  const p = (b[1] - a[1]) * RAD,
    l = (b[0] - a[0]) * RAD;
  const h =
    Math.sin(p / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(l / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function bearing(a: Coordinate, b: Coordinate) {
  const dl = (b[0] - a[0]) * RAD;
  return (
    (Math.atan2(
      Math.sin(dl) * Math.cos(b[1] * RAD),
      Math.cos(a[1] * RAD) * Math.sin(b[1] * RAD) -
        Math.sin(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.cos(dl),
    ) /
      RAD +
      360) %
    360
  );
}
export function cumulative(geometry: Coordinate[]) {
  let total = 0;
  return geometry.map((p, i) => {
    if (i) total += distance(geometry[i - 1]!, p);
    return total;
  });
}
export function sample(geometry: Coordinate[], lengths: number[], progress: number) {
  const end = lengths.at(-1) ?? 0;
  const at = Math.max(0, Math.min(end, progress));
  let index = lengths.findIndex((v, i) => i > 0 && v >= at);
  if (index < 1) index = geometry.length - 1;
  const a = geometry[index - 1]!,
    b = geometry[index]!;
  const span = lengths[index]! - lengths[index - 1]!;
  const t = span > 0 ? (at - lengths[index - 1]!) / span : 0;
  return {
    coordinate: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as Coordinate,
    heading: bearing(a, b),
    index,
  };
}
/** Local metric projection; limit the search along loops to avoid jumping to a later crossing. */
export function project(
  point: Coordinate,
  geometry: Coordinate[],
  lengths: number[],
  near?: number,
) {
  const sx = Math.cos(point[1] * RAD) * 111195,
    sy = 111195;
  let result = { progress: 0, distance: Infinity, coordinate: geometry[0]! };
  for (let i = 1; i < geometry.length; i++) {
    if (near != null && (lengths[i]! < near - 80 || lengths[i - 1]! > near + 350)) continue;
    const a = geometry[i - 1]!,
      b = geometry[i]!;
    const ax = (a[0] - point[0]) * sx,
      ay = (a[1] - point[1]) * sy;
    const dx = (b[0] - a[0]) * sx,
      dy = (b[1] - a[1]) * sy;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < result.distance)
      result = {
        distance: d,
        progress: lengths[i - 1]! + t * (lengths[i]! - lengths[i - 1]!),
        coordinate: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])],
      };
  }
  return result;
}
export function tripMetrics(route: NavigationRoute, lengths: number[], progress: number) {
  const total = lengths.at(-1) ?? 0;
  const fraction = total ? Math.max(0, Math.min(1, progress / total)) : 0;
  const next =
    route.steps.find((s) => s.type !== 'depart' && lengths[s.index]! > progress + 8) ??
    route.steps.at(-1)!;
  return {
    remaining: route.distance * (1 - fraction),
    seconds: route.duration * (1 - fraction),
    step: next,
    maneuverDistance: Math.max(0, (lengths[next.index] ?? total) - progress),
  };
}
export function formatDistance(meters: number) {
  return meters >= 1000
    ? `${(meters / 1000).toLocaleString('ro-RO', { maximumFractionDigits: 1 })} km`
    : `${Math.round(meters / 10) * 10} m`;
}
export function instruction(step?: NavigationRoute['steps'][number]) {
  if (!step) return 'Pregătim traseul';
  if (step.type === 'arrive') return 'Ai ajuns la destinație';
  if (step.type.includes('roundabout') || step.type === 'rotary') return 'În sensul giratoriu';
  if (step.modifier === 'uturn') return 'Întoarce';
  if (step.modifier?.includes('left')) return 'Virează la stânga';
  if (step.modifier?.includes('right')) return 'Virează la dreapta';
  if (step.type === 'merge') return 'Intră pe drumul principal';
  return 'Continuă înainte';
}
