<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { fieldLabel, formatValue } from '../../core/format';
import type { ChartDefinition, ChartEventPayload, Row } from '../../core/types';
import { paginate, sortRows, type SortDir } from '../../core/widgets';

const props = defineProps<{ definition: ChartDefinition; rows: Row[]; locale: string }>();
const emit = defineEmits<{ event: [payload: Omit<ChartEventPayload, 'chartId'>] }>();

const fields = computed(() => props.definition.data.fields);
const sortable = computed(() => props.definition.options?.sortable !== false);
const pageSize = computed(() => props.definition.options?.pageSize ?? 10);
const sortKey = ref<string | null>(null);
const sortDir = ref<SortDir>('desc');
const page = ref(1);
const selectable = computed(() => props.definition.interactions?.includes('selection') !== false);
const selected = shallowRef<Row | null>(null);

const sorted = computed(() => sortRows(props.rows, sortKey.value, sortDir.value));
const paged = computed(() => paginate(sorted.value, page.value, pageSize.value));
watch(() => props.rows, () => (page.value = Math.min(page.value, paged.value.pageCount)));

function toggleSort(key: string) {
  if (!sortable.value) return;
  if (sortKey.value !== key) {
    sortKey.value = key;
    sortDir.value = 'desc';
  } else if (sortDir.value === 'desc') sortDir.value = 'asc';
  else sortKey.value = null;
  page.value = 1;
}
function ariaSort(key: string) {
  return sortKey.value === key ? (sortDir.value === 'asc' ? 'ascending' : 'descending') : 'none';
}
function select(row: Row) {
  if (!selectable.value) return;
  selected.value = selected.value === row ? null : row;
  emit('event', { type: 'row.click', row });
}
</script>

<template>
  <div class="cv-table-wrap">
    <div class="cv-table-scroll" tabindex="0" :aria-label="`${definition.title ?? '데이터'} 표 (스크롤 가능)`">
      <table class="cv-table">
        <thead>
          <tr>
            <th
              v-for="f in fields"
              :key="f.name"
              scope="col"
              :aria-sort="sortable ? ariaSort(f.name) : undefined"
              :class="{ 'is-num': f.type === 'number' }"
            >
              <button v-if="sortable" type="button" class="cv-th-btn" @click="toggleSort(f.name)">
                {{ fieldLabel(f) }}
                <span class="cv-sort" :class="{ 'is-on': sortKey === f.name }" aria-hidden="true">
                  {{ sortKey === f.name ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}
                </span>
              </button>
              <template v-else>{{ fieldLabel(f) }}</template>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(r, i) in paged.rows"
            :key="i"
            :class="{ 'is-selected': selected === r, 'is-clickable': selectable }"
            :tabindex="selectable ? 0 : undefined"
            :aria-selected="selectable ? selected === r : undefined"
            @click="select(r)"
            @keydown.enter.prevent="select(r)"
            @keydown.space.prevent="select(r)"
          >
            <td v-for="f in fields" :key="f.name" :class="{ 'is-num': f.type === 'number' }">
              {{ formatValue(r[f.name], f, { locale }) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <nav v-if="paged.pageCount > 1" class="cv-pager" aria-label="페이지">
      <span class="cv-pager__info cv-num">{{ ((paged.page - 1) * pageSize + 1).toLocaleString() }}–{{ Math.min(paged.page * pageSize, rows.length).toLocaleString() }} / {{ rows.length.toLocaleString() }}</span>
      <button type="button" class="cv-btn cv-btn--icon" :disabled="paged.page <= 1" aria-label="이전 페이지" @click="page = paged.page - 1">‹</button>
      <span class="cv-num" aria-current="page">{{ paged.page }} / {{ paged.pageCount }}</span>
      <button type="button" class="cv-btn cv-btn--icon" :disabled="paged.page >= paged.pageCount" aria-label="다음 페이지" @click="page = paged.page + 1">›</button>
    </nav>
  </div>
</template>
