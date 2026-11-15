import { identityStore } from '../src/services/identityStore';
import { migrateBuddy } from '../src/features/buddy/integration';
const store = identityStore();
try {
  await store.migrate();
  await migrateBuddy(store.pool);
  console.log('FLOW Identity and Buddy migrations applied.');
} finally {
  await store.pool.end();
}
