<script setup lang="ts">
import { computed } from 'vue';
import { STATUS_META } from '../../core/theme';
import type { ChartDefinition, ChartEventPayload, Row } from '../../core/types';
import { buildKpiModel, sparklinePath } from '../../core/widgets';

const props = defineProps<{ definition: ChartDefinition; rows: Row[]; locale: string }>();
const emit = defineEmits<{ event: [payload: Omit<ChartEventPayload, 'chartId'>] }>();

const model = computed(() => buildKpiModel(props.definition, props.rows, props.locale));
const hasThresholds = computed(() => (props.definition.options?.thresholds?.length ?? 0) > 0);
const spark = computed(() => sparklinePath(model.value.trend, 120, 36));
const selectable = computed(() => props.definition.interactions?.includes('selection'));
const arrow = computed(() => (model.value.delta?.direction === 'up' ? '▲' : model.value.delta?.direction === 'down' ? '▼' : '—'));

function select() {
  if (selectable.value) emit('event', { type: 'point.click', row: props.rows[props.rows.length - 1], value: model.value.value });
}
</script>

<template>
  <component
    :is="selectable ? 'button' : 'div'"
    class="cv-kpi"
    :class="{ 'cv-kpi--interactive': selectable }"
    :type="selectable ? 'button' : undefined"
    @click="select"
  >
    <!-- The card header already shows the title; repeat the label only when it differs. -->
    <div v-if="model.label !== definition.title" class="cv-kpi__label">{{ model.label }}</div>
    <div class="cv-kpi__row">
      <div class="cv-kpi__value">
        <span class="cv-num">{{ model.valueText }}</span>
        <span v-if="model.unit" class="cv-kpi__unit">{{ model.unit }}</span>
      </div>
      <svg v-if="spark" class="cv-kpi__spark" viewBox="0 0 120 36" aria-hidden="true" preserveAspectRatio="none">
        <path :d="spark" fill="none" stroke="var(--cv-series-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      </svg>
    </div>
    <div class="cv-kpi__meta">
      <span
        v-if="model.delta"
        class="cv-delta"
        :class="`cv-delta--${model.delta.sentiment}`"
        :aria-label="model.delta.srText"
      ><span aria-hidden="true">{{ arrow }}</span> {{ model.delta.text }}</span>
      <span v-if="model.delta" class="cv-kpi__compare" aria-hidden="true">이전 대비</span>
      <span v-if="hasThresholds" class="cv-status-badge" :class="`cv-status--${model.status}`">
        <span aria-hidden="true">{{ STATUS_META[model.status].icon }}</span> {{ STATUS_META[model.status].label }}
      </span>
    </div>
  </component>
</template>
