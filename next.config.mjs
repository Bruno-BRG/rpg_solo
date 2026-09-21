/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output produces a self-contained server bundle, ideal for
  // slim Docker images (see Dockerfile multi-stage build).
  output: "standalone",
  reactStrictMode: true,
};

export default nextConfig;
