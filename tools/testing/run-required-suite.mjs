import { spawnSync } from 'node:child_process';
import { assertRequiredSuite } from './required-suite-policy.mjs';

const allowedSuites = new Set(['test:e2e', 'test:ui', 'test:security']);
const suite = process.argv[2];

if (suite === undefined || !allowedSuites.has(suite)) {
  process.stderr.write('A supported required suite name must be provided.\n');
  process.exit(2);
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const dryRun = spawnSync(pnpm, ['exec', 'turbo', 'run', suite, '--dry=json'], {
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
});

if (dryRun.status !== 0) {
  process.stderr.write(dryRun.stderr || `Could not inspect ${suite}.\n`);
  process.exit(dryRun.status ?? 1);
}

let summary;
try {
  summary = JSON.parse(dryRun.stdout);
} catch {
  process.stderr.write(`Turbo returned an invalid dry-run summary for ${suite}.\n`);
  process.exit(1);
}

try {
  assertRequiredSuite(summary, suite);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Invalid suite inventory'}\n`);
  process.exit(2);
}

const run = spawnSync(pnpm, ['exec', 'turbo', 'run', suite], { stdio: 'inherit' });
if (run.error !== undefined) {
  process.stderr.write(`${suite} could not start (${run.error.name}).\n`);
  process.exit(1);
}
process.exit(run.status ?? 1);
