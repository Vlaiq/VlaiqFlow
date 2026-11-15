import { useEffect, useReducer } from 'react';

export type BuddyPose = 'idle' | 'wave' | 'listening' | 'thinking' | 'talking' | 'curious' | 'explaining' | 'pointing' | 'happy' | 'celebrating' | 'encouraging' | 'sleeping';
export type BuddyEvent =
  | { type: 'ENTER' | 'RESET' | 'VOICE_START' | 'VOICE_END' | 'LISTEN_START' | 'LISTEN_END' | 'REQUEST_START' | 'REQUEST_END' | 'REQUEST_ERROR' | 'CITY_SCENARIO_STARTED' | 'CITY_USER_CHOICE' | 'CITY_SIMULATION_RUNNING' | 'CITY_RESULT_READY' | 'MISSION_COMPLETED' | 'MISSION_RETRY' }
  | { type: 'GESTURE_END'; generation: number }
  | { type: 'IDLE_TICK'; blink: boolean; gaze: number };
export interface AnimationState {
  pose: BuddyPose; gesture: BuddyPose | null; generation: number;
  speaking: boolean; listening: boolean; thinking: boolean; blink: boolean; gaze: number;
}
export const initialAnimation: AnimationState = { pose: 'idle', gesture: null, generation: 0, speaking: false, listening: false, thinking: false, blink: false, gaze: 0 };
const choose = (s: AnimationState): BuddyPose => s.gesture === 'celebrating' ? 'celebrating' : s.speaking ? 'talking' : s.listening ? 'listening' : s.thinking ? 'thinking' : s.gesture ?? 'idle';
export function animationReducer(state: AnimationState, event: BuddyEvent): AnimationState {
  let s = { ...state };
  const gesture = (g: BuddyPose | null) => { s.gesture = g; s.generation++; };
  switch (event.type) {
    case 'RESET': return { ...initialAnimation, generation: state.generation + 1 };
    case 'ENTER': gesture('wave'); break;
    case 'VOICE_START': s.speaking = true; break;
    case 'VOICE_END': s.speaking = false; break;
    case 'LISTEN_START': s.listening = true; gesture(null); break;
    case 'LISTEN_END': s.listening = false; break;
    case 'REQUEST_START': s.thinking = true; gesture(null); break;
    case 'REQUEST_END': s.thinking = false; gesture('happy'); break;
    case 'REQUEST_ERROR': s.thinking = false; s.speaking = false; gesture('encouraging'); break;
    case 'CITY_SCENARIO_STARTED': gesture('curious'); break;
    case 'CITY_USER_CHOICE': gesture('pointing'); s.gaze = 1; break;
    case 'CITY_SIMULATION_RUNNING': gesture('explaining'); break;
    case 'CITY_RESULT_READY': gesture('pointing'); break;
    case 'MISSION_COMPLETED': gesture('celebrating'); break;
    case 'MISSION_RETRY': gesture('encouraging'); break;
    case 'GESTURE_END': if (event.generation === s.generation) gesture(null); break;
    case 'IDLE_TICK': s.blink = event.blink; if (s.pose === 'idle') s.gaze = event.gaze; break;
  }
  s.pose = choose(s); return s;
}
/** The only idle scheduler. No render loop; CSS handles interpolation and articulated gestures. */
export function useBuddyAnimation(accountKey: string) {
  const [state, dispatch] = useReducer(animationReducer, initialAnimation);
  useEffect(() => {
    dispatch({ type: 'RESET' }); dispatch({ type: 'ENTER' });
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer: ReturnType<typeof setTimeout>; let stopped = false; let blink = false; let double = false;
    const tick = () => {
      if (stopped) return;
      blink = !blink;
      dispatch({ type: 'IDLE_TICK', blink, gaze: Math.random() < 0.25 ? (Math.random() - 0.5) * 1.6 : 0 });
      const delay = blink ? 120 : double ? 180 : 3200 + Math.random() * 4200;
      double = !blink && !double && Math.random() < 0.15;
      timer = setTimeout(tick, delay);
    };
    const schedule = () => {
      clearTimeout(timer);
      if (!media.matches) timer = setTimeout(tick, 2400);
      else dispatch({ type: 'IDLE_TICK', blink: false, gaze: 0 });
    };
    schedule(); media.addEventListener('change', schedule);
    return () => { stopped = true; clearTimeout(timer); media.removeEventListener('change', schedule); };
  }, [accountKey]);
  return { state, dispatch };
}
