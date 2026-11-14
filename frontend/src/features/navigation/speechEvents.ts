import type { NavigationRoute } from '@vlaiq/shared';
import type { NavigationSpeechEvent } from '../../../../shared/src/flowVoice';
import { instruction } from './geometry';
interface Progress {
  session: string;
  revision: string;
  step: NavigationRoute['steps'][number];
  distance: number;
  speed: number | null;
  accuracy: number;
  fixAge: number;
  demo: boolean;
  arrived: boolean;
  parking: boolean;
  now: number;
}
/** Timing derives from validated geometry progress, never from conversational model output. */
export function speechEvent(p: Progress): NavigationSpeechEvent | null {
  if (p.accuracy > 50 || p.fixAge > 8000 || p.fixAge < -1000) return null;
  const stepId = String(p.step.index);
  const common = {
    session_id: p.session,
    route_revision: p.revision,
    step_id: stepId,
    locale: 'ro' as const,
  };
  const prefix = p.demo ? 'Simulare. ' : '';
  if (p.arrived)
    return {
      ...common,
      event_id: `${p.revision}:arrival`,
      phase: 'status',
      kind: p.parking ? 'parking_arrival' : 'arrival',
      text: `${prefix}${p.parking ? 'Ai ajuns la parcarea selectată.' : 'Ai ajuns la destinație.'}`,
      priority: 'normal',
      expires_at_ms: p.now + 12000,
    };
  if (p.step.type === 'arrive' || p.step.type === 'depart') return null;
  const speed = Math.max(1.5, Math.min(35, p.speed ?? 8));
  const prepare = Math.max(60, Math.min(300, speed * 18));
  const immediate = Math.max(12, Math.min(40, speed * 3));
  if (p.distance > prepare) return null;
  const phase = p.distance <= immediate ? 'now' : 'prepare';
  const action = `${instruction(p.step)}${p.step.road ? ` pe ${p.step.road}` : ''}.`;
  const kind =
    p.step.type.includes('roundabout') || p.step.type === 'rotary'
      ? 'roundabout'
      : p.step.type === 'turn'
        ? 'turn'
        : 'straight';
  return {
    ...common,
    event_id: `${p.revision}:${stepId}:${phase}`,
    phase,
    kind,
    text: `${prefix}${phase === 'prepare' ? `Peste ${Math.max(10, Math.round(p.distance / 10) * 10)} de metri, ${action.charAt(0).toLowerCase()}${action.slice(1)}` : action}`,
    priority: phase === 'now' ? 'urgent' : 'normal',
    expires_at_ms:
      p.now +
      Math.max(500, Math.min(phase === 'prepare' ? 12000 : 5000, (p.distance / speed) * 1000)),
  };
}
