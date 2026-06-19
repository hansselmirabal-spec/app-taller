/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1',
    NEXT_PUBLIC_MOCK_MODE: process.env.NEXT_PUBLIC_MOCK_MODE || 'true',
  },
};

module.exports = nextConfig;
