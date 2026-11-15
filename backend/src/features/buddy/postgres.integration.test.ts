import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PostgresBuddyUnitOfWork, type BuddySqlPool, type BuddyLedgerFactory } from './postgres';
import { BuddyEconomy } from './economy';
import { MissionEngine } from './missions';
import { fixtureIdentity } from '../../../test/buddy/fixtures';

// Opt-in REAL PostgreSQL concurrency tests with a SYNTHETIC host wallet adapter.
// Refuse databases that are not explicitly disposable. Never run against a user account DB.
const url = process.env.BUDDY_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite('Buddy real PostgreSQL transaction boundary / synthetic host ledger', () => {
  let pool: BuddySqlPool & { query(sql: string, values?: unknown[]): Promise<unknown>; end(): Promise<void> };
  let economy: BuddyEconomy;
  const issuer = 'https://buddy-postgres.test.invalid/';
  const id = { ...fixtureIdentity(), issuer };
  const ledger: BuddyLedgerFactory = (snapshot) => {
    const data = structuredClone(snapshot) as { entries: { key: string; coins: number; source: string }[] };
    const balance = () => data.entries.reduce((sum, e) => sum + e.coins, 0);
    const add = (coins: number, key: string, source: string) => {
      if (data.entries.some(e => e.key === key) || balance() + coins < 0) throw new Error('Ledger invariant');
      data.entries.push({ key, coins, source });
    };
    return { balance, credit: (n,k,s) => add(n,k,s), spend: (n,k,s) => add(-n,k,s), snapshot: () => data };
  };
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Disposable _test database required');
    const moduleName = process.env.BUDDY_TEST_PG_MODULE ?? 'pg';
    const { Pool } = await import(moduleName);
    pool = new Pool({ connectionString: url, max: 12 });
    // Matches only the columns used by the real identity transaction boundary.
    await pool.query('CREATE TABLE IF NOT EXISTS flow_accounts(issuer text NOT NULL,subject text NOT NULL,wallet jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(issuer,subject))');
    await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
    await pool.query('DELETE FROM flow_accounts WHERE issuer=$1', [issuer]);
    for (const subject of ['alice','bob']) await pool.query('INSERT INTO flow_accounts(issuer,subject,wallet) VALUES($1,$2,$3)', [issuer, subject, JSON.stringify({ entries: [] })]);
    economy = new BuddyEconomy(new PostgresBuddyUnitOfWork(pool, ledger));
  });
  afterAll(async () => { if (pool) { await pool.query('DELETE FROM flow_accounts WHERE issuer=$1', [issuer]); await pool.end(); } });
  it('commits 40 parallel completions once, persists reload and isolates accounts', async () => {
    const engine = new MissionEngine(), mission = engine.start('city-balance', 'beginner');
    const results = await Promise.all(Array.from({ length: 40 }, () => economy.complete(id, mission, engine.evaluate(mission, 'balanced'))));
    expect(results.filter(r => r.reward.status === 'credited')).toHaveLength(1);
    const reopened = new BuddyEconomy(new PostgresBuddyUnitOfWork(pool, ledger));
    expect((await reopened.load(id)).balance).toBe(5);
    expect((await reopened.load(id)).progress.completed).toHaveLength(1);
    expect((await reopened.load({ ...id, subject: 'bob' })).balance).toBe(0);
  });
  it('serializes spending and duplicate purchases without negative balances', async () => {
    await pool.query('UPDATE flow_accounts SET wallet=$3 WHERE issuer=$1 AND subject=$2', [issuer, 'bob', JSON.stringify({ entries: [{ key: 'seed', coins: 20, source: 'fixture' }] })]);
    const buyer = { ...id, subject: 'bob' };
    const results = await Promise.allSettled([economy.purchase(buyer, 'ocean'), economy.purchase(buyer, 'sunrise')]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const state = await economy.load(buyer); expect(state.balance).toBe(5);
    const item = state.owned.find(i => i !== 'mint')!;
    await Promise.all(Array.from({ length: 20 }, () => economy.purchase(buyer, item)));
    await economy.equip(buyer, item);
    const reopened = new BuddyEconomy(new PostgresBuddyUnitOfWork(pool, ledger));
    expect((await reopened.load(buyer)).balance).toBe(5);
    expect((await reopened.load(buyer)).appearance.color).toBe(item);
  });
  it('rolls back BOTH wallet and learning state on a failed debit', async () => {
    const broken = new BuddyEconomy(new PostgresBuddyUnitOfWork(pool, (s,id) => ({ ...ledger(s,id), spend: () => { throw new Error('synthetic debit failure'); } })));
    await pool.query('UPDATE flow_accounts SET wallet=$3 WHERE issuer=$1 AND subject=$2', [issuer, 'alice', JSON.stringify({ entries: [{ key: 'seed', coins: 20, source: 'fixture' }] })]);
    await expect(broken.purchase(id, 'sunrise')).rejects.toThrow();
    expect((await economy.load(id)).balance).toBe(20); expect((await economy.load(id)).owned).not.toContain('sunrise');
  });
  it('cascades Buddy state when the owning FLOW account is deleted', async () => {
    await pool.query('DELETE FROM flow_accounts WHERE issuer=$1 AND subject=$2', [issuer, 'alice']);
    await expect(economy.load(id)).rejects.toMatchObject({ status: 409 });
  });
});
