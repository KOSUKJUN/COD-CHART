<script setup lang="ts">
import { computed, ref } from 'vue';
import { STATUS_META } from '../../core/theme';
import type { ChartDefinition, ChartEventPayload, Row, StatusLevel } from '../../core/types';
import { buildStatusItems, countByLevel, type StatusItem } from '../../core/widgets';

/**
 * Device status tiles: one small tile per device, coloured by status, in the order the data
 * gives them — a device keeps its place, so a wall display can be learned by position.
 * Critical tiles breathe; hover/focus names the device; click selects it (item.select).
 */
const props = defineProps<{ definition: ChartDefinition; rows: Row[]; locale: string }>();
const emit = defineEmits<{ event: [payload: Omit<ChartEventPayload, 'chartId'>] }>();

// buildStatusItems sorts by severity; tiles keep the data order instead.
const items = computed(() => [...buildStatusItems(props.definition, props.rows, Date.now(), props.locale)].sort((a, b) => a.index - b.index));
const counts = computed(() => countByLevel(items.value));
const levels: StatusLevel[] = ['critical', 'warning', 'info', 'ok'];
const filter = ref<StatusLevel | null>(null);
const focused = ref<StatusItem | null>(null);
const selectedKey = ref<string | null>(null);
const selectable = computed(() => props.definition.interactions?.includes('selection') !== false);

function toggleFilter(l: StatusLevel) {
  filter.value = filter.value === l ? null : l;
}
function select(item: StatusItem) {
  if (!selectable.value) return;
  selectedKey.value = selectedKey.value === item.key ? null : item.key;
  emit('event', { type: 'item.select', row: item.row, name: item.title, value: item.level });
}
const detail = computed(() => focused.value ?? items.value.find((i) => i.key === selectedKey.value) ?? null);
</script>

<template>
  <div class="cv-grid">
    <div class="cv-status__summary" role="group" aria-label="상태 필터">
      <button
        v-for="l in levels"
        :key="l"
        type="button"
        class="cv-chip"
        :class="[`cv-status--${l}`, { 'is-active': filter === l }]"
        :aria-pressed="filter === l"
        :disabled="counts[l] === 0"
        @click="toggleFilter(l)"
      >
        <span aria-hidden="true">{{ STATUS_META[l].icon }}</span>
        {{ STATUS_META[l].label }}
        <span class="cv-chip__count cv-num">{{ counts[l] }}</span>
      </button>
    </div>
    <ul class="cv-grid__tiles" :aria-label="definition.title ?? '장비 상태'">
      <li v-for="item in items" :key="item.key">
        <button
          type="button"
          class="cv-grid__tile"
          :class="[`cv-level--${item.level}`, { 'is-dim': filter && filter !== item.level, 'is-selected': selectedKey === item.key }]"
          :title="`${item.title} · ${item.levelLabel}${item.description ? ` · ${item.description}` : ''}`"
          :aria-label="`${item.title}, ${item.levelLabel}`"
          :aria-pressed="selectable ? selectedKey === item.key : undefined"
          @mouseenter="focused = item"
          @mouseleave="focused = null"
          @focus="focused = item"
          @blur="focused = null"
          @click="select(item)"
        />
      </li>
    </ul>
    <p class="cv-grid__detail" aria-live="polite">
      <template v-if="detail">
        <span class="cv-grid__swatch" :class="`cv-level--${detail.level}`" aria-hidden="true" />
        <strong>{{ detail.title }}</strong> · {{ detail.levelLabel }}<template v-if="detail.description"> · {{ detail.description }}</template>
      </template>
      <template v-else>전체 {{ items.length.toLocaleString(locale) }}대 · 타일에 마우스를 올리면 장비 정보가 보입니다</template>
    </p>
  </div>
</template>
