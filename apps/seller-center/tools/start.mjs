// Local defaults; the release image has a separately validated startup entrypoint.
process.env['HOSTNAME'] = process.env['ATLAS_WEB_HOST'] ?? '127.0.0.1';
process.env['PORT'] ??= '3002';
await import('../.next/standalone/apps/seller-center/server.js');
