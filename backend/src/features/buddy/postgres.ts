import { newBuddyAccount, type BuddyAccountState, type BuddyTransaction, type BuddyUnitOfWork } from './economy';
import type { BuddyIdentity } from '../../../../shared/src/buddy/contracts';

/** Structural pg interfaces keep this independent of the identity agent's dependency changes. */
export interface BuddySqlClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
}
export interface BuddySqlPool { connect(): Promise<BuddySqlClient> }
export interface BuddyLedgerAdapter extends Omit<BuddyTransaction, 'state'> { snapshot(): unknown }
export type BuddyLedgerFactory = (wallet: unknown, identity: BuddyIdentity) => BuddyLedgerAdapter;

/**
 * Persistent progress + SAME account wallet JSON under SAME PostgreSQL row lock.
 * Requires the verified host ledger adapter: this module does not invent a second currency.
 * Not registered with the application before the identity handoff.
 */
export class PostgresBuddyUnitOfWork implements BuddyUnitOfWork {
  readonly persistence = 'account' as const;
  constructor(private pool: BuddySqlPool, private ledger: BuddyLedgerFactory) {}
  async run<T>(id: BuddyIdentity, fn: (tx: BuddyTransaction) => T): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const account = await client.query('SELECT wallet FROM flow_accounts WHERE issuer=$1 AND subject=$2 FOR UPDATE', [id.issuer, id.subject]);
      if (!account.rows.length) throw Object.assign(new Error('Inițializează profilul FLOW înainte de Buddy.'), { status: 409 });
      const progress = await client.query('SELECT state FROM flow_buddy_progress WHERE issuer=$1 AND subject=$2', [id.issuer, id.subject]);
      const state = progress.rows[0]?.state as BuddyAccountState | undefined ?? newBuddyAccount();
      const wallet = this.ledger(account.rows[0]!.wallet, id);
      const result = fn({ state, balance: () => wallet.balance(), credit: (n, k, source) => wallet.credit(n, k, source), spend: (n, k, source) => wallet.spend(n, k, source) });
      await client.query('UPDATE flow_accounts SET wallet=$3,updated_at=now() WHERE issuer=$1 AND subject=$2', [id.issuer, id.subject, JSON.stringify(wallet.snapshot())]);
      await client.query('INSERT INTO flow_buddy_progress(issuer,subject,state) VALUES($1,$2,$3) ON CONFLICT(issuer,subject) DO UPDATE SET state=excluded.state,updated_at=now()', [id.issuer, id.subject, JSON.stringify(state)]);
      await client.query('COMMIT');
      return result;
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  }
}
