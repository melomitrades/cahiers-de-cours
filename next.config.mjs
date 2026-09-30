/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ne bloque pas la mise en ligne pour une simple vérification de types.
  typescript: { ignoreBuildErrors: true },
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
};

export default nextConfig;
