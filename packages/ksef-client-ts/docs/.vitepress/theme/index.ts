import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import ScalarApiReference from './components/ScalarApiReference.vue';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ScalarApiReference', ScalarApiReference);
  },
} satisfies Theme;
