/** @type {import('next').NextConfig} */
const nextConfig = {
  // Les PDF peuvent être volumineux : on autorise des actions serveur un peu plus lourdes.
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
};

export default nextConfig;
