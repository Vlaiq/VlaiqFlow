/**
 * fetch() for our own API. A dropped connection or a timeout becomes a plain Romanian message instead
 * of the browser's English text ("Failed to fetch"). A cancellation (AbortError) is passed through
 * unchanged, because callers ignore requests they cancelled themselves.
 */
export const OFFLINE_MESSAGE = 'Nu ne putem conecta la server. Verifică internetul și reîncearcă.';
export const TIMEOUT_MESSAGE = 'Serverul răspunde prea greu acum. Reîncearcă.';

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') throw new Error(TIMEOUT_MESSAGE);
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    if (e instanceof TypeError) throw new Error(OFFLINE_MESSAGE);
    throw e;
  }
}

/** Message for an error response that carried no readable reason of its own. */
export const httpErrorMessage = (status: number) =>
  `Serverul a răspuns cu o eroare (HTTP ${status}). Reîncearcă.`;
