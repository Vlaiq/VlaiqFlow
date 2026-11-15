import { useEffect, useState } from 'react';
import type { CompleteJourney } from '@vlaiq/shared';
import {
  JourneyExplanation,
  JourneySnapshot,
  type JourneyReference,
} from '../../../../shared/src/journeyBuddy';
import { walkingSeconds } from '../../../../shared/src/journeyConstraints';
import { useAppRouter } from '../../app/router';
import {
  journeyAccountCall,
  journeyReturnHref,
} from '../journey/journeyHandoff';
import { BuddyRobot } from './BuddyRobot';
import { initialAnimation } from './animation';
import './journeyBuddy.css';

const names = {
  car_park_walk: 'Auto + parcare + mers',
  walk: 'Pe jos',
  cycle: 'Cu bicicleta',
};
const minutes = (s: number | null) =>
  s === null
    ? 'necunoscut'
    : (s / 60).toLocaleString('ro-RO', { maximumFractionDigits: 2 });
function Facts({
  journey: j,
  eligible,
}: {
  journey: CompleteJourney;
  eligible?: boolean;
}) {
  const fee = j.parking?.fee;
  return (
    <li data-option-id={j.id}>
      <strong>
        {names[j.category]}
        {j.parking ? ` · ${j.parking.name}` : ''}
      </strong>
      {eligible !== undefined && (
        <span> — {eligible ? 'Respectă limita' : 'Nu respectă limita'}</span>
      )}
      <p>
        Durată estimată: {minutes(j.travelSeconds.value)} min · Mers pe jos
        estimat: {minutes(walkingSeconds(j))} min.
      </p>
      <p>
        {fee
          ? `Tarif parcare: ${fee.minorUnits === null ? 'necunoscut' : `${(fee.minorUnits / 100).toLocaleString('ro-RO')} ${fee.currency ?? ''}`} · ${fee.quality === 'confirmed' ? 'confirmat în sursă' : fee.quality === 'estimated' ? 'estimat' : fee.quality === 'simulated' ? 'simulat' : 'necunoscut'} · ${fee.source}. ${fee.note}`
          : 'Costurile echipamentului sau închirierii nu sunt calculate.'}
      </p>
      {j.parking && (
        <p>
          Disponibilitate live: necunoscută. Șansă de loc{' '}
          {j.parking.match.freeChance.quality === 'simulated'
            ? 'simulată'
            : 'estimată'}{' '}
          prin model:{' '}
          {(j.parking.match.freeChance.value * 100).toLocaleString('ro-RO', {
            maximumFractionDigits: 1,
          })}
          % · {j.parking.match.freeChance.source}. Căutarea și manevrarea
          parcării: durată necunoscută.
        </p>
      )}
      <small>
        Proveniență:{' '}
        {[
          ...new Set(
            j.legs
              .filter((l) => l.type !== 'parking')
              .map((l) => l.duration.source),
          ),
          ...(j.parking ? [j.parking.source] : []),
        ].join(' · ')}
        . {j.limitations.join(' ')}
      </small>
    </li>
  );
}
export function BuddyJourney({ reference }: { reference: JourneyReference }) {
  const { navigate } = useAppRouter();
  const [snapshot, setSnapshot] = useState<JourneySnapshot | null>(null);
  const [answer, setAnswer] = useState<JourneyExplanation | null>(null);
  const [question, setQuestion] = useState(
    'Care variantă mă lasă să merg cel mult 8 minute pe jos?',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    journeyAccountCall('load', reference, controller.signal)
      .then((body) => setSnapshot(JourneySnapshot.parse(body)))
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [reference.id, reference.revision]);
  const selected = answer?.snapshot.value.journeys.find(
    (j) => j.id === answer.optionId,
  );
  return (
    <section className="buddy-journey" aria-labelledby="buddy-journey-title">
      <a href={journeyReturnHref(reference)}>Înapoi la comparație</a>
      <div className="buddy-journey-intro">
        <BuddyRobot
          small
          state={{
            ...initialAnimation,
            pose: busy ? 'thinking' : answer ? 'explaining' : 'idle',
          }}
        />
        <span className="flow-eyebrow">FLOW BUDDY · SMART JOURNEY</span>
      </div>
      <h1 id="buddy-journey-title">Hai să înțelegem drumul acesta.</h1>
      <p>
        Codul verifică limita în comparația calculată. Gemini explică
        rezultatul.
      </p>
      {!snapshot && !error && (
        <p role="status">Încărcăm comparația validată…</p>
      )}
      {snapshot && (
        <>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError(null);
              setAnswer(null);
              try {
                setAnswer(
                  JourneyExplanation.parse(
                    await journeyAccountCall('explain', {
                      reference,
                      question,
                    }),
                  ),
                );
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : 'Explicația nu este disponibilă.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label htmlFor="journey-question">
              Întreabă despre limita de mers pe jos
            </label>
            <input
              id="journey-question"
              value={question}
              maxLength={300}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <small>
              Poți ajusta întrebarea: „cel mult N minute pe jos”, cu N între 0
              și 180.
            </small>
            <button className="journey-primary-action" disabled={busy}>
              {busy ? 'Buddy pregătește explicația…' : 'Întreabă-l pe Buddy'}
            </button>
          </form>
          {answer && (
            <article
              className="buddy-journey-answer"
              aria-label="Explicația călătoriei"
              data-explained-option-id={answer.optionId ?? ''}
              data-revision={answer.reference.revision}
            >
              <strong>
                {answer.source === 'gemini'
                  ? 'Explicație Gemini'
                  : 'Rezultat verificat de cod · Gemini indisponibil sau nefolosit'}
              </strong>
              <p>{answer.text}</p>
              <p>
                Limită validată: {answer.maxWalkMinutes} min pe jos.{' '}
                {answer.eligibleIds.length} variante eligibile în setul
                comparat.
              </p>
              {selected && (
                <>
                  <ul>
                    <Facts journey={selected} eligible />
                  </ul>
                  <button
                    className="journey-primary-action"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError(null);
                      try {
                        await journeyAccountCall('select', {
                          reference,
                          optionId: selected.id,
                        });
                        navigate(journeyReturnHref(reference, selected.id));
                      } catch (e) {
                        setError(
                          e instanceof Error
                            ? e.message
                            : 'Recalculează comparația.',
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Arată-mi ruta
                  </button>
                </>
              )}
            </article>
          )}
          <details open={!answer}>
            <summary>Valorile comparației calculate</summary>
            <ul>
              {snapshot.value.journeys.map((j) => (
                <Facts
                  key={j.id}
                  journey={j}
                  eligible={
                    answer ? answer.eligibleIds.includes(j.id) : undefined
                  }
                />
              ))}
            </ul>
            <p>{snapshot.value.limitations.join(' ')}</p>
            <small>
              Calculată: {snapshot.value.calculatedAt} · Expiră:{' '}
              {snapshot.value.handoff?.expiresAt}
            </small>
          </details>
        </>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <a href={journeyReturnHref(reference)}>
            Revino la hartă pentru recalculare
          </a>
        </div>
      )}
    </section>
  );
}
