<script setup lang="ts">
import { computed, ref } from 'vue';
import { STATUS_META } from '../../core/theme';
import type { ChartDefinition, ChartEventPayload, Row, StatusLevel } from '../../core/types';
import { buildStatusItems, countByLevel, type StatusItem } from '../../core/widgets';

const props = defineProps<{ definition: ChartDefinition; rows: Row[]; locale: string; now?: number }>();
const emit = defineEmits<{ event: [payload: Omit<ChartEventPayload, 'chartId'>] }>();

const items = computed(() => buildStatusItems(props.definition, props.rows, props.now ?? Date.now(), props.locale));
const counts = computed(() => countByLevel(items.value));
const levels: StatusLevel[] = ['critical', 'warning', 'info', 'ok'];
const filter = ref<StatusLevel | null>(null);
const visible = computed(() => (filter.value ? items.value.filter((i) => i.level === filter.value) : items.value));
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
</script>

<template>
  <div class="cv-status">
    <div class="cv-status__summary" role="group" aria-label="심각도 필터">
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
    <ul class="cv-status__list" :aria-label="definition.title ?? '상태 목록'">
      <li v-for="item in visible" :key="item.key">
        <button
          type="button"
          class="cv-status__item"
          :class="[`cv-level--${item.level}`, { 'is-selected': selectedKey === item.key }]"
          :aria-pressed="selectable ? selectedKey === item.key : undefined"
          @click="select(item)"
        >
          <span class="cv-status-badge" :class="`cv-status--${item.level}`">
            <span aria-hidden="true">{{ item.icon }}</span> {{ item.levelLabel }}
          </span>
          <span class="cv-status__text">
            <span class="cv-status__title">{{ item.title }}</span>
            <span v-if="item.description" class="cv-status__desc">{{ item.description }}</span>
          </span>
          <time v-if="item.timeText" class="cv-status__time" :datetime="item.timeIso">{{ item.timeText }}</time>
        </button>
      </li>
    </ul>
  </div>
</template>
