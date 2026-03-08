import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'ksef-client-ts',
  description: 'TypeScript client for the Polish National e-Invoice System (KSeF) API v2',
  base: '/ksef-client-ts/',

  head: [
    ['meta', { name: 'theme-color', content: '#3eaf7c' }],
  ],

  srcExclude: [
    '*-plan.md',
    'ref-*.md',
  ],

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/authentication' },
      { text: 'CLI', link: '/cli' },
      { text: 'API Reference', link: '/api-reference' },
      { text: 'Examples', link: '/examples' },
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting Started', link: '/' },
          { text: 'Authentication', link: '/authentication' },
        ],
      },
      {
        text: 'Usage',
        items: [
          { text: 'CLI', link: '/cli' },
          { text: 'Examples', link: '/examples' },
          { text: 'API Reference', link: '/api-reference' },
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
