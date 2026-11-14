import { useEffect, useRef, useState, useCallback } from 'react';
import {
  CompleteJourneyRequest,
  type CompleteJourneyResponse,
  type Destination,
  type JourneyPreference,
  normalize,
} from '@vlaiq/shared';
import { isInTimisCounty } from '../../../../shared/src/county';
import {
  type Mode,
  type Preferences,
  type Comparison,
  type Priority,
} from '../../../../shared/src/flowVoice';
import { arriveIso, type ParkingSettings } from '../parking/settings';
import type { Origin } from '../parking/ParkingDetail';
import type { JourneyMapSelection } from '../journey/GreenSwitch';
import {
  fetchCompleteJourneys,
  useCompleteJourneys,
  type PublishedComparison,
} from '../journey/useCompleteJourneys';
import { JourneyTools, FlowError, type JourneyToolAdapter } from './tools';
import {
  modeCategory,
  contractComparison,
  contractJourney,
  constrainComparison,
  resolvePlace,
} from './journeyContract';
import { navigationState } from './navigationState';
import { navigationSpeech } from './speech';

const SPOKEN_HERE =
  /^(?:de la |din |de )?(?:locatia mea|pozitia mea|locatia curenta|aici|unde sunt|unde ma aflu)$/;
/** Current position as a trip start, within the county and accurate enough to route from. */
function locate(
  cache: { current: { origin: Origin; at: number } | null },
  signal: AbortSignal,
): Promise<Origin> {
  const cached = cache.current;
  if (cached && Date.now() - cached.at < 60_000) return Promise.resolve(cached.origin);
  return new Promise<Origin>((resolve, reject) => {
    if (!navigator.geolocation || !window.isSecureContext)
      return reject(new Error('Localizarea necesită HTTPS.'));
    const abort = () => reject(new Error('Cererea s-a oprit.'));
    signal.addEventListener('abort', abort, { once: true });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        signal.removeEventListener('abort', abort);
        const coordinate: Origin['coordinate'] = [p.coords.longitude, p.coords.latitude];
        if (p.coords.accuracy > 300) return reject(new Error('Poziția ta e prea imprecisă acum.'));
        if (!isInTimisCounty(coordinate))
          return reject(new Error('Poziția ta e în afara județului Timiș.'));
        const origin = { name: `Locația mea · ±${Math.round(p.coords.accuracy)} m`, coordinate };
        cache.current = { origin, at: Date.now() };
        resolve(origin);
      },
      (e) => {
        signal.removeEventListener('abort', abort);
        reject(
          new Error(e.code === 1 ? 'Accesul la locație e refuzat.' : 'Nu am putut afla unde ești.'),
        );
      },
      { enableHighAccuracy: true, timeout: 4000, maximumAge: 30_000 },
    );
  });
}
const placeLabel = (d: Destination) => `${d.name}${d.detail ? ` · ${d.detail}` : ''}`;

interface Inputs {
  origin: Origin | null;
  destination: Destination | null;
  places: Destination[] | null;
  settings: ParkingSettings;
  demo: boolean;
  setOrigin: (value: Origin) => void;
  setDestination: (value: Destination) => void;
  setSettings: (update: (value: ParkingSettings) => ParkingSettings) => void;
  showJourney: (value: JourneyMapSelection | null) => void;
}
type Plan = {
  origin: Origin;
  destination: Destination;
  input: CompleteJourneyRequest;
  value: CompleteJourneyResponse;
  preferences: Preferences;
  mode: Mode | null;
};
export function useFlowPlanner(props: Inputs) {
  const [preference, setPreference] = useState<JourneyPreference>('balanced');
  const [journeyMode, setJourneyMode] = useState<Mode>('driving');
  const [temporaryMode, setTemporaryMode] = useState<Mode | null>(null);
  const [manualId, setManualId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [published, setPublished] = useState<PublishedComparison | null>(null);
  const [, refreshSession] = useState(0);
  /** Places the user can tap when a spoken destination matched several (cleared once one is chosen). */
  const [choices, setChoices] = useState<Destination[]>([]);
  /** Last GPS position read for FLOW Voice, reused for a minute so a spoken trip starts fast. */
  const here = useRef<{ origin: Origin; at: number } | null>(null);
  const destinationId = props.destination?.id;
  useEffect(() => setChoices([]), [destinationId]);
  const revision = useRef(0);
  const sessionId = useRef(0);
  const changed = useCallback(() => {
    revision.current++;
  }, []);
  const priority: Priority | null =
    props.settings.mode === 'cheap'
      ? 'cheapest'
      : props.settings.mode === 'less_walk'
        ? 'least_walking'
        : preference === 'fastest'
          ? 'fastest'
          : preference === 'green'
            ? 'eco'
            : null;
  const preferences: Preferences = {
    priority,
    max_walking_minutes: props.settings.maxWalkMinutes,
    journey_mode: journeyMode,
  };
  const request = (origin: Origin | null, destination: Destination | null, mode: Mode | null) =>
    origin && destination?.location
      ? CompleteJourneyRequest.parse({
          origin: origin.coordinate,
          destination: [destination.location.lng, destination.location.lat],
          stayMinutes: props.settings.stayMinutes,
          maxWalkMinutes: props.settings.maxWalkMinutes,
          parkingPreference: props.settings.mode,
          schoolZone: props.settings.schoolZone ? 'auto' : 'off',
          ...(arriveIso(props.settings) ? { arriveAt: arriveIso(props.settings) } : {}),
          ...(mode ? { modes: [modeCategory[mode]] } : {}),
        })
      : null;
  const input = request(props.origin, props.destination, temporaryMode);
  const signature = JSON.stringify([input, props.demo, journeyMode, priority, sessionId.current]);
  const previous = useRef(signature);
  if (previous.current !== signature) {
    previous.current = signature;
    revision.current++;
  }
  const result = useCompleteJourneys(input, attempt, published);
  const value = result.state === 'ok' ? result.value : null;
  const comparisonRef = useRef<{
    value: CompleteJourneyResponse;
    signature: string;
    comparison: Comparison;
  } | null>(null);
  const mapAck = useRef<{ comparisonId: string; journeyId: string } | null>(null);
  const comparison =
    value && props.origin && props.destination
      ? (() => {
          const old = comparisonRef.current;
          if (old?.value === value && old.signature === signature) return old.comparison;
          const comparison = contractComparison(
            value,
            `flow-${sessionId.current}-${crypto.randomUUID()}`,
            props.demo ? 'demo' : 'live',
            props.origin.name.startsWith('Locația mea') ? 'Locația curentă' : props.origin.name,
            props.destination.name,
            { ...preferences, journey_mode: temporaryMode ?? journeyMode },
          );
          comparisonRef.current = { value, signature, comparison };
          return comparison;
        })()
      : null;
  const selectedId =
    manualId && value?.journeys.some((j) => j.id === manualId)
      ? manualId
      : (value?.rankings[preference].recommendedId ?? null);
  const latest = useRef({
    props,
    comparison,
    value,
    selectedId,
    preferences,
    signature,
    temporaryMode,
    input,
  });
  latest.current = {
    props,
    comparison,
    value,
    selectedId,
    preferences,
    signature,
    temporaryMode,
    input,
  };
  const adapterRef = useRef<JourneyToolAdapter<Plan>>();
  if (!adapterRef.current)
    adapterRef.current = {
      revision: () => String(revision.current),
      context: () => {
        const s = latest.current;
        const nav = navigationState.context();
        return {
          environment: nav?.environment ?? (s.props.demo ? 'demo' : 'live'),
          origin: nav
            ? { label: nav.origin }
            : s.props.origin
              ? {
                  label: s.props.origin.name.startsWith('Locația mea')
                    ? 'Locația curentă'
                    : s.props.origin.name,
                }
              : null,
          destination: nav
            ? { label: nav.destination }
            : s.props.destination
              ? { label: s.props.destination.name }
              : null,
          preferences: s.preferences,
          comparison: s.comparison,
          selected_journey:
            s.comparison?.journeys.find((j) => j.journey_id === s.selectedId) ?? null,
          navigation: {
            ...navigationState.read(),
            last_instruction: navigationState.read().active
              ? navigationSpeech.currentInstruction()
              : null,
          },
        };
      },
      update: (patch) => {
        changed();
        mapAck.current = null;
        setManualId(null);
        setPublished(null);
        const s = latest.current;
        const next = { ...s.preferences, ...patch };
        const fields = (Object.keys(patch) as (keyof Preferences)[]).filter(
          (key) => patch[key] !== s.preferences[key],
        );
        if (patch.priority)
          setPreference(
            patch.priority === 'fastest'
              ? 'fastest'
              : patch.priority === 'eco'
                ? 'green'
                : 'balanced',
          );
        if (patch.journey_mode) {
          setJourneyMode(patch.journey_mode);
          setTemporaryMode(patch.journey_mode);
        }
        s.props.setSettings((old) => ({
          ...old,
          ...(patch.max_walking_minutes !== undefined
            ? { maxWalkMinutes: patch.max_walking_minutes }
            : {}),
          ...(patch.priority
            ? {
                mode:
                  patch.priority === 'cheapest'
                    ? 'cheap'
                    : patch.priority === 'least_walking'
                      ? 'less_walk'
                      : 'balanced',
              }
            : {}),
        }));
        // Make sequential tool calls in the same event loop observe the atomic update.
        s.preferences = next;
        s.comparison = null;
        s.selectedId = null;
        s.props.showJourney(null);
        return { preferences: next, changed_fields: fields };
      },
      calculate: async (patch, signal) => {
        const s = latest.current;
        if (!s.props.places && (patch.origin_text || patch.destination_text))
          throw new FlowError('SERVICE_UNAVAILABLE', 'Catalogul locațiilor nu este disponibil.');
        // "de la locația mea" / "de aici" means the current position, never a place called that.
        const fromHere = !!patch.origin_text && SPOKEN_HERE.test(normalize(patch.origin_text));
        const o =
          patch.origin_text && !fromHere ? resolvePlace(patch.origin_text, s.props.places ?? []) : null;
        let origin: Origin | null = o?.location
          ? { name: o.name, coordinate: [o.location.lng, o.location.lat] }
          : fromHere
            ? null
            : s.props.origin;
        let destination: Destination | null;
        try {
          destination = patch.destination_text
            ? resolvePlace(patch.destination_text, s.props.places ?? [])
            : s.props.destination;
        } catch (e) {
          // Several places match: offer them on screen as well as to the agent.
          if (e instanceof FlowError && e.code === 'AMBIGUOUS_LOCATION' && e.candidates)
            setChoices(
              e.candidates.flatMap((c) => {
                const d = (s.props.places ?? []).find((p) => placeLabel(p) === c.label);
                return d?.location ? [d] : [];
              }),
            );
          throw e;
        }
        setChoices([]);
        // A spoken destination is shown at once (map, parkings), even before a route can be compared.
        // This runs before any await, so it acts on the state the tool call was validated against.
        const showDestination = () => {
          if (
            destination?.location &&
            destination.id !== latest.current.props.destination?.id &&
            String(revision.current) === ticket
          )
            latest.current.props.setDestination(destination);
        };
        const ticket = String(revision.current);
        // No start point given: drivers mean "from where I am", so use the current GPS position.
        let gpsProblem: string | null = null;
        if (!origin)
          origin = await locate(here, signal).catch((e: unknown) => {
            gpsProblem = e instanceof Error ? e.message : null;
            return null;
          });
        if (!origin) {
          if (!signal.aborted) showDestination();
          const why = gpsProblem ?? 'Nu știu de unde pornești.';
          throw new FlowError(
            'MISSING_ORIGIN',
            destination?.location
              ? `Am pus ${destination.name} pe hartă, cu parcările din jur. ${why} Spune de unde pornești sau alege pe hartă.`
              : `${why} Spune de unde pornești sau alege pe hartă.`,
          );
        }
        if (!destination)
          throw new FlowError('MISSING_DESTINATION', 'Spune destinația călătoriei.');
        if (!destination.location)
          throw new FlowError('NO_ROUTE', 'Destinația nu are o poziție verificată.');
        const mode = patch.journey_mode ?? s.temporaryMode;
        const input = CompleteJourneyRequest.parse({
          origin: origin.coordinate,
          destination: [destination.location.lng, destination.location.lat],
          stayMinutes: s.props.settings.stayMinutes,
          maxWalkMinutes: s.preferences.max_walking_minutes ?? 180,
          parkingPreference:
            s.preferences.priority === 'cheapest'
              ? 'cheap'
              : s.preferences.priority === 'least_walking'
                ? 'less_walk'
                : 'balanced',
          schoolZone: s.props.settings.schoolZone ? 'auto' : 'off',
          ...(arriveIso(s.props.settings) ? { arriveAt: arriveIso(s.props.settings) } : {}),
          ...(mode ? { modes: [modeCategory[mode]] } : {}),
        });
        const raw = await fetchCompleteJourneys(input, signal).catch((e: unknown) => {
          // No route right now: still show the place the user asked for.
          if (!signal.aborted) showDestination();
          throw e;
        });
        const value = constrainComparison(raw, input.maxWalkMinutes);
        if (!value.journeys.length) {
          if (!signal.aborted) showDestination();
          const excluded = raw.journeys.length > 0;
          throw new FlowError(
            excluded ? 'NO_MATCH' : 'NO_ROUTE',
            value.unavailable.map((u) => u.reason).join(' ') ||
              'Nicio rută verificată nu este disponibilă.',
          );
        }
        // Sort only validated facts. Unknown costs sort last and never become zero.
        if (s.preferences.priority === 'cheapest' || s.preferences.priority === 'least_walking') {
          const metric = (j: CompleteJourneyResponse['journeys'][number]) =>
            s.preferences.priority === 'cheapest'
              ? (j.parking?.fee.minorUnits ?? Infinity)
              : (contractJourney(j).walking_minutes ?? Infinity);
          value.journeys.sort((a, b) => metric(a) - metric(b));
          value.rankings.balanced.ids = value.journeys.map((j) => j.id);
          value.rankings.balanced.recommendedId = value.journeys[0]!.id;
        }
        return {
          origin,
          destination,
          input,
          value,
          mode,
          preferences: { ...s.preferences, journey_mode: mode ?? s.preferences.journey_mode },
        };
      },
      commit: (plan) => {
        const s = latest.current;
        changed();
        mapAck.current = null;
        s.props.setOrigin(plan.origin);
        s.props.setDestination(plan.destination);
        setTemporaryMode(plan.mode);
        setManualId(null);
        setPublished({ input: plan.input, value: plan.value });
        const comparison = contractComparison(
          plan.value,
          `flow-${sessionId.current}-${crypto.randomUUID()}`,
          s.props.demo ? 'demo' : 'live',
          plan.origin.name.startsWith('Locația mea') ? 'Locația curentă' : plan.origin.name,
          plan.destination.name,
          plan.preferences,
        );
        // The next render reuses this exact comparison ID and response.
        const nextSignature = JSON.stringify([
          plan.input,
          s.props.demo,
          s.preferences.journey_mode,
          s.preferences.priority,
          sessionId.current,
        ]);
        comparisonRef.current = { value: plan.value, signature: nextSignature, comparison };
        s.comparison = comparison;
        s.value = plan.value;
        return comparison;
      },
      select: async (selection, signal) => {
        const s = latest.current;
        if (s.comparison?.comparison_id !== selection.comparison_id)
          throw new FlowError('STALE_CONTEXT', 'Comparația a expirat. Recalculează.');
        const journey = s.value?.journeys.find((j) => j.id === selection.journey_id);
        if (!journey) throw new FlowError('NO_MATCH', 'Călătoria nu aparține comparației curente.');
        changed();
        setManualId(journey.id);
        s.selectedId = journey.id;
        s.props.showJourney({ value: journey, legId: null, comparisonId: selection.comparison_id });
        const ticket = revision.current;
        const deadline = Date.now() + 1200;
        while (!signal.aborted && Date.now() < deadline && revision.current === ticket) {
          if (
            mapAck.current?.comparisonId === selection.comparison_id &&
            mapAck.current?.journeyId === journey.id
          )
            break;
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
        if (signal.aborted || revision.current !== ticket)
          throw new FlowError(
            'STALE_CONTEXT',
            'Selecția a fost înlocuită sau sesiunea s-a închis.',
          );
        return {
          environment: s.props.demo ? 'demo' : 'live',
          comparison_id: selection.comparison_id,
          journey: contractJourney(journey),
          map_highlighted:
            mapAck.current?.comparisonId === selection.comparison_id &&
            mapAck.current?.journeyId === journey.id,
        };
      },
    };
  const [tools] = useState(() => new JourneyTools(adapterRef.current!));
  useEffect(() => navigationState.provideJourneys(() => latest.current.value?.journeys ?? []), []);
  useEffect(() => () => tools.end(), [tools]);
  const begin = useCallback(() => {
    tools.begin();
    setChoices([]);
    // If location is already allowed, read it now so "la Iulius Mall" can start from here at once.
    void navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((p) => (p.state === 'granted' ? locate(here, new AbortController().signal) : null))
      .catch(() => null);
    sessionId.current++;
    revision.current++;
    mapAck.current = null;
    const s = latest.current;
    const signature = JSON.stringify([
      s.input,
      s.props.demo,
      s.preferences.journey_mode,
      s.preferences.priority,
      sessionId.current,
    ]);
    previous.current = signature;
    s.signature = signature;
    s.comparison =
      s.value && s.props.origin && s.props.destination
        ? contractComparison(
            s.value,
            `flow-${sessionId.current}-${crypto.randomUUID()}`,
            s.props.demo ? 'demo' : 'live',
            s.props.origin.name.startsWith('Locația mea') ? 'Locația curentă' : s.props.origin.name,
            s.props.destination.name,
            { ...s.preferences, journey_mode: s.temporaryMode ?? s.preferences.journey_mode },
          )
        : null;
    comparisonRef.current =
      s.value && s.comparison ? { value: s.value, signature, comparison: s.comparison } : null;
    refreshSession((value) => value + 1);
  }, [tools]);
  return {
    tools,
    begin,
    choices,
    /** The user tapped one of the ambiguous places. */
    choose: (d: Destination) => {
      setChoices([]);
      props.setDestination(d);
    },
    result,
    preference,
    selectedId,
    comparisonId: comparison?.comparison_id,
    onPreference: (value: JourneyPreference) => {
      changed();
      setPreference(value);
      props.setSettings((old) => ({ ...old, mode: 'balanced' }));
      setManualId(null);
      setPublished(null);
    },
    onSelect: (id: string) => {
      changed();
      setManualId(id);
    },
    retry: () => {
      changed();
      setPublished(null);
      setAttempt((v) => v + 1);
    },
    acknowledge: useCallback((comparisonId: string, journeyId: string, rendered: boolean) => {
      mapAck.current = rendered ? { comparisonId, journeyId } : null;
    }, []),
    changed,
  };
}
