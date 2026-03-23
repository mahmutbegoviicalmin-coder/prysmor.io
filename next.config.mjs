/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    domains: ['images.unsplash.com'],
  },
  // Exclude heavy native binaries from serverless function bundling.
  // These packages require a local ffmpeg/onnx runtime and cannot run on Vercel anyway.
  outputFileTracingExcludes: {
    '*': [
      'node_modules/@imgly/background-removal-node/**',
      'node_modules/onnxruntime-node/**',
      'node_modules/@ffmpeg-installer/**',
      'node_modules/@ffprobe-installer/**',
      'node_modules/fluent-ffmpeg/**',
      'node_modules/sharp/**',
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['fluent-ffmpeg', '@ffmpeg-installer/ffmpeg', '@ffprobe-installer/ffprobe', 'sharp', '@imgly/background-removal-node', 'onnxruntime-node'],
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
  async headers() {
    return [
      {
        // Allow CEP panels (file://, app://) to call panel API routes
        source: '/api/panel/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin',  value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
      {
        source: '/api/v1/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin',  value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
};

export default nextConfig;
