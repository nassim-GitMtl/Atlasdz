/**
 * Operator command: create a marketplace staff account.
 *   echo -n 'the password' | node dist/create-staff.js staff@example.dz
 * The password is read from stdin so it never appears in shell history or `ps`.
 * The staff member enrolls an authenticator app on first sign-in.
 */
import { loadRuntimeConfig } from '@atlas/platform';
import { Pool } from 'pg';

import { passwordPolicyViolation } from './identity/password/credential-crypto.js';
import {
  normalizeEmail,
  PasswordIdentityRepository,
} from './identity/password/password-identity.js';

const email = normalizeEmail(process.argv[2] ?? '');
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  process.stderr.write('Usage: node dist/create-staff.js <email>  (password on stdin)\n');
  process.exit(2);
}
const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
const password = Buffer.concat(chunks)
  .toString('utf8')
  .replace(/\r?\n$/, '');
const violation = passwordPolicyViolation(password, email);
if (violation !== null) {
  process.stderr.write(`Password rejected: ${violation}\n`);
  process.exit(2);
}

const config = loadRuntimeConfig(process.env);
const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: true } : false,
  max: 1,
});
try {
  const result = await new PasswordIdentityRepository(pool, config.identitySecretKey).createStaff(
    email,
    password,
  );
  process.stdout.write(
    result.status === 'CREATED'
      ? `Staff account created for ${email}. Sign in to Seller Center to enroll an authenticator.\n`
      : `An account already exists for ${email}.\n`,
  );
  process.exitCode = result.status === 'CREATED' ? 0 : 1;
} finally {
  await pool.end();
}
