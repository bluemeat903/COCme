import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Engine modules use ESM-style `.js` suffixes in TS imports (Node ESM
  // convention).  Teach webpack to resolve them to the corresponding .ts/.tsx.
  webpack: (cfg) => {
    cfg.resolve = cfg.resolve ?? {};
    cfg.resolve.extensionAlias = {
      '.js':  ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };
    return cfg;
  },
};

export default config;
