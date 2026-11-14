import { useEffect, useState } from 'react';
import { ParkedCar, type ParkedCarInput } from '@vlaiq/shared';

/**
 * The parked car lives only in this browser (localStorage). It never goes to our server.
 * Storage can be blocked (private mode, previews): every access is guarded and the app works without it.
 */
const KEY = 'vlaiq.parkedCar.v1';
const EVENT = 'vlaiq-parked-car';
/** A car saved more than 2 days ago is stale: we forget it instead of guiding to an old spot. */
const MAX_AGE_MS = 48 * 3600_000;

export function loadCar(now = Date.now()): ParkedCar | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = ParkedCar.safeParse(JSON.parse(raw));
    if (!parsed.success || now - new Date(parsed.data.parkedAt).getTime() > MAX_AGE_MS) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

/** Returns false when the browser refuses storage, so the UI can say the spot was not saved. */
export function saveCar(input: ParkedCarInput): boolean {
  const car = ParkedCar.parse(input);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(car));
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}

export function updateCar(change: Partial<ParkedCar>): boolean {
  const car = loadCar();
  return car ? saveCar({ ...car, ...change }) : false;
}

export function clearCar() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** The saved car, kept in sync across screens and tabs. */
export function useParkedCar(): ParkedCar | null {
  const [car, setCar] = useState<ParkedCar | null>(() => loadCar());
  useEffect(() => {
    const sync = () => setCar(loadCar());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return car;
}
