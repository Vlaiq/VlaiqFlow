import { useCallback, useEffect, useRef, useState } from 'react';
import {
  evaluateMotion,
  type MotionMode,
  type MotionPoint,
  type MotionResult,
} from '@vlaiq/shared';
import { motionApi } from './motionApi';

export type ActivityState =
  | 'idle'
  | 'acquiring'
  | 'recording'
  | 'paused'
  | 'submitting'
  | 'completed';
export function useActivity(onReward: (result: MotionResult) => void) {
  const [state, setState] = useState<ActivityState>('idle');
  const [mode, setMode] = useState<MotionMode>('walk');
  const [demo, setDemo] = useState(false);
  const [points, setPoints] = useState<MotionPoint[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [gps, setGps] = useState('GPS neactivat');
  const [sensor, setSensor] = useState('Senzori opționali');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MotionResult | null>(null);
  const id = useRef<string>();
  const records = useRef<MotionPoint[]>([]);
  const segment = useRef(0);
  const watch = useRef<number>();
  const ticket = useRef(0);
  const sensorEvents = useRef(0);
  const sensorListener = useRef<(event: DeviceMotionEvent) => void>();
  const demoTime = useRef(0);
  const clearGps = useCallback(() => {
    if (watch.current != null) navigator.geolocation?.clearWatch(watch.current);
    watch.current = undefined;
  }, []);
  const cleanupSensor = useCallback(() => {
    if (sensorListener.current) window.removeEventListener('devicemotion', sensorListener.current);
    sensorListener.current = undefined;
  }, []);
  const stop = useCallback(() => {
    clearGps();
    cleanupSensor();
  }, [clearGps, cleanupSensor]);

  const enableSensor = useCallback(async () => {
    const current = ticket.current;
    if (typeof DeviceMotionEvent === 'undefined') {
      setSensor('Senzori indisponibili · GPS suficient');
      return;
    }
    const eventType = DeviceMotionEvent as typeof DeviceMotionEvent & {
      requestPermission?: () => Promise<string>;
    };
    try {
      if (eventType.requestPermission && (await eventType.requestPermission()) !== 'granted') {
        setSensor('Senzori refuzați · folosim GPS');
        return;
      }
      if (current !== ticket.current) return;
      cleanupSensor();
      sensorEvents.current = 0;
      sensorListener.current = (event) => {
        const signal = event.accelerationIncludingGravity ?? event.acceleration;
        if (
          !signal ||
          ![signal.x, signal.y, signal.z].some((value) => value != null && Number.isFinite(value))
        )
          return;
        if (++sensorEvents.current === 1) setSensor('Senzor disponibil · semnal auxiliar');
      };
      window.addEventListener('devicemotion', sensorListener.current);
      setSensor('Senzor activat · așteptăm observații');
    } catch {
      setSensor('Senzori indisponibili · folosim GPS');
    }
  }, [cleanupSensor]);

  useEffect(() => {
    if (state !== 'recording') cleanupSensor();
  }, [state, cleanupSensor]);

  const start = useCallback(
    async (simulated = false) => {
      ticket.current++;
      const current = ticket.current;
      stop();
      setDemo(simulated);
      setError(null);
      setResult(null);
      setPoints([]);
      records.current = [];
      setElapsed(0);
      segment.current = 0;
      demoTime.current = 0;
      setState('acquiring');
      if (simulated) {
        id.current = undefined;
        setGps('DEMO · observații sintetice');
        setState('recording');
        return;
      }
      if (!navigator.geolocation || !window.isSecureContext) {
        setError('Localizarea necesită HTTPS și un browser cu GPS.');
        setState('idle');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          if (current !== ticket.current) return;
          try {
            const session = await motionApi.start(mode);
            if (current !== ticket.current) {
              void motionApi.cancel(session.id).catch(() => {});
              return;
            }
            id.current = session.id;
            setState(document.hidden ? 'paused' : 'recording');
            setGps(`GPS ±${Math.round(position.coords.accuracy)} m`);
          } catch (e) {
            if (current === ticket.current) {
              setError(e instanceof Error ? e.message : 'Nu am putut începe activitatea.');
              setState('idle');
            }
          }
        },
        (e) => {
          if (current === ticket.current) {
            setError(
              e.code === 1
                ? 'Locația a fost refuzată. Activează permisiunea sau încearcă DEMO.'
                : 'Nu am putut obține poziția. Încearcă într-un spațiu deschis.',
            );
            setState('idle');
          }
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
      );
    },
    [mode, stop],
  );

  useEffect(() => {
    if (state !== 'recording') return;
    const timer = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    if (demo) {
      // Deliberately synthetic observations, never submitted to the reward server.
      const simulation = window.setInterval(() => {
        demoTime.current += 10;
        const t = demoTime.current;
        const point: MotionPoint = {
          lat: 45.75 + t * 0.000014,
          lng: 21.22,
          accuracy: 4,
          timestamp: 1700000000000 + t * 1000,
          segment: segment.current,
        };
        records.current.push(point);
        setPoints([...records.current]);
      }, 500);
      return () => {
        clearInterval(timer);
        clearInterval(simulation);
      };
    }
    watch.current = navigator.geolocation.watchPosition(
      (position) => {
        const c = position.coords;
        setGps(
          c.accuracy > 35
            ? 'GPS imprecis · distanța nu este creditată'
            : `GPS ±${Math.round(c.accuracy)} m`,
        );
        if (Date.now() - position.timestamp > 15000 || records.current.length >= 2000) return;
        const last = records.current.at(-1);
        if (last && position.timestamp - last.timestamp < 4000) return;
        records.current.push({
          lat: c.latitude,
          lng: c.longitude,
          accuracy: c.accuracy,
          timestamp: position.timestamp,
          segment: segment.current,
        });
        setPoints([...records.current]);
        if (records.current.length >= 2000) {
          setError('Limita sesiunii a fost atinsă. Finalizează pentru evaluare.');
          setState('paused');
        }
      },
      () => {
        setGps('GPS întrerupt · sesiunea este în pauză');
        setState('paused');
        segment.current++;
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
    return () => {
      clearInterval(timer);
      clearGps();
    };
  }, [state, demo, clearGps]);

  useEffect(() => {
    const hidden = () => {
      if (document.hidden && state === 'recording') {
        segment.current++;
        setState('paused');
        setGps('Pauză · aplicația a trecut în fundal');
      }
    };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  }, [state]);
  useEffect(() => {
    if (state !== 'recording' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | undefined,
      disposed = false;
    void navigator.wakeLock
      .request('screen')
      .then((s) => {
        if (disposed) void s.release();
        else lock = s;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      void lock?.release();
    };
  }, [state]);
  useEffect(
    () => () => {
      ticket.current++;
      stop();
    },
    [stop],
  );

  const pause = () => {
    segment.current++;
    setState('paused');
  };
  const resume = () => {
    segment.current++;
    setState('recording');
  };
  const cancel = async () => {
    ticket.current++;
    stop();
    setState('idle');
    setPoints([]);
    records.current = [];
    setResult(null);
    setError(null);
    if (id.current) {
      const old = id.current;
      id.current = undefined;
      try {
        await motionApi.cancel(old);
      } catch {
        setError(
          'Înregistrarea locală a fost oprită. Serverul nu a confirmat anularea; nu s-au acordat recompense.',
        );
      }
    }
  };
  const finish = async () => {
    stop();
    setState('submitting');
    setError(null);
    if (demo) {
      const evaluation = evaluateMotion(mode, records.current);
      const demoResult: MotionResult = {
        evaluation,
        wallet: {
          balance: evaluation.coins,
          lifetime: evaluation.coins,
          dailyEarned: evaluation.coins,
          todayActivities: evaluation.coins ? 1 : 0,
          transactions: [],
        },
      };
      setResult(demoResult);
      setState('completed');
      return;
    }
    if (!id.current) {
      setError('Sesiunea nu este disponibilă.');
      setState('paused');
      return;
    }
    try {
      const response = await motionApi.finish(id.current, records.current);
      setResult(response);
      onReward(response);
      setState('completed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Evaluarea a eșuat.');
      setState('paused');
    }
  };
  return {
    state,
    mode,
    setMode,
    demo,
    points,
    elapsed,
    gps,
    sensor,
    enableSensor,
    error,
    result,
    start,
    pause,
    resume,
    cancel,
    finish,
    evaluation: evaluateMotion(mode, points),
  };
}
