/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "storage.googleapis.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "img.clerk.com" },
    ],
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    }];
  },
  // Audio chunks uploaded from the live-capture controller are ~5s of
  // webm/opus, which can easily exceed Next's 1MB default for route handlers.
  experimental: {
    serverActions: { bodySizeLimit: "15mb" },
  },
  // Expose /health at the top level so Render's default health check hits
  // our /api/health route handler.
  async rewrites() {
    return [
      { source: "/health", destination: "/api/health" },
    ];
  },
};

export default nextConfig;
