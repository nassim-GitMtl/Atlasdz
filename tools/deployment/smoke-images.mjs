import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

// Offline artifact checks only: no published ports, real credentials, database or seller UI.
const exec = promisify(execFile);
const docker = (...args) => exec('docker', args, { timeout: 30_000, maxBuffer: 1024 * 1024 });
const images = {
  api: process.env.ATLAS_API_IMAGE ?? 'atlas-api:release-local',
  migrate: process.env.ATLAS_MIGRATE_IMAGE ?? 'atlas-migrate:release-local',
  'customer-web': process.env.ATLAS_CUSTOMER_IMAGE ?? 'atlas-customer:release-local',
  'seller-center': process.env.ATLAS_SELLER_IMAGE ?? 'atlas-seller:release-local',
};
const base = [
  '--network',
  'none',
  '--read-only',
  '--cap-drop',
  'ALL',
  '--security-opt',
  'no-new-privileges:true',
  '--pids-limit',
  '128',
  '--memory',
  '512m',
  '--tmpfs',
  '/tmp:rw,noexec,nosuid,size=32m',
];
const portableCheck = `
  const { readdir, realpath } = await import('node:fs/promises');
  const { join } = await import('node:path');
  if (process.getuid() === 0) throw new Error('Root runtime');
  async function check(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isSymbolicLink()) {
        const target = await realpath(file);
        if (target !== '/app' && !target.startsWith('/app/')) throw new Error('Nonportable dependency');
      } else if (entry.isDirectory()) await check(file);
    }
  }
  await check('/app');
`;
for (const [role, image] of Object.entries(images)) {
  const metadata = JSON.parse((await docker('image', 'inspect', image)).stdout)[0].Config;
  assert.equal(metadata.User, 'node', `${role}: non-root image`);
  assert.deepEqual(metadata.Cmd, ['node', 'start-release.mjs', role]);
  await docker(
    'run',
    '--rm',
    ...base,
    image,
    'node',
    '--input-type=module',
    '-e',
    portableCheck + (role === 'migrate' ? "await import('./dist/index.js');" : ''),
  );
  await assert.rejects(
    docker(
      'run',
      '--rm',
      ...base,
      '-e',
      'APP_ENV=staging',
      '-e',
      'ATLAS_LOCAL_ACCOUNTS=true',
      image,
    ),
    (error) =>
      error.code === 1 &&
      error.stderr.includes('Invalid release configuration: ATLAS_LOCAL_ACCOUNTS'),
  );
  console.log(`${role}: non-root, portable dependencies, unsafe startup rejected`);
}

const apiEnv = {
  APP_ENV: 'staging',
  DATABASE_SSL: 'true',
  DATABASE_URL: 'postgresql://synthetic:synthetic@database.example.invalid:5432/atlas_test',
  CORS_ALLOWED_ORIGINS: 'https://shop.example.invalid,https://seller.example.invalid',
};
const customerEnv = {
  APP_ENV: 'staging',
  CUSTOMER_WEB_ORIGIN: 'https://shop.example.invalid',
  CATALOG_API_BASE_URL: 'http://api:3000',
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
};
for (const [role, env] of [
  ['api', apiEnv],
  ['customer-web', customerEnv],
]) {
  const name = `atlas-artifact-${role}-${randomUUID()}`;
  let created = false;
  try {
    await docker(
      'run',
      '-d',
      '--name',
      name,
      ...base,
      ...Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
      images[role],
    );
    created = true;
    let healthy = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        await docker('exec', name, 'node', 'healthcheck.mjs');
        healthy = true;
        break;
      } catch {
        await delay(250);
      }
    }
    if (!healthy) console.error((await docker('logs', '--tail', '20', name)).stderr);
    assert.ok(healthy, `${role}: failed to become live`);
    if (role === 'api') {
      await docker(
        'exec',
        name,
        'node',
        '--input-type=module',
        '-e',
        `
        const assert = (await import('node:assert/strict')).default;
        const ready = await fetch('http://127.0.0.1:3000/health/ready');
        assert.equal(ready.status, 503, 'unavailable database must not be ready');
        const local = await fetch('http://127.0.0.1:3000/api/v1/local/session', {
          method: 'POST', headers: {'content-type': 'application/json'},
          body: JSON.stringify({account: 'customer'})
        });
        assert.equal(local.status, 404, 'synthetic login must not be mounted');
      `,
      );
    }
    console.log(
      `${role}: isolated read-only startup/liveness passed${role === 'api' ? '; database readiness fails closed, no synthetic login' : ''}`,
    );
  } finally {
    if (created) {
      await docker('stop', '--time', '5', name);
      await docker('rm', name);
    }
  }
}
