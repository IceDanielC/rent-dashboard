/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
  transpilePackages: [
    'antd',
    '@ant-design/icons',
    '@ant-design/pro-components',
    '@ant-design/pro-layout',
    '@ant-design/pro-table',
    '@ant-design/pro-form',
    '@ant-design/charts',
    'rc-util',
    'rc-pagination',
    'rc-picker',
    'rc-table',
    'rc-tree',
    'rc-select',
  ],
};

export default nextConfig;
