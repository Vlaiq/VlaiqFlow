import {
  Destination,
  JourneyPreference,
  CompleteJourneyRequest,
  type CompleteJourneyResponse,
} from '@vlaiq/shared';
import {
  JourneyReference,
  JourneySelection,
  JourneySnapshot,
} from '../../../../shared/src/journeyBuddy';
import { accountCall } from '../identity/privateApi';
import type { Origin } from '../parking/ParkingDetail';

const SESSION = 'flow-journey-session';
const PENDING = 'flow-journey-handoff';
export function journeySessionHeaders(): Record<string, string> {
  try {
    let session = sessionStorage.getItem(SESSION);
    if (!session || !/^[a-f0-9]{64}$/.test(session)) {
      session = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
        n.toString(16).padStart(2, '0'),
      ).join('');
      sessionStorage.setItem(SESSION, session);
    }
    return { 'X-Flow-Journey-Session': session };
  } catch {
    // The public planner still works when session storage is disabled; Buddy has no handoff.
    return {};
  }
}
export function saveJourneyHandoff(
  origin: Origin,
  destination: Destination,
  value: CompleteJourneyResponse,
  preference: JourneyPreference,
  input: CompleteJourneyRequest,
) {
  const reference = JourneyReference.parse({
    id: value.handoff?.id,
    revision: value.handoff?.revision,
  });
  sessionStorage.setItem(
    PENDING,
    JSON.stringify({ origin, destination, reference, preference, input }),
  );
  return `/buddy?journey=${reference.id}&revision=${reference.revision}`;
}
export function referenceFromSearch(search: string) {
  const p = new URLSearchParams(search);
  return JourneyReference.parse({
    id: p.get('journey'),
    revision: p.get('revision'),
  });
}
export function journeyReturnHref(
  reference: JourneyReference,
  optionId?: string | null,
) {
  const p = new URLSearchParams({
    journey: reference.id,
    revision: reference.revision,
  });
  if (optionId) p.set('option', optionId);
  return `/?${p}`;
}
export function journeyAccountCall(
  path: string,
  body: unknown,
  signal?: AbortSignal,
) {
  return accountCall(`/journey-buddy/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...journeySessionHeaders() },
    body: JSON.stringify(body),
    signal,
  });
}
export async function restoreJourney(search: string, signal: AbortSignal) {
  const reference = referenceFromSearch(search);
  const saved = pendingJourney(search);
  const optionId = new URLSearchParams(search).get('option');
  const selection = optionId
    ? JourneySelection.parse({ reference, optionId })
    : null;
  const snapshot = JourneySnapshot.parse(
    await journeyAccountCall(
      selection ? 'select' : 'load',
      selection ?? reference,
      signal,
    ),
  );
  const destination = saved.destination;
  destination.location = {
    ...destination.location!,
    lng: snapshot.input.destination[0],
    lat: snapshot.input.destination[1],
  };
  const origin: Origin = { ...saved.origin, coordinate: snapshot.input.origin };
  return {
    snapshot,
    origin,
    destination,
    optionId,
    preference: saved.preference,
  };
}
/** Local inputs may be reused for a NEW calculation, never to authorize a saved route. */
export function pendingJourney(search: string) {
  try {
    const reference = referenceFromSearch(search);
    const saved = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null');
    const previous = JourneyReference.parse(saved?.reference);
    if (
      previous.id !== reference.id ||
      previous.revision !== reference.revision
    )
      throw new Error('Comparația locală s-a schimbat. Recalculează.');
    const input = CompleteJourneyRequest.parse(saved.input);
    const destination = Destination.parse(saved.destination);
    destination.location = {
      ...destination.location!,
      lng: input.destination[0],
      lat: input.destination[1],
    };
    const origin: Origin = {
      name:
        typeof saved.origin?.name === 'string' ? saved.origin.name : 'Plecare',
      coordinate: input.origin,
    };
    return {
      input,
      origin,
      destination,
      preference: JourneyPreference.parse(saved.preference),
    };
  } catch {
    throw new Error(
      'Referința locală nu este disponibilă sau s-a schimbat. Recalculează drumul.',
    );
  }
}

export function settingsFromJourney(input: CompleteJourneyRequest) {
  const d = input.arriveAt ? new Date(input.arriveAt) : null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    mode: input.parkingPreference,
    stayMinutes: input.stayMinutes,
    maxWalkMinutes: input.maxWalkMinutes,
    schoolZone: input.schoolZone === 'auto',
    arrive: d
      ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
      : null,
  };
}
