import {
  TARIFF_HEX,
  TARIFF_LABEL_RO,
  TariffColor,
  describeSchedule,
  formatAmountRo,
  isPaidAt,
  type TimparkSnapshot,
} from '@vlaiq/shared';
import { QualityBadge } from '../../components/QualityBadge';

/** Timpark tariffs exactly as published by the City Hall, with source and date. */
export function TariffLegend({ snapshot }: { snapshot: TimparkSnapshot }) {
  const { tariffs, version } = snapshot.data;
  const now = new Date();
  const fetched = new Date(snapshot.fetchedAt).toLocaleDateString('ro-RO');

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold">Tarife Timpark</h2>
        <QualityBadge quality="confirmed" />
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm" aria-label="Tarife pe oră">
        {TariffColor.options.map((color) => {
          const p = tariffs.hourly[color];
          const paid = isPaidAt(color, now, tariffs.schedule);
          return (
            <li key={color} className="flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: TARIFF_HEX[color] }} aria-hidden />
              <span>
                <span className="capitalize">{TARIFF_LABEL_RO[color]}</span>{' '}
                <span className="whitespace-nowrap tabular-nums">{formatAmountRo(p.eur)} EUR/oră</span>
                {!paid && <span className="text-muted"> · acum gratuit</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted">
        {describeSchedule(tariffs.schedule)}. Plata prin SMS la {tariffs.smsNumber} sau în CityApp.
      </p>
      <p className="mt-1 text-xs text-muted">
        Sursa: Primăria Timișoara, date Timpark (versiunea {version}), preluate pe {fetched}. Moneda e cea din sursă.
        Locurile libere nu sunt cunoscute.
      </p>
    </div>
  );
}
