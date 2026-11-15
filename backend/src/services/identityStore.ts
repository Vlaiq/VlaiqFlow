import { Pool, type PoolClient } from 'pg';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  Profile,
  ProfileInput,
  DEFAULT_TEAM,
  TeamPresentation,
} from '../../../shared/src/identity';
import type { Identity } from '../middleware/identity';
import { ownerKey } from '../middleware/identity';
import { MotionStore } from './motionStore';
import { config } from '../config';

export class IdentityStore {
  readonly pool: Pool;
  constructor(url: string) {
    this.pool = new Pool({
      connectionString: url,
      max: 8,
      connectionTimeoutMillis: 5000,
    });
  }
  async migrate() {
    const sql = await readFile(
      new URL('../../../database/migrations/001_flow_identity.sql', import.meta.url),
      'utf8',
    );
    await this.pool.query(sql);
  }
  private async ensure(client: Pool | PoolClient, id: Identity) {
    await client.query(
      `INSERT INTO flow_accounts(issuer,subject,profile) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
      [
        id.issuer,
        id.subject,
        {
          displayName: 'Călător FLOW',
          nickname: 'Călător',
          biography: '',
          voiceConsent: false,
          preferences: {
            mode: 'balanced',
            maxWalkMinutes: 12,
            schoolZone: true,
          },
        },
      ],
    );
  }
  async profile(id: Identity) {
    await this.ensure(this.pool, id);
    const { rows } = await this.pool.query(
      'SELECT profile,avatar_version,created_at,updated_at FROM flow_accounts WHERE issuer=$1 AND subject=$2',
      [id.issuer, id.subject],
    );
    const r = rows[0];
    return Profile.parse({
      ...r.profile,
      avatarVersion: r.avatar_version,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    });
  }
  async update(id: Identity, input: unknown) {
    const p = ProfileInput.parse(input);
    await this.ensure(this.pool, id);
    await this.pool.query(
      'UPDATE flow_accounts SET profile=$3,updated_at=now() WHERE issuer=$1 AND subject=$2',
      [id.issuer, id.subject, p],
    );
    return this.profile(id);
  }
  async avatar(id: Identity) {
    const { rows } = await this.pool.query(
      'SELECT avatar_bytes FROM flow_accounts WHERE issuer=$1 AND subject=$2',
      [id.issuer, id.subject],
    );
    return rows[0]?.avatar_bytes as Buffer | null | undefined;
  }
  async saveAvatar(id: Identity, bytes: Buffer | null) {
    await this.ensure(this.pool, id);
    await this.pool.query(
      'UPDATE flow_accounts SET avatar_bytes=$3,avatar_version=$4,updated_at=now() WHERE issuer=$1 AND subject=$2',
      [id.issuer, id.subject, bytes, bytes ? randomUUID() : null],
    );
    return this.profile(id);
  }
  /** A database row lock serializes starts/finishes across devices AND backend replicas. */
  async motion<T>(id: Identity, action: (store: MotionStore, owner: string) => T) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.ensure(client, id);
      const { rows } = await client.query(
        'SELECT wallet FROM flow_accounts WHERE issuer=$1 AND subject=$2 FOR UPDATE',
        [id.issuer, id.subject],
      );
      const store = MotionStore.fromSnapshot(rows[0].wallet);
      const result = action(store, ownerKey(id));
      await client.query('UPDATE flow_accounts SET wallet=$3 WHERE issuer=$1 AND subject=$2', [
        id.issuer,
        id.subject,
        JSON.stringify(store.snapshot()),
      ]);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  async erase(id: Identity) {
    await this.pool.query('DELETE FROM flow_accounts WHERE issuer=$1 AND subject=$2', [
      id.issuer,
      id.subject,
    ]);
  }
  async team() {
    const { rows } = await this.pool.query('SELECT presentation FROM flow_team WHERE id=true');
    return TeamPresentation.parse(rows[0]?.presentation ?? DEFAULT_TEAM);
  }
  async updateTeam(input: unknown) {
    const value = TeamPresentation.parse(input);
    await this.pool.query(
      'INSERT INTO flow_team(id,presentation) VALUES(true,$1) ON CONFLICT(id) DO UPDATE SET presentation=$1,updated_at=now()',
      [value],
    );
    return value;
  }
}
let store: IdentityStore | undefined;
export function identityStore() {
  if (!config.databaseUrl)
    throw Object.assign(new Error('Profilul necesită o bază PostgreSQL configurată.'), {
      status: 503,
    });
  return (store ??= new IdentityStore(config.databaseUrl));
}
