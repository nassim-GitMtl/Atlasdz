import { Pool } from 'pg';
import { seedSyntheticCatalog } from './synthetic-seed.js';

const environment = process.env['NODE_ENV'];
const databaseUrl = process.env['DATABASE_URL'];
if (
  environment === undefined ||
  !['local', 'test'].includes(environment) ||
  databaseUrl === undefined
) {
  throw new Error('Catalog seeding requires explicit LOCAL/TEST environment and DATABASE_URL');
}
const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5_000 });
try {
  await seedSyntheticCatalog(pool, environment);
  console.log(JSON.stringify({ seeded: true, dataClass: 'synthetic', catalog: true }));
} finally {
  await pool.end();
}
