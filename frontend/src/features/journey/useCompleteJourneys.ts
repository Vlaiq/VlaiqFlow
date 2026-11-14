import { useEffect, useState } from 'react';
import { CompleteJourneyResponse, type CompleteJourneyRequest } from '@vlaiq/shared';
import { apiFetch } from '../../services/http';
export type CompleteLoad =
  | { state: 'idle' | 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ok'; value: CompleteJourneyResponse };
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
/** The cleanup guard also handles a provider that ignores cancellation and resolves out of order. */
export async function fetchCompleteJourneys(
  input: CompleteJourneyRequest,
  signal: AbortSignal,
): Promise<CompleteJourneyResponse> {
  const res = await apiFetch(`${BASE}/api/journeys/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(input),
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message ?? 'Călătoriile nu sunt disponibile acum.');
  const parsed = CompleteJourneyResponse.safeParse(data);
  if (!parsed.success) throw new Error('Nu putem verifica rutele primite. Reîncearcă.');
  return parsed.data;
}
export type PublishedComparison = { input: CompleteJourneyRequest; value: CompleteJourneyResponse };
export function useCompleteJourneys(
  input: CompleteJourneyRequest | null,
  attempt: number,
  published?: PublishedComparison | null,
) {
  const key = input ? JSON.stringify(input) : null;
  const supplied = published && JSON.stringify(published.input) === key ? published.value : null;
  const [snapshot, setSnapshot] = useState<{
    key: string | null;
    attempt: number;
    result: CompleteLoad;
  }>({ key: null, attempt: 0, result: { state: 'idle' } });
  useEffect(() => {
    const setResult = (result: CompleteLoad) => setSnapshot({ key, attempt, result });
    if (!key) {
      setResult({ state: 'idle' });
      return;
    }
    if (supplied) {
      setResult({ state: 'ok', value: supplied });
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(
      () => ctrl.abort(new Error('Planificarea durează prea mult. Reîncearcă.')),
      45000,
    );
    let alive = true;
    setResult({ state: 'loading' });
    fetchCompleteJourneys(JSON.parse(key), ctrl.signal)
      .then((value) => {
        if (alive) setResult({ state: 'ok', value });
      })
      .catch((error) => {
        if (alive)
          setResult({
            state: 'error',
            message: ctrl.signal.aborted
              ? 'Planificarea durează prea mult. Reîncearcă.'
              : error instanceof Error
                ? error.message
                : 'Nu putem contacta planificatorul. Verifică conexiunea.',
          });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      alive = false;
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [key, attempt, supplied]);
  if (supplied) return { state: 'ok', value: supplied } as const;
  return snapshot.key === key && snapshot.attempt === attempt
    ? snapshot.result
    : ({ state: key ? 'loading' : 'idle' } as CompleteLoad);
}
