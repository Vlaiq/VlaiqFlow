import type { DataQuality } from '@vlaiq/shared';
import { QualityBadge } from '../../components/QualityBadge';
import { chanceLevel, fmt1, pct, scoreLines, type ScoreInput } from './recommendationLabels';
import './parking.css';

/** The SmartMatch rule-model estimate. Labelled as an estimate; live occupancy stays unknown. */
export function FreeChance({
  value,
  quality,
  range,
  compact = false,
}: {
  value: number;
  quality: DataQuality;
  /** Sensitivity band [pessimistic, optimistic] from the model, when it gave one. */
  range?: [number, number];
  compact?: boolean;
}) {
  const level = chanceLevel(value);
  return (
    <div className={`free-chance ${compact ? 'compact' : ''}`} data-tone={level.tone}>
      <div className="free-chance-head">
        <span className="free-chance-label">Șanse estimate de loc</span>
        <QualityBadge quality={quality} />
      </div>
      <div className="free-chance-value">
        <strong>~{pct(value)}</strong>
        <span>{level.label}</span>
      </div>
      <div
        className="free-chance-bar"
        role="meter"
        aria-label="Șanse estimate de loc liber"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-valuetext={`aproximativ ${pct(value)}, ${level.label}, estimare`}
      >
        <span style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      {!compact && (
        <p className="free-chance-note">
          {range && range[0] !== range[1]
            ? `Interval plauzibil ${pct(range[0])}–${pct(range[1])}. `
            : ''}
          Model după zonă, zi, ora sosirii și capacitate, nu senzori. Ocuparea live este
          necunoscută. <a href="/sanse-parcare">Cum calculăm</a>
        </p>
      )}
    </div>
  );
}

/**
 * How the SmartMatch score is built (lower is better). Walk and drive are real minutes; risk and price are
 * converted into minutes, and each line shows the conversion with the real price next to it.
 */
export function ScoreBreakdown(props: ScoreInput) {
  const parts = scoreLines(props);
  const sum = parts.reduce((n, p) => n + Math.max(0, p.minutes), 0) || 1;
  return (
    <div className="score-breakdown">
      <div className="score-breakdown-bar" aria-hidden>
        {parts.map((p) => (
          <span
            key={p.id}
            data-part={p.id}
            style={{ width: `${(Math.max(0, p.minutes) / sum) * 100}%` }}
          />
        ))}
      </div>
      <ul>
        {parts.map((p) => (
          <li key={p.id} data-part={p.id}>
            <span>
              {p.label}
              <small>{p.how}</small>
            </span>
            <strong>{fmt1(p.minutes)} min</strong>
          </li>
        ))}
        <li className="score-breakdown-total">
          <span>Scor SmartMatch</span>
          <strong>{fmt1(props.score.total)} min echivalente</strong>
        </li>
      </ul>
      <p className="score-breakdown-note">
        Prețul și riscul nu sunt timp real: le transformăm în minute ca să le putem aduna cu mersul
        și compara parcările. Prețul de plată real este cel de la „Cost”.
      </p>
    </div>
  );
}
