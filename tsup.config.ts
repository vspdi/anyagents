import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  bundle: true,
  splitting: false,
  clean: true,
  loader: { '.md': 'text' },
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  noExternal: [/.*/],
});
