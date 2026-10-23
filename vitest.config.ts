import { defineConfig } from 'vitest/config';
export default defineConfig({
  plugins: [
    {
      name: 'markdown-assets',
      transform: (source, id) =>
        id.endsWith('.md')
          ? { code: `export default ${JSON.stringify(source)}`, map: null }
          : undefined,
    },
  ],
  test: { fileParallelism: false, include: ['tests/**/*.test.{ts,mjs}'] },
});
