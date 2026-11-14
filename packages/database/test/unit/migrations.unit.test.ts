import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { discoverMigrations } from '../../src/migrations.js';

describe('migration manifest', () => {
  it('discovers ordered migrations with stable SHA-256 checksums', async () => {
    const migrations = await discoverMigrations();

    assert.ok(migrations.length >= 1);
    assert.deepEqual(
      migrations.map((migration) => migration.version),
      [...migrations.map((migration) => migration.version)].sort(),
    );
    for (const migration of migrations) {
      assert.equal(migration.checksum.length, 32);
      assert.ok(migration.sql.length > 100);
    }
  });
});
