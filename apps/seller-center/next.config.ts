import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // Product photos (≤ 5 MiB) are uploaded through a server action.
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
};

export default nextConfig;
