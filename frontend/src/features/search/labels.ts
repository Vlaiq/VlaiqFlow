import { normalize, type Destination, type LocationPrecision } from '@vlaiq/shared';

const STREET_TYPE_LABEL: [string, string][] = [
  ['piata', 'Piață'],
  ['bulevardul', 'Bulevard'],
  ['calea', 'Cale'],
  ['aleea', 'Alee'],
  ['splaiul', 'Splai'],
  ['intrarea', 'Intrare'],
  ['scuarul', 'Scuar'],
];

/** "Piață", "Bulevard", "Stradă"… taken from the official name, so a square is not called a street. */
export function kindLabel(d: Destination): string {
  if (d.kind === 'landmark') return 'Obiectiv';
  if (d.kind === 'neighbourhood') return 'Cartier';
  const first = normalize(d.name).split(' ')[0] ?? '';
  return STREET_TYPE_LABEL.find(([k]) => k === first)?.[1] ?? 'Stradă';
}

export const PRECISION_LABEL: Record<LocationPrecision, string> = {
  exact: 'Poziție exactă',
  street: 'Poziție pe stradă, aproximativă',
  neighbourhood: 'Doar cartierul, aproximativ',
  none: 'Poziție necunoscută',
};
