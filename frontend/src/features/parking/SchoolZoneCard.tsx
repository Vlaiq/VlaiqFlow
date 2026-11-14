import { useState } from 'react';
import { Check, Copy, ExternalLink, School } from 'lucide-react';
import { DECIDEM_URL, schoolLabel, schoolStreetProposal, type ProtectedZone } from '@vlaiq/shared';
import { QualityBadge } from '../../components/QualityBadge';

/**
 * "Zonă protejată la școală" (spec §6.16): tells the driver why parkings next to the school are left out
 * at drop-off times, lets them switch it off for this trip, and drafts a "Stradă școlară" proposal that
 * they send themselves on Decidem. Every value comes from the backend zone; nothing is sent from here.
 */
export function SchoolZoneCard({ zone, onToggle }: { zone: ProtectedZone; onToggle: (on: boolean) => void }) {
  const main = zone.schools[0]!;
  const name = schoolLabel(main);
  const windows = zone.windows.map((w) => `${w.start}–${w.end}`).join(', ');
  const others = zone.schools.length - 1;

  return (
    <section className={`school-zone ${zone.applied ? 'applied' : ''}`} aria-labelledby="school-zone-title">
      <div className="school-zone-heading">
        <span className="school-zone-icon" aria-hidden>
          <School size={18} />
        </span>
        <div>
          <span className="school-zone-eyebrow">
            {zone.applied ? 'ZONĂ PROTEJATĂ ACTIVĂ' : zone.optedOut ? 'ZONĂ PROTEJATĂ OPRITĂ' : 'ZONĂ PROTEJATĂ LA ȘCOALĂ'}
          </span>
          <h3 id="school-zone-title">{name}</h3>
          <p className="school-zone-meta">
            {main.distanceM < 20 ? 'Chiar destinația ta' : `La ${main.distanceM} m de destinație`}
            {others > 0 ? ` · încă ${others} ${others === 1 ? 'unitate' : 'unități'} de învățământ aproape` : ''}{' '}
            <QualityBadge quality={zone.quality} />
          </p>
        </div>
      </div>

      {zone.applied && (
        <p>
          Între {zone.window!.start} și {zone.window!.end} copiii ajung pe jos la școală. Nu te ducem cu
          mașina până la poartă: am lăsat deoparte{' '}
          {zone.excluded === 0
            ? 'zona de'
            : `${zone.excluded} ${zone.excluded === 1 ? 'parcare' : 'parcări'} din raza de`}{' '}
          {zone.radiusM} m (cercul punctat de pe hartă). Oprește la una dintre parcările de mai jos și fă ultimele minute pe jos.
        </p>
      )}
      {zone.active && zone.optedOut && (
        <p>
          Ai oprit zona pentru acest drum, așa că apar și parcările de lângă școală ({zone.insideZone} în raza de{' '}
          {zone.radiusM} m). Te rugăm să mergi încet: la ora asta copiii ajung pe jos.
        </p>
      )}
      {!zone.active && (
        <p>
          {zone.inactiveReason} Zona se activează singură în zilele de școală, la {windows}.
        </p>
      )}

      {zone.applied ? (
        <button type="button" className="school-zone-toggle" onClick={() => onToggle(false)}>
          Am nevoie să ajung cu mașina până la intrare
          <span>de exemplu: dizabilitate, un copil bolnav, bagaje grele</span>
        </button>
      ) : zone.optedOut ? (
        <button type="button" className="school-zone-toggle" onClick={() => onToggle(true)}>
          Pornește din nou zona protejată
        </button>
      ) : null}

      <Proposal zone={zone} />

      <p className="school-zone-source">
        {zone.source}. {zone.note}
      </p>
    </section>
  );
}

function Proposal({ zone }: { zone: ProtectedZone }) {
  const { title, body } = schoolStreetProposal(zone);
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${title}\n\n${body}`);
      setCopied('ok');
    } catch {
      setCopied('failed');
    }
  };
  return (
    <details className="school-zone-proposal">
      <summary>Propune o „Stradă școlară” pe Decidem</summary>
      <p>
        O stradă școlară se închide traficului auto doar la orele de intrare și ieșire. Mai jos e o propunere
        scrisă din datele acestei zone. Decidem nu primește propuneri de la aplicații, așa că o copiezi și o
        trimiți tu, cu contul tău.
      </p>
      <label htmlFor="school-zone-text">Textul propunerii (îl poți modifica pe Decidem)</label>
      <textarea id="school-zone-text" readOnly rows={8} value={`${title}\n\n${body}`} onFocus={(e) => e.currentTarget.select()} />
      <div className="school-zone-actions">
        <button type="button" onClick={copy}>
          {copied === 'ok' ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied === 'ok' ? 'Copiat' : 'Copiază textul'}
        </button>
        <a href={DECIDEM_URL} target="_blank" rel="noopener noreferrer">
          Deschide Decidem <ExternalLink size={13} aria-hidden />
          <span className="sr-only"> (se deschide într-o filă nouă)</span>
        </a>
      </div>
      <p role="status" className="school-zone-copy-status">
        {copied === 'failed' ? 'Browserul nu a permis copierea. Selectează textul și copiază-l manual.' : ''}
      </p>
    </details>
  );
}
