import { defineConfig } from 'vitepress';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const docsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Copy docs/open-api.json → docs/public/open-api.json so VitePress serves it as a static asset. */
function copyOpenApiSpec() {
  const src = resolve(docsDir, 'open-api.json');
  const dest = resolve(docsDir, 'public', 'open-api.json');
  mkdirSync(resolve(docsDir, 'public'), { recursive: true });
  copyFileSync(src, dest);
}

export default defineConfig({
  title: 'ksef-client-ts',
  description: 'TypeScript client for the Polish National e-Invoice System (KSeF) API v2',
  base: '/ksef-client-ts/',

  head: [
    ['meta', { name: 'theme-color', content: '#3eaf7c' }],
  ],

  srcExclude: [
    'ref-*.md',
  ],

  vite: {
    ssr: {
      noExternal: ['@scalar/api-reference'],
    },
    plugins: [
      { name: 'copy-openapi-spec', buildStart: copyOpenApiSpec },
    ],
  },

  themeConfig: {
    nav: [
      { text: 'Quick Start', link: '/quick-start' },
      { text: 'CLI', link: '/cli' },
      { text: 'API Reference', link: '/api-reference' },
      { text: 'Examples', link: '/examples' },
      { text: 'OpenAPI', link: '/openapi' },
      { text: 'Changelog', link: '/changelog' },
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Home', link: '/' },
          { text: 'Quick Start', link: '/quick-start' },
          { text: 'Architecture', link: '/architecture' },
          { text: 'Authentication', link: '/authentication' },
        ],
      },
      {
        text: 'Usage',
        items: [
          { text: 'CLI', link: '/cli' },
          { text: 'Configuration', link: '/configuration' },
          { text: 'Examples', link: '/examples' },
          { text: 'API Reference', link: '/api-reference' },
          { text: 'OpenAPI', link: '/openapi' },
        ],
      },
      {
        text: 'Project',
        items: [
          { text: 'Troubleshooting', link: '/troubleshooting' },
          { text: 'Tests', link: '/tests' },
          { text: 'Changelog', link: '/changelog' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Flopsstuff/ksef-client-ts' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the MIT License.',
    },
  },
});
