import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 移除 i18n 配置
  
  // 静态资源缓存配置
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=60, s-maxage=300',
          },
        ],
      },
    ];
  },
  
  // 图片优化和缓存
  images: {
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },
  
  // 实验性功能
  experimental: {
    // 启用 React 缓存
    optimizeCss: true,
  },
};

export default nextConfig;