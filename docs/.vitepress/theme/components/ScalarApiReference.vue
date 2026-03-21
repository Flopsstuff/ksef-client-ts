<script setup lang="ts">
import { useData, withBase } from 'vitepress';
import { defineClientComponent } from 'vitepress';
import '@scalar/api-reference/style.css';

const { isDark } = useData();

const ApiReference = defineClientComponent(() =>
  import('@scalar/api-reference').then((m) => m.ApiReference ?? m.default)
);
</script>

<template>
  <div class="scalar-wrapper">
    <ApiReference
      :configuration="{
        url: withBase('/open-api.json'),
        darkMode: isDark,
        hideDarkModeToggle: true,
        withDefaultFonts: false,
      }"
    />
  </div>
</template>

<style scoped>
.scalar-wrapper {
  /* break out of VitePress content container */
  margin: 0 calc(-1 * var(--vp-offset, 0px));
  width: 100%;
}
</style>
