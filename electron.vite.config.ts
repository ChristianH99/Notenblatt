import fs from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { collectNotices } from './scripts/licenses.mjs';

/**
 * Content-Security-Policy. In production the renderer is loaded from file:// and
 * everything is bundled, so 'self' is enough. The Vite dev server needs inline
 * styles/scripts and a websocket for hot reload, so dev gets a relaxed policy.
 */
const PROD_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const DEV_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://localhost:*; object-src 'none'";

function cspPlugin(): Plugin {
  let isDev = false;
  return {
    name: 'notenblatt-csp',
    configResolved(cfg) {
      isDev = cfg.command === 'serve';
    },
    transformIndexHtml(html) {
      return html.replace('%CSP%', isDev ? DEV_CSP : PROD_CSP);
    },
  };
}

/**
 * "virtual:about" for the info page in the settings: version, copyright, the app's own
 * license and the third-party notices, collected from the dependencies at build time.
 */
function aboutPlugin(): Plugin {
  const id = 'virtual:about';
  const resolved = `\0${id}`;
  return {
    name: 'notenblatt-about',
    resolveId: (source) => (source === id ? resolved : null),
    load(source) {
      if (source !== resolved) return null;
      const pkg = JSON.parse(fs.readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string; build: { copyright: string } };
      const about = {
        version: pkg.version,
        copyright: pkg.build.copyright,
        licenseText: fs.readFileSync(resolve(__dirname, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n').trim(),
        notices: collectNotices(__dirname).map(({ noteEn: _noteEn, ...n }) => n),
      };
      return Object.entries(about)
        .map(([k, v]) => `export const ${k} = ${JSON.stringify(v)};`)
        .join('\n');
    },
  };
}

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } },
    },
  },
  preload: {
    resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].js' },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@renderer': resolve(__dirname, 'src/renderer'),
      },
    },
    plugins: [react(), cspPlugin(), aboutPlugin()],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } },
    },
  },
});
