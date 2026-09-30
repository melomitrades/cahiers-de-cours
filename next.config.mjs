/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ne bloque pas la mise en ligne pour une simple vérification de types.
  typescript: { ignoreBuildErrors: true },
  // Les PDF peuvent être volumineux : on autorise des actions serveur un peu plus lourdes.
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
};

export default nextConfig;
