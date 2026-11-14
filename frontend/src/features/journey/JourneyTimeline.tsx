import { Bike, Car, Flag, Footprints, ParkingSquare } from 'lucide-react';
import type { CompleteJourney } from '@vlaiq/shared';
import { journeyDistance, journeyMinutes } from './journeyPresentation';
const icons = { drive: Car, walk: Footprints, cycle: Bike, parking: ParkingSquare };
const labels = { drive: 'Cu mașina', walk: 'Pe jos', cycle: 'Cu bicicleta', parking: 'Parchează' };
export function JourneyTimeline({
  journey,
  selectedLeg,
  onSelect,
}: {
  journey: CompleteJourney;
  selectedLeg: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <section className="journey-timeline" aria-label="Etapele călătoriei">
      <div className="journey-timeline-heading">
        <span>DRUMUL, PAS CU PAS</span>
        <button onClick={() => onSelect(null)} aria-pressed={selectedLeg === null}>
          Tot traseul
        </button>
      </div>
      <ol>
        {journey.legs.map((leg, index) => {
          const Icon = icons[leg.type];
          return (
            <li
              key={leg.id}
              style={{ '--leg-order': index } as React.CSSProperties}
              data-mode={leg.type}
            >
              <button
                className={selectedLeg === leg.id ? 'selected' : ''}
                onClick={() => onSelect(leg.id)}
                aria-pressed={selectedLeg === leg.id}
              >
                <span className="journey-leg-node">
                  <Icon size={18} />
                </span>
                <span className="journey-leg-copy">
                  <strong>{labels[leg.type]}</strong>
                  <small>
                    {leg.type === 'parking'
                      ? journey.parking?.name
                      : `${journeyDistance(leg.route.distance)} · rută calculată`}
                  </small>
                </span>
                <span className="journey-leg-time">
                  {leg.duration.value === null ? (
                    <small>
                      timp
                      <br />
                      necunoscut
                    </small>
                  ) : (
                    <>
                      <b>{journeyMinutes(leg.duration.value)}</b>
                      <small>min</small>
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
        <li className="journey-arrival">
          <span className="journey-leg-node">
            <Flag size={15} />
          </span>
          <span>Ai ajuns la destinație</span>
        </li>
      </ol>
      <p>Atinge o etapă pentru a o evidenția pe hartă. Parcarea nu are o geometrie de deplasare.</p>
    </section>
  );
}
