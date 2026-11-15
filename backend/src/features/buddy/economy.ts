import {
  COSMETICS,
  DEFAULT_APPEARANCE,
  learningLevel,
  type BuddyAppearance,
  type BuddyCosmeticsRepository,
  type BuddyIdentity,
  type BuddyProgress,
  type BuddyProgressRepository,
  type BuddySnapshot,
  type BuddyWalletGateway,
  type CosmeticId,
} from '../../../../shared/src/buddy/contracts';

export interface BuddyAccountState {
  progress: BuddyProgress;
  owned: CosmeticId[];
  appearance: BuddyAppearance;
  learningCredits: { key: string; day: string; coins: number }[];
}
export const newBuddyAccount = (): BuddyAccountState => ({
  progress: { completed: [], difficulty: 'beginner', correctInRow: 0, level: learningLevel(0) },
  owned: ['mint'],
  appearance: { ...DEFAULT_APPEARANCE },
  learningCredits: [],
});
export interface BuddyTransaction {
  state: BuddyAccountState;
  balance(): number;
  /** Add source-tagged entries to the existing FLOW ledger, never to a second balance. */
  credit(coins: number, idempotencyKey: string, source: 'education'): void;
  spend(coins: number, idempotencyKey: string, source: 'cosmetic'): void;
}
export interface BuddyUnitOfWork {
  persistence: BuddySnapshot['persistence'];
  /** Row-lock the verified issuer+subject account; commit state + ledger together or roll both back. */
  run<T>(identity: BuddyIdentity, fn: (tx: BuddyTransaction) => T): Promise<T>;
}
/** Domain policy; requires a host transaction adapter. No file/localStorage production fallback. */
export class BuddyEconomy
  implements BuddyWalletGateway, BuddyProgressRepository, BuddyCosmeticsRepository
{
  constructor(
    private uow: BuddyUnitOfWork,
    private now = () => new Date(),
  ) {}
  private snapshot(tx: BuddyTransaction): BuddySnapshot {
    return structuredClone({
      progress: tx.state.progress,
      owned: tx.state.owned,
      appearance: tx.state.appearance,
      balance: tx.balance(),
      persistence: this.uow.persistence,
    });
  }
  load(identity: BuddyIdentity) {
    return this.uow.run(identity, (tx) => this.snapshot(tx));
  }
  complete(
    identity: BuddyIdentity,
    mission: Parameters<BuddyWalletGateway['complete']>[1],
    result: Parameters<BuddyWalletGateway['complete']>[2],
  ) {
    return this.uow.run(identity, (tx) => {
      if (!result.correct) {
        tx.state.progress.correctInRow = 0;
        tx.state.progress.difficulty = 'beginner';
        return { ...result, reward: { status: 'ineligible' as const, coins: 0 } };
      }
      const key = `${mission.id}:v${mission.version}`;
      if (
        tx.state.progress.completed.some(
          (c) => c.missionId === mission.id && c.version === mission.version,
        )
      )
        return { ...result, reward: { status: 'already-earned' as const, coins: 0 } };
      const date = this.now().toISOString();
      const day = date.slice(0, 10); // Explicit UTC policy shared across backend replicas.
      const earnedToday = tx.state.learningCredits
        .filter((c) => c.day === day)
        .reduce((sum, c) => sum + c.coins, 0);
      const coins = earnedToday + 5 <= 20 ? 5 : 0;
      if (coins) {
        tx.credit(coins, `buddy:${key}`, 'education');
        tx.state.learningCredits.push({ key, day, coins });
      }
      tx.state.progress.completed.push({
        missionId: mission.id,
        version: mission.version,
        completedAt: date,
      });
      tx.state.progress.correctInRow++;
      tx.state.progress.level = learningLevel(tx.state.progress.completed.length);
      tx.state.progress.difficulty =
        tx.state.progress.correctInRow >= 4
          ? 'advanced'
          : tx.state.progress.correctInRow >= 2
            ? 'intermediate'
            : 'beginner';
      return {
        ...result,
        reward: { status: coins ? ('credited' as const) : ('daily-limit' as const), coins },
      };
    });
  }
  purchase(identity: BuddyIdentity, cosmeticId: CosmeticId) {
    return this.uow.run(identity, (tx) => {
      const item = COSMETICS.find((c) => c.id === cosmeticId)!;
      if (tx.state.owned.includes(item.id)) return this.snapshot(tx);
      if (tx.balance() < item.price)
        throw Object.assign(new Error('Nu ai suficiente FLOW Coins.'), { status: 409 });
      tx.spend(item.price, `buddy:cosmetic:${item.id}`, 'cosmetic');
      tx.state.owned.push(item.id);
      return this.snapshot(tx);
    });
  }
  equip(identity: BuddyIdentity, cosmeticId: CosmeticId) {
    return this.uow.run(identity, (tx) => {
      if (!tx.state.owned.includes(cosmeticId))
        throw Object.assign(new Error('Acest accesoriu nu îți aparține.'), { status: 403 });
      const a = tx.state.appearance;
      if (['mint', 'ocean', 'sunrise'].includes(cosmeticId))
        a.color = cosmeticId as BuddyAppearance['color'];
      if (cosmeticId === 'leaf-antenna') a.antenna = !a.antenna;
      if (cosmeticId === 'star-badge') a.badge = !a.badge;
      if (cosmeticId === 'pulse-light') a.pulse = !a.pulse;
      return this.snapshot(tx);
    });
  }
}
