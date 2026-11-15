import { createHash, randomUUID } from 'node:crypto';
import { CompleteJourneyRequest, CompleteJourneyResponse } from '@vlaiq/shared';
import type {
  JourneyReference,
  JourneySnapshot,
} from '../../../shared/src/journeyBuddy';
import { ownerKey, type Identity } from '../middleware/identity';

export class HandoffError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export const validJourneySession = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
type Entry = JourneySnapshot & {
  session: string;
  owner: string | null;
  expires: number;
  explained: Set<string>;
};
/** Ephemeral, bounded single-process demo store. Restart/eviction requires recalculation. */
export class JourneyHandoffs {
  private entries = new Map<string, Entry>();
  private pending = new Map<string, string>();
  constructor(
    private now = Date.now,
    private ttl = 15 * 60_000,
    private capacity = 200,
  ) {}
  private hash(session: string) {
    return createHash('sha256').update(session).digest('hex');
  }
  begin(session: string) {
    if (!validJourneySession(session))
      throw new HandoffError(400, 'Sesiune de călătorie invalidă.');
    const hash = this.hash(session),
      ticket = randomUUID();
    for (const [id, e] of this.entries)
      if (e.session === hash || e.expires <= this.now())
        this.entries.delete(id);
    while (this.pending.size >= this.capacity)
      this.pending.delete(this.pending.keys().next().value!);
    this.pending.set(hash, ticket);
    return ticket;
  }
  publish(
    session: string,
    input: CompleteJourneyRequest,
    value: CompleteJourneyResponse,
    ticket?: string,
  ) {
    if (!validJourneySession(session))
      throw new HandoffError(400, 'Sesiune de călătorie invalidă.');
    const hash = this.hash(session);
    if (ticket && this.pending.get(hash) !== ticket)
      throw new HandoffError(409, 'Calculul a fost înlocuit. Recalculează.');
    this.pending.delete(hash);
    for (const [id, e] of this.entries)
      if (e.expires <= this.now() || e.session === hash)
        this.entries.delete(id);
    while (this.entries.size >= this.capacity)
      this.entries.delete(this.entries.keys().next().value!);
    const expires = this.now() + this.ttl;
    const handoff = {
      id: randomUUID(),
      revision: randomUUID(),
      expiresAt: new Date(expires).toISOString(),
    };
    // Do not mutate the planner/provider cache or keep any caller-owned objects.
    const snapshot = {
      input: CompleteJourneyRequest.parse(input),
      value: CompleteJourneyResponse.parse({ ...value, handoff }),
    };
    this.entries.set(handoff.id, {
      ...snapshot,
      session: hash,
      owner: null,
      expires,
      explained: new Set(),
    });
    return snapshot.value;
  }
  load(session: string, ref: JourneyReference, identity: Identity) {
    const e = this.entries.get(ref.id);
    if (
      !e ||
      e.expires <= this.now() ||
      e.value.handoff?.revision !== ref.revision
    ) {
      if (e?.expires && e.expires <= this.now()) this.entries.delete(ref.id);
      throw new HandoffError(
        409,
        'Comparația s-a schimbat sau a expirat. Recalculează înainte de a selecta ruta.',
      );
    }
    const owner = ownerKey(identity);
    if (
      !validJourneySession(session) ||
      e.session !== this.hash(session) ||
      (e.owner && e.owner !== owner)
    )
      throw new HandoffError(
        403,
        'Această comparație aparține altei sesiuni sau altui cont.',
      );
    e.owner = owner;
    return e;
  }
  select(
    session: string,
    ref: JourneyReference,
    identity: Identity,
    optionId: string,
  ): JourneySnapshot {
    const e = this.load(session, ref, identity);
    if (
      !e.explained.has(optionId) ||
      !e.value.journeys.some((j) => j.id === optionId)
    )
      throw new HandoffError(
        409,
        'Opțiunea nu corespunde explicației validate. Reia întrebarea.',
      );
    return { input: e.input, value: e.value };
  }
}
export const journeyHandoffs = new JourneyHandoffs();
