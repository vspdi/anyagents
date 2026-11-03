import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const loaderId = 'virtual:opencode-loader';
const loaderFile = new URL(
  './packages/marketplaces/src/opencode-loader.mjs',
  import.meta.url,
);
export default defineConfig({
  plugins: [
    {
      name: 'markdown-assets',
      transform: (source, id) =>
        id.endsWith('.md')
          ? { code: `export default ${JSON.stringify(source)}`, map: null }
          : undefined,
    },
    {
      name: 'opencode-loader',
      resolveId: (id) => (id === loaderId ? `\0${loaderId}` : undefined),
      load: (id) =>
        id === `\0${loaderId}`
          ? `export default ${JSON.stringify(readFileSync(loaderFile, 'utf8'))}`
          : undefined,
    },
  ],
  test: {
    fileParallelism: false,
    include: ['tests/**/*.test.{ts,mjs}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'packages/*/src/**/*.ts'],
      reporter: ['text-summary', 'html'],
    },
  },
});
