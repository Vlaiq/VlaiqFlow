import { identityStore } from '../src/services/identityStore';
const store = identityStore();
try {
  await store.migrate();
  console.log('FLOW Identity migration applied.');
} finally {
  await store.pool.end();
}
