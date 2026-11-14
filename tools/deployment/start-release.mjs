import { loadReleaseSecrets, validateReleaseEnvironment } from './release-env.mjs';

// No argv/env/stack dump: connection strings and encryption keys must not appear in logs.
try {
  const service = process.argv[2];
  const env = validateReleaseEnvironment(service, await loadReleaseSecrets(process.env));
  Object.assign(process.env, env);
  if (service === 'migrate') {
    const { runMigrations, migrationStatus } = await import('./dist/index.js');
    const database = new URL(env.DATABASE_URL);
    database.searchParams.set('sslmode', 'verify-full');
    const applied = await runMigrations(database.toString(), '/app/migrations');
    const statuses = await migrationStatus(database.toString(), '/app/migrations');
    if (!statuses.every((s) => s.applied && s.checksumMatches))
      throw new Error('Migration verification failed');
    console.log(JSON.stringify({ applied, checksumsVerified: true }));
  } else if (service === 'api') {
    await import('./dist/main.js');
  } else if (service === 'create-staff') {
    // `start-release.mjs create-staff <email>`; the password is read from stdin.
    process.argv.splice(2, 1);
    await import('./dist/create-staff.js');
  } else {
    process.env.HOSTNAME = '0.0.0.0';
    process.env.PORT = '3000';
    await import(`./apps/${service}/server.js`);
  }
} catch (error) {
  console.error(
    error?.name === 'ReleaseConfigurationError'
      ? error.message
      : 'Release startup failed; verify configuration, database and artifact integrity.',
  );
  process.exitCode = 1;
}
