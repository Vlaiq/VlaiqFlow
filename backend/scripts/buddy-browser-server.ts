// ISOLATED SYNTHETIC TEST HARNESS. Never started by the production application.
import express from 'express';
import { BuddyEconomy } from '../src/features/buddy/economy';
import { MissionEngine } from '../src/features/buddy/missions';
import { BuddyService } from '../src/features/buddy/service';
import { createBuddyRouter } from '../src/features/buddy/router';
import { fixtureIdentity, FixtureAI, FixtureUnitOfWork } from '../test/buddy/fixtures';

if (process.env.NODE_ENV !== 'test' || process.env.BUDDY_FIXTURES !== '1') throw new Error('Requires explicit test-only fixture mode');
const economy = new BuddyEconomy(new FixtureUnitOfWork());
const service = new BuddyService(new FixtureAI(), new MissionEngine(), economy, economy);
const app = express(); app.disable('x-powered-by'); app.use(express.json({ limit: '16kb' }));
app.use('/api/buddy', createBuddyRouter({ service, progress: economy,
  // Purchases deliberately absent; the test UI permits preview only.
  authenticate: (req, res, next) => /^Bearer buddy-fixture-(alice|bob)$/.test(req.headers.authorization ?? '') ? next() : res.sendStatus(401),
  identity: req => fixtureIdentity(req.headers.authorization?.endsWith('bob') ? 'bob' : 'alice'),
}));
app.listen(8788, '127.0.0.1', () => console.log('Buddy SYNTHETIC TEST API: http://127.0.0.1:8788 (no real AI, identity or coins)'));
