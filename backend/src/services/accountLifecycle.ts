import type { Identity } from '../middleware/identity';

// Process-local caches subscribe; durable account data is erased by PostgreSQL cascades.
const erasedListeners = new Set<(identity: Identity) => void>();
export function onAccountErased(listener: (identity: Identity) => void) {
  erasedListeners.add(listener);
  return () => {
    erasedListeners.delete(listener);
  };
}
export function accountErased(identity: Identity) {
  for (const listener of erasedListeners) listener(identity);
}
