import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

export interface Migration {
  readonly version: string;
  readonly name: string;
  readonly checksum: Buffer;
  readonly sql: string;
  readonly fileName: string;
}

export interface MigrationStatus {
  readonly version: string;
  readonly name: string;
  readonly applied: boolean;
  readonly checksumMatches: boolean | null;
}

const migrationFilePattern = /^(?<version>[0-9]{6})_(?<name>[a-z][a-z0-9_]*)\.sql$/;
const identityControlPlaneVersion = '000002';

interface IdentityControlPlaneBaselineState {
  readonly sessionsPopulated: boolean;
  readonly rolesPopulated: boolean;
  readonly assignmentsPopulated: boolean;
  readonly outboxPopulated: boolean;
  readonly inboxPopulated: boolean;
}

export class GreenfieldBaselineRequiredError extends Error {
  public readonly migrationFileName: string;
  public readonly nonEmptyRelations: readonly string[];

  public constructor(migrationFileName: string, nonEmptyRelations: readonly string[]) {
    const protectedRelations = Object.freeze([...nonEmptyRelations]);
    super(
      `Migration ${migrationFileName} requires a greenfield baseline; these relations must be empty: ${protectedRelations.join(', ')}. ` +
        'The runner stopped before executing the checksum-locked migration. Provision a new empty database, or complete an explicitly reviewed environment-specific baseline procedure before retrying; a later migration cannot repair an unapplied 000002.',
    );
    this.name = 'GreenfieldBaselineRequiredError';
    this.migrationFileName = migrationFileName;
    this.nonEmptyRelations = protectedRelations;
  }
}

async function assertMigrationPreconditions(client: Client, migration: Migration): Promise<void> {
  if (migration.version !== identityControlPlaneVersion) {
    return;
  }

  // 000002 changes the accepted event-name representation and adds a required outbox actor.
  // Existing 000001 event rows cannot be inferred or rewritten safely. Lock before inspecting so
  // an application writer cannot populate the affected relations between this check and ALTER.
  await client.query(`
    LOCK TABLE
      identity.sessions,
      identity.roles,
      identity.user_role_assignments,
      platform.outbox_events,
      platform.inbox_messages
    IN ACCESS EXCLUSIVE MODE
  `);
  const result = await client.query<IdentityControlPlaneBaselineState>(`
    SELECT
      EXISTS (SELECT 1 FROM identity.sessions) AS "sessionsPopulated",
      EXISTS (SELECT 1 FROM identity.roles) AS "rolesPopulated",
      EXISTS (SELECT 1 FROM identity.user_role_assignments) AS "assignmentsPopulated",
      EXISTS (SELECT 1 FROM platform.outbox_events) AS "outboxPopulated",
      EXISTS (SELECT 1 FROM platform.inbox_messages) AS "inboxPopulated"
  `);
  const state = result.rows[0];
  if (state === undefined) {
    throw new Error(`Migration preflight returned no state for ${migration.fileName}`);
  }

  const nonEmptyRelations = [
    state.sessionsPopulated ? 'identity.sessions' : undefined,
    state.rolesPopulated ? 'identity.roles' : undefined,
    state.assignmentsPopulated ? 'identity.user_role_assignments' : undefined,
    state.outboxPopulated ? 'platform.outbox_events' : undefined,
    state.inboxPopulated ? 'platform.inbox_messages' : undefined,
  ].filter((relation): relation is string => relation !== undefined);
  if (nonEmptyRelations.length > 0) {
    throw new GreenfieldBaselineRequiredError(migration.fileName, nonEmptyRelations);
  }
}

export function defaultMigrationsDirectory(): string {
  let currentDirectory = dirname(fileURLToPath(import.meta.url));
  while (true) {
    const candidate = resolve(currentDirectory, 'database/migrations');
    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDirectory = dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      throw new Error('Unable to locate the repository database/migrations directory');
    }
    currentDirectory = parentDirectory;
  }
}

export async function discoverMigrations(
  directory = defaultMigrationsDirectory(),
): Promise<readonly Migration[]> {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && migrationFilePattern.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));

  const migrations = await Promise.all(
    entries.map(async (entry): Promise<Migration> => {
      const match = migrationFilePattern.exec(entry.name);
      if (match?.groups === undefined) {
        throw new Error(`Invalid migration filename: ${entry.name}`);
      }
      const sql = await readFile(resolve(directory, entry.name), 'utf8');
      return {
        version: match.groups['version'] ?? '',
        name: match.groups['name'] ?? '',
        checksum: createHash('sha256').update(sql).digest(),
        sql,
        fileName: entry.name,
      };
    }),
  );

  if (migrations.length === 0) {
    throw new Error(`No migrations found in ${directory}`);
  }

  const versions = new Set<string>();
  for (const migration of migrations) {
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`);
    }
    versions.add(migration.version);
  }

  return migrations;
}

async function bootstrapLedger(client: Client): Promise<void> {
  await client.query('CREATE SCHEMA IF NOT EXISTS platform');
  await client.query(`
    CREATE TABLE IF NOT EXISTS platform.schema_migrations (
      version text COLLATE "C" PRIMARY KEY,
      name text COLLATE "C" NOT NULL,
      checksum bytea NOT NULL CHECK (octet_length(checksum) = 32),
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      duration_ms integer NOT NULL CHECK (duration_ms >= 0),
      applied_by text COLLATE "C" NOT NULL
    )
  `);
}

export async function runMigrations(
  databaseUrl: string,
  directory = defaultMigrationsDirectory(),
): Promise<readonly string[]> {
  const migrations = await discoverMigrations(directory);
  const client = new Client({
    connectionString: databaseUrl,
    application_name: 'atlas-migrator',
    connectionTimeoutMillis: 5_000,
  });
  const appliedNow: string[] = [];

  await client.connect();
  try {
    await bootstrapLedger(client);
    await client.query("SELECT pg_advisory_lock(hashtextextended('atlas-dz-migrations', 0))");
    try {
      const result = await client.query<{ version: string; checksum: Buffer }>(
        'SELECT version, checksum FROM platform.schema_migrations ORDER BY version',
      );
      const applied = new Map(result.rows.map((row) => [row.version, row.checksum]));

      for (const migration of migrations) {
        const previousChecksum = applied.get(migration.version);
        if (previousChecksum !== undefined) {
          if (!previousChecksum.equals(migration.checksum)) {
            throw new Error(`Applied migration checksum changed: ${migration.fileName}`);
          }
          continue;
        }

        const startedAt = performance.now();
        await client.query('BEGIN');
        try {
          await client.query("SET LOCAL lock_timeout = '5s'");
          await client.query("SET LOCAL statement_timeout = '60s'");
          await assertMigrationPreconditions(client, migration);
          await client.query(migration.sql);
          await client.query(
            `INSERT INTO platform.schema_migrations
              (version, name, checksum, duration_ms, applied_by)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              migration.version,
              migration.name,
              migration.checksum,
              Math.max(0, Math.round(performance.now() - startedAt)),
              'atlas-migrator',
            ],
          );
          await client.query('COMMIT');
          appliedNow.push(migration.version);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtextextended('atlas-dz-migrations', 0))");
    }
  } finally {
    await client.end();
  }

  return appliedNow;
}

export async function migrationStatus(
  databaseUrl: string,
  directory = defaultMigrationsDirectory(),
): Promise<readonly MigrationStatus[]> {
  const migrations = await discoverMigrations(directory);
  const client = new Client({ connectionString: databaseUrl, application_name: 'atlas-migrator' });
  await client.connect();
  try {
    await bootstrapLedger(client);
    const result = await client.query<{ version: string; checksum: Buffer }>(
      'SELECT version, checksum FROM platform.schema_migrations ORDER BY version',
    );
    const applied = new Map(result.rows.map((row) => [row.version, row.checksum]));
    return migrations.map((migration) => {
      const checksum = applied.get(migration.version);
      return {
        version: migration.version,
        name: migration.name,
        applied: checksum !== undefined,
        checksumMatches: checksum === undefined ? null : checksum.equals(migration.checksum),
      };
    });
  } finally {
    await client.end();
  }
}
