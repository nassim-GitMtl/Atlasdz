import { migrationStatus, runMigrations } from './migrations.js';
import { seedSyntheticData, verifyFoundation } from './operations.js';

function requiredDatabaseUrl(): string {
  const databaseUrl = process.env['DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error('DATABASE_URL is required');
  }
  return databaseUrl;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const databaseUrl = requiredDatabaseUrl();

  switch (command) {
    case 'migrate': {
      const applied = await runMigrations(databaseUrl);
      console.log(JSON.stringify({ command, applied }));
      return;
    }
    case 'status': {
      const migrations = await migrationStatus(databaseUrl);
      console.log(JSON.stringify({ command, migrations }, null, 2));
      return;
    }
    case 'verify': {
      await verifyFoundation(databaseUrl);
      console.log(JSON.stringify({ command, verified: true }));
      return;
    }
    case 'seed-synthetic': {
      await seedSyntheticData(databaseUrl, process.env['NODE_ENV'] ?? 'local');
      console.log(JSON.stringify({ command, seeded: true, dataClass: 'synthetic' }));
      return;
    }
    default:
      throw new Error('Expected one of: migrate, status, verify, seed-synthetic');
  }
}

try {
  await main();
} catch (error) {
  const failure = error instanceof Error ? error : new Error('Unknown database command failure');
  console.error(JSON.stringify({ command: process.argv[2] ?? null, error: failure.message }));
  process.exitCode = 1;
}
