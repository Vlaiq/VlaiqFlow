// TEST ONLY. Never a production persistence adapter or authentication mechanism.
import { newBuddyAccount, type BuddyAccountState, type BuddyTransaction, type BuddyUnitOfWork } from '../../src/features/buddy/economy';
import type { BuddyAIService, BuddyIdentity, BuddySnapshot } from '../../../shared/src/buddy/contracts';

export const fixtureIdentity = (subject = 'alice'): BuddyIdentity => ({ issuer: 'https://buddy.test.invalid/', subject });
export class FixtureUnitOfWork implements BuddyUnitOfWork {
  readonly persistence = 'test-fixture' as const;
  accounts = new Map<string, { state: BuddyAccountState; coins: number; ledger: { key: string; coins: number; source: string }[] }>();
  private tails = new Map<string, Promise<void>>();
  seed(id: BuddyIdentity, coins: number) { this.accounts.set(JSON.stringify([id.issuer, id.subject]), { state: newBuddyAccount(), coins, ledger: [] }); }
  async run<T>(id: BuddyIdentity, fn: (tx: BuddyTransaction) => T): Promise<T> {
    const key = JSON.stringify([id.issuer, id.subject]);
    const previous = this.tails.get(key) ?? Promise.resolve();
    let unlock!: () => void;
    const tail = new Promise<void>(r => { unlock = r; }); this.tails.set(key, tail);
    await previous;
    try {
      const copy = structuredClone(this.accounts.get(key) ?? { state: newBuddyAccount(), coins: 0, ledger: [] });
      const append = (coins: number, ledgerKey: string, source: string) => {
        if (copy.ledger.some(l => l.key === ledgerKey)) throw new Error('Duplicate ledger key');
        if (copy.coins + coins < 0) throw new Error('Negative balance');
        copy.coins += coins; copy.ledger.push({ key: ledgerKey, coins, source });
      };
      const result = fn({ state: copy.state, balance: () => copy.coins,
        credit: (n, k, source) => append(n, k, source), spend: (n, k, source) => append(-n, k, source) });
      this.accounts.set(key, copy); return result;
    } finally { unlock(); if (this.tails.get(key) === tail) this.tails.delete(key); }
  }
}
export class FixtureAI implements BuddyAIService {
  readonly source = 'test-fixture' as const;
  async reply(input: Parameters<BuddyAIService['reply']>[0], context: Parameters<BuddyAIService['reply']>[1]) {
    if (/eroare|error/i.test(input.message)) throw new Error('Synthetic provider failure');
    if (/gre|hard/i.test(input.message)) return { text: 'Răspuns sintetic de test: poți alege nivelul avansat din misiune.', action: { type: 'CHANGE_DIFFICULTY' as const, difficulty: 'advanced' as const } };
    if (/oraș|city/i.test(input.message)) return { text: 'Răspuns sintetic de test: deschidem o simulare educațională cu 30 de persoane.', action: { type: 'START_MISSION' as const, missionId: 'city-balance' as const } };
    if (/workshop/i.test(input.message)) return { text: 'Răspuns sintetic de test: poți previzualiza accesoriile.', action: { type: 'OPEN_WORKSHOP' as const } };
    return { text: `Răspuns sintetic de test: parcarea poate schimba distribuția traficului, dar fără date verificate nu promitem un loc liber. Nivelul curent: ${context.difficulty}.`, action: { type: 'ANSWER_QUESTION' as const } };
  }
}
export const emptyFixtureSnapshot: BuddySnapshot = { progress: newBuddyAccount().progress, appearance: newBuddyAccount().appearance, owned: ['mint'], balance: 0, persistence: 'test-fixture' };
