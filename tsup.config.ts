import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: true,
  // Bundle all local imports into a single file for fast GitHub Action startup
  noExternal: [/(.*)/],
  external: [],
})
