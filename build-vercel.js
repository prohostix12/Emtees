import { build as viteBuild } from 'vite';
import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

console.log('--- Starting Production Build (JS API) ---');

try {
  // 1. Run Vite build for React frontend using its JS API
  console.log('Building React frontend with Vite...');
  await viteBuild();

  // 2. Run esbuild to bundle Hono backend using its JS API
  console.log('Bundling Hono API into dist/boot.js...');
  await esbuild.build({
    entryPoints: ['server/server.ts'],
    platform: 'node',
    bundle: true,
    format: 'esm',
    outfile: 'dist/boot.js',
    banner: {
      js: "import { createRequire } from 'module';const require = createRequire(import.meta.url);"
    },
    define: {
      'process.env.VERCEL': process.env.VERCEL ? '"true"' : 'undefined'
    }
  });

  console.log('--- Build completed successfully ---');
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}

