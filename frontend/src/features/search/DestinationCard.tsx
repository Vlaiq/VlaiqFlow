import { MapPin, X } from 'lucide-react';
import type { Destination } from '@vlaiq/shared';
import { QualityBadge } from '../../components/QualityBadge';
import { kindLabel, PRECISION_LABEL } from './labels';

interface Props {
  destination: Destination;
  onClear: () => void;
}

export function DestinationCard({ destination: d, onClear }: Props) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight">{d.name}</h2>
          <p className="text-xs text-muted">
            {kindLabel(d)}
            {d.detail && d.kind !== 'neighbourhood' ? ` · ${d.detail}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Renunță la destinație"
          className="rounded p-1 text-muted hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <QualityBadge quality={d.precision === 'exact' ? 'confirmed' : d.location ? 'estimated' : 'unknown'} />
        <span>{PRECISION_LABEL[d.precision]}</span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {d.location
          ? `Sursa poziției: ${d.locationSource}.`
          : 'Strada există în registrul Primăriei, dar nu avem încă poziția ei pe hartă.'}
      </p>
      <p className="mt-2 text-xs text-muted">
        Parcările din jur sunt pe hartă: zonele și străzile colorate sunt Timpark, punctele sunt parcări din
        OpenStreetMap. Apasă pe una pentru detalii.
      </p>
    </div>
  );
}
