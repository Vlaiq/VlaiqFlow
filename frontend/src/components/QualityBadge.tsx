import type { DataQuality } from '@vlaiq/shared';

const LABEL: Record<DataQuality, string> = {
  confirmed: 'Confirmat',
  estimated: 'Estimat',
  unknown: 'Necunoscut',
  simulated: 'DEMO',
};

const COLOR: Record<DataQuality, string> = {
  confirmed: 'bg-q-confirmed/15 text-q-confirmed',
  estimated: 'bg-q-estimated/15 text-q-estimated',
  unknown: 'bg-q-unknown/15 text-q-unknown',
  simulated: 'bg-q-simulated/15 text-q-simulated',
};

/** Always shows a text label — never color alone (CLAUDE.md conventions). */
export function QualityBadge({ quality }: { quality: DataQuality }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${COLOR[quality]}`}>
      {LABEL[quality]}
    </span>
  );
}
