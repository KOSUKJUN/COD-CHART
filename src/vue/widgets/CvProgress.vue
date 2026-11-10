<script setup lang="ts">
import { computed } from 'vue';
import { STATUS_META } from '../../core/theme';
import type { ChartDefinition, Row } from '../../core/types';
import { buildProgressModel } from '../../core/widgets';

const props = defineProps<{ definition: ChartDefinition; rows: Row[]; locale: string }>();
const m = computed(() => buildProgressModel(props.definition, props.rows, props.locale));
</script>

<template>
  <div class="cv-progress">
    <div class="cv-progress__head">
      <span class="cv-progress__label">{{ m.label !== definition.title ? m.label : '' }}</span>
      <span class="cv-progress__value">
        <span class="cv-num">{{ m.valueText }}</span>
        <span class="cv-progress__max">/ {{ m.maxText }}</span>
      </span>
    </div>
    <div
      class="cv-progress__track"
      role="progressbar"
      :aria-label="m.label || '진행률'"
      :aria-valuemin="m.min"
      :aria-valuemax="m.max"
      :aria-valuenow="m.value ?? undefined"
      :aria-valuetext="`${m.valueText} (${m.percentText}), ${STATUS_META[m.status].label}`"
    >
      <div class="cv-progress__fill" :class="`cv-fill--${m.status}`" :style="{ transform: `scaleX(${m.ratio})` }" />
      <span
        v-for="(mk, i) in m.markers"
        :key="i"
        class="cv-progress__marker"
        :class="`cv-marker--${mk.status}`"
        :style="{ left: `${mk.ratio * 100}%` }"
        :title="mk.label"
      />
    </div>
    <div class="cv-progress__foot">
      <span class="cv-status-badge" :class="`cv-status--${m.status}`">
        <span aria-hidden="true">{{ STATUS_META[m.status].icon }}</span> {{ STATUS_META[m.status].label }}
      </span>
      <span class="cv-progress__pct cv-num">{{ m.percentText }}</span>
    </div>
    <ul v-if="m.markers.length" class="cv-progress__legend" aria-label="임계치">
      <li v-for="(mk, i) in m.markers" :key="i">
        <span class="cv-progress__tick" :class="`cv-marker--${mk.status}`" aria-hidden="true" />{{ mk.label }}
      </li>
    </ul>
  </div>
</template>
