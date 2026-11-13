<script setup lang="ts">
import { computed } from 'vue';

/**
 * Mimics a COD-M dashboard content box: the host owns the title bar and the
 * panel surface (monitor_bg_color + monitor_opacity); the chart renders unframed inside.
 */
const props = defineProps<{
  title: string;
  /** `hud` = 3D 상황판 overlay, `main` = 메인화면 widget. */
  variant: 'hud' | 'main';
  /** monitor_bg_color (hex). */
  bgColor: string;
  /** monitor_opacity, 0–100. */
  opacity: number;
}>();

const surface = computed(() => {
  const hex = props.bgColor.replace('#', '');
  const n = Number.parseInt(hex.length === 3 ? hex.replace(/./g, '$&$&') : hex, 16);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${props.opacity}%)`;
});
</script>

<template>
  <section class="cm-panel" :class="`cm-panel--${variant}`" :style="{ '--cm-surface': surface }">
    <header class="cm-panel__head">
      <h2 class="cm-panel__title">{{ title }}</h2>
      <span class="cm-panel__tools" aria-hidden="true"><i /><i /><i /></span>
    </header>
    <div class="cm-panel__body">
      <slot />
    </div>
  </section>
</template>
