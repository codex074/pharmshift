/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compiler: {
    // Strip client-bundle console.* in production, keep console.error for diagnostics (R26)
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error'] } : false,
  },
  async rewrites() {
    // Browser calls to the self-hosted Supabase domain (db.codex074.tech)
    // fail TLS trust on some locked-down hospital PCs (their Windows
    // cert store doesn't trust any of the free ACME CAs we've tried).
    // Proxying REST calls through this already-trusted app domain sidesteps
    // that entirely, since Vercel talks to the VPS server-to-server.
    // Realtime (WebSocket) still connects directly — not proxied here.
    // Path lives under /api/ so middleware.ts's existing /api/* exclusion
    // (see middleware.ts matcher) skips the session-cookie check for it —
    // this proxy has no need for the app's own session, only the Supabase
    // anon key the browser already sends per-request.
    return [
      {
        source: '/api/db-proxy/:path*',
        destination: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
