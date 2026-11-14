import { useId, useState } from 'react';
import { Check, Copy, ExternalLink, School } from 'lucide-react';
import { DECIDEM_URL, schoolLabel, schoolStreetProposal, type ProtectedZone } from '@vlaiq/shared';
import { QualityBadge } from '../../components/QualityBadge';
import './schoolShield.css';

/** Product-defined recommendation, separate from route-provider avoidance and legal access. */
export function SchoolZoneCard({ zone, onToggle }: { zone: ProtectedZone; onToggle: (on: boolean) => void }) {
  const titleId = useId();
  const main = zone.schools[0]!;
  const windows = zone.windows.map((w) => `${w.start}–${w.end}`).join(', ');
  const others = zone.schools.length - 1;
  const state = zone.optedOut ? 'off' : zone.applied ? 'active' : 'inactive';
  const status = zone.optedOut ? 'Oprit pentru acest drum' : zone.applied ? 'Activ' : 'Inactiv';
  const proposal = schoolStreetProposal(zone);

  return (
    <section className="school-shield" data-state={state} aria-labelledby={titleId}>
      <header className="school-shield-heading">
        <span className="school-shield-icon" aria-hidden="true"><School size={20} /></span>
        <div>
          <p className="school-shield-eyebrow">School Shield</p>
          <h3 id={titleId}>{schoolLabel(main)}</h3>
          <p className="school-shield-meta">
            Punct OSM la aproximativ {main.distanceM} m de destinație
            {others > 0 ? ` · încă ${others} ${others === 1 ? 'instituție' : 'instituții'} în apropiere` : ''}
          </p>
        </div>
      </header>
      <div className="school-shield-badges">
        <span className="school-shield-state" role="status">{status}</span>
        <QualityBadge quality={zone.quality} />
      </div>

      <p className="school-shield-explanation">
        {zone.optedOut
          ? 'Recomandarea este oprită pentru acest drum. Parcările din cercurile de analiză nu sunt excluse de School Shield.'
          : zone.applied
            ? 'La ora sosirii, recomandarea exclude parcările candidate din cercurile de analiză ale instituțiilor apropiate.'
            : `${zone.inactiveReason ?? 'Ora sosirii este în afara intervalelor configurate.'} School Shield nu exclude parcări acum.`}
      </p>
      <dl className="school-shield-facts">
        <div><dt>Rază de analiză</dt><dd>{zone.radiusM} m / instituție</dd></div>
        <div><dt>Parcări excluse</dt><dd>{zone.excluded}</dd></div>
        {zone.window && <div><dt>Interval la sosire</dt><dd>{zone.window.start}–{zone.window.end}</dd></div>}
      </dl>
      <p className="school-shield-meta">Program configurat: luni–vineri, {windows}, ora Timișoarei. Sărbătorile legale sunt excluse.</p>
      {zone.applied && (
        <p className="school-shield-guidance">
          {zone.excluded === 0 ? 'Nicio parcare candidată nu a fost exclusă. ' : ''}
          Verifică opțiunile disponibile și condițiile de acces. Dacă nu apare o parcare potrivită, poți ajusta căutarea sau opri recomandarea. Excluderea nu garantează o alternativă disponibilă.
        </p>
      )}
      <button
        type="button"
        className="school-shield-toggle"
        aria-pressed={!zone.optedOut}
        onClick={() => onToggle(zone.optedOut)}
      >
        {zone.optedOut ? 'Reactivează recomandarea' : 'Oprește recomandarea pentru acest drum'}
      </button>
      <p className="school-shield-meta">Poți avea nevoie de acces cu mașina. Nu trebuie să explici motivul.</p>
      <p className="school-shield-note">{zone.note}</p>

      <details className="school-shield-sources">
        <summary>Surse și instituții apropiate</summary>
        <p>{zone.source}</p>
        <ul>
          {zone.schools.map((s) => (
            <li key={s.id}>
              {s.osmUrl ? (
                <a href={s.osmUrl} target="_blank" rel="noopener noreferrer">
                  {schoolLabel(s)} <ExternalLink size={13} aria-hidden="true" />
                  <span className="sr-only"> (OpenStreetMap, filă nouă)</span>
                </a>
              ) : schoolLabel(s)}
              {s.street && <p>Reper OSM: {s.street}; intrarea nu este verificată.</p>}
            </li>
          ))}
        </ul>
      </details>
      <Proposal key={`${proposal.title}\n${proposal.body}`} {...proposal} />
    </section>
  );
}

function Proposal({ title, body }: { title: string; body: string }) {
  const textId = useId();
  const [copied, setCopied] = useState<'pending' | 'ok' | 'failed' | null>(null);
  const copy = async () => {
    setCopied('pending');
    try {
      await navigator.clipboard.writeText(`${title}\n\n${body}`);
      setCopied('ok');
    } catch {
      setCopied('failed');
    }
  };
  return (
    <details className="school-shield-proposal">
      <summary>Pregătește o propunere pentru Decidem</summary>
      <p>
        Poți cere autorităților să evalueze o „Stradă școlară”. Aceasta este o ciornă, fără aprobare oficială.
        O poți copia, modifica și trimite tu pe Decidem. Aplicația nu trimite nimic automat.
      </p>
      <label htmlFor={textId}>Textul propunerii</label>
      <textarea id={textId} readOnly rows={8} value={`${title}\n\n${body}`} onFocus={(e) => e.currentTarget.select()} />
      <div className="school-shield-actions">
        <button type="button" onClick={copy} disabled={copied === 'pending'} aria-busy={copied === 'pending'}>
          {copied === 'ok' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
          {copied === 'pending' ? 'Se copiază…' : copied === 'ok' ? 'Copiază din nou' : 'Copiază textul'}
        </button>
        <a href={DECIDEM_URL} target="_blank" rel="noopener noreferrer">
          Deschide Decidem <ExternalLink size={14} aria-hidden="true" />
          <span className="sr-only"> (se deschide într-o filă nouă)</span>
        </a>
      </div>
      <p role="status" className="school-shield-copy-status">
        {copied === 'ok' ? 'Text copiat. Îl poți modifica și trimite pe Decidem.'
          : copied === 'failed' ? 'Browserul nu a permis copierea. Selectează textul și copiază-l manual.' : ''}
      </p>
    </details>
  );
}
