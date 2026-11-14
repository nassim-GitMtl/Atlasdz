// Explicit local defaults; deployment supplies ATLAS_WEB_HOST and PORT as needed.
process.env['HOSTNAME'] = process.env['ATLAS_WEB_HOST'] ?? '127.0.0.1';
process.env['PORT'] ??= '3001';
await import('../.next/standalone/apps/customer-web/server.js');
