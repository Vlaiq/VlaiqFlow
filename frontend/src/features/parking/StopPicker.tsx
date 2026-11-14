import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { distanceM, MAX_EXTRA_STOPS, MAX_STOP_SPREAD_M, type Coordinate, type Destination } from '@vlaiq/shared';
import { DestinationSearch } from '../search/DestinationSearch';
import type { TourStop } from './ParkingRecommendations';

interface Props {
  destination: Coordinate;
  places: Destination[] | null;
  stops: TourStop[];
  onChange: (stops: TourStop[]) => void;
}

/**
 * "Parchează o dată" (spec §6.19): add up to two places you also walk to. SmartMatch then picks one
 * parking for the whole walk instead of moving the car between errands. Only places from the snapshot.
 */
export function StopPicker({ destination, places, stops, onChange }: Props) {
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const add = (d: Destination) => {
    if (!d.location) {
      setMessage(`${d.name} nu are o poziție cunoscută, deci nu o putem folosi ca oprire.`);
      return;
    }
    const coordinate: Coordinate = [d.location.lng, d.location.lat];
    if (distanceM(destination, coordinate) > MAX_STOP_SPREAD_M) {
      setMessage(`${d.name} e la peste ${(MAX_STOP_SPREAD_M / 1000).toLocaleString('ro-RO')} km de destinație: planific-o separat.`);
      return;
    }
    if (stops.some((s) => s.id === d.id)) return;
    setMessage(null);
    setAdding(false);
    onChange([...stops, { id: d.id, name: d.name, coordinate }]);
  };
  return (
    <div className="tour-stops">
      <p className="tour-stops-title">
        <strong>Mai ai o oprire pe jos?</strong> Parchezi o singură dată, pentru toate.
      </p>
      {stops.length > 0 && (
        <ol className="tour-stops-list">
          {stops.map((s, i) => (
            <li key={s.id}>
              <span>
                {i + 1}. {s.name}
              </span>
              <button
                type="button"
                aria-label={`Scoate oprirea ${s.name}`}
                onClick={() => onChange(stops.filter((x) => x.id !== s.id))}
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ol>
      )}
      {adding ? (
        <DestinationSearch
          destinations={places}
          unavailable={!places}
          onSelect={add}
          placeholder="Și apoi la…"
          label="Caută o oprire"
          clearOnSelect
        />
      ) : (
        stops.length < MAX_EXTRA_STOPS && (
          <button type="button" className="tour-stops-add" onClick={() => setAdding(true)}>
            <Plus size={15} /> Adaugă o oprire
          </button>
        )
      )}
      {message && (
        <p className="tour-stops-message" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
