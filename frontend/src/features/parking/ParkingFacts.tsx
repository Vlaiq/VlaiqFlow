import type { DataQuality } from '@vlaiq/shared';
import { QualityBadge } from '../../components/QualityBadge';
import { chanceLevel, fmt1, pct } from './recommendationLabels';
import './parking.css';

/** The SmartMatch rule-model estimate. Labelled as an estimate; live occupancy stays unknown. */
export function FreeChance({
  value,
  quality,
  compact = false,
}: {
  value: number;
  quality: DataQuality;
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
          Model după zonă, zi și oră, nu senzori. Ocuparea live este necunoscută.
        </p>
      )}
    </div>
  );
}

interface ScoreParts {
  walk: number;
  risk: number;
  price: number;
  drive?: number | null;
  total: number;
}

/** How the SmartMatch cost is built, in minute-equivalents (lower is better). */
export function ScoreBreakdown({ score }: { score: ScoreParts }) {
  const parts = [
    { id: 'drive', label: 'Drum auto', value: score.drive ?? null },
    { id: 'walk', label: 'Mers pe jos', value: score.walk },
    { id: 'risk', label: 'Risc de plin', value: score.risk },
    { id: 'price', label: 'Preț', value: score.price },
  ].filter((p): p is { id: string; label: string; value: number } => p.value != null);
  const sum = parts.reduce((n, p) => n + Math.max(0, p.value), 0) || 1;
  return (
    <div className="score-breakdown">
      <div className="score-breakdown-bar" aria-hidden>
        {parts.map((p) => (
          <span
            key={p.id}
            data-part={p.id}
            style={{ width: `${(Math.max(0, p.value) / sum) * 100}%` }}
          />
        ))}
      </div>
      <ul>
        {parts.map((p) => (
          <li key={p.id} data-part={p.id}>
            <span>{p.label}</span>
            <strong>{fmt1(p.value)} min</strong>
          </li>
        ))}
        <li className="score-breakdown-total">
          <span>Cost total SmartMatch</span>
          <strong>{fmt1(score.total)} min echivalente</strong>
        </li>
      </ul>
    </div>
  );
}
