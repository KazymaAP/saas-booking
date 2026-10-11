// next.config.mjs — настройки Next 14. Заголовки безопасности дублируют middleware для статики (ТЗ §34).
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['imapflow', 'nodemailer', 'pino'],
  },
};

export default nextConfig;
