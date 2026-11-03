import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

const loaderFile = new URL(
  './packages/marketplaces/src/opencode-loader.mjs',
  import.meta.url,
);
export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  bundle: true,
  splitting: false,
  clean: true,
  loader: { '.md': 'text' },
  esbuildPlugins: [
    {
      // Embeds the OpenCode loader as text. A file-extension rule would also
      // catch bundled dependencies that ship .mjs files.
      name: 'opencode-loader',
      setup(build) {
        build.onResolve({ filter: /^virtual:opencode-loader$/ }, () => ({
          path: 'opencode-loader',
          namespace: 'opencode-loader',
        }));
        build.onLoad(
          { filter: /.*/, namespace: 'opencode-loader' },
          async () => ({
            contents: await readFile(loaderFile),
            loader: 'text',
            watchFiles: [fileURLToPath(loaderFile)],
          }),
        );
      },
    },
  ],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  noExternal: [/.*/],
});
