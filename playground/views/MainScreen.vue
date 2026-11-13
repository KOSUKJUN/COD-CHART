<script setup lang="ts">
import { CvChart, type ContentsChartDefinition } from '../../src';
import ContentPanel from './ContentPanel.vue';
import { content } from './contents-scene';

/** COD-M 메인화면 look-alike: navy page, tab strip, titled widgets in a grid. Same contents as the 상황판. */
defineProps<{
  bgColor: string;
  opacity: number;
  apply: (def: ContentsChartDefinition) => ContentsChartDefinition;
  track: (el: unknown) => void;
}>();

const tabs = ['table1', 'label_cirsis', 'chart1', 'chart2', 'label1', 'etc', 'sample'];
const items: { id: string; span: 'w4' | 'w6' | 'w8' }[] = [
  { id: 'contents-line', span: 'w8' },
  { id: 'contents-gauge', span: 'w4' },
  { id: 'contents-pie', span: 'w4' },
  { id: 'contents-column', span: 'w4' },
  { id: 'contents-radar', span: 'w4' },
  { id: 'contents-area', span: 'w6' },
  { id: 'contents-bar', span: 'w6' },
  { id: 'contents-polar', span: 'w4' },
  { id: 'contents-bubble', span: 'w4' },
  { id: 'contents-point', span: 'w4' },
  { id: 'contents-word-cloud', span: 'w8' },
  { id: 'contents-empty', span: 'w4' },
];
const widgets = items.map((it) => ({ ...content(it.id), span: it.span }));
</script>

<template>
  <div class="cm-scene cm-scene--main">
    <div class="cm-main__bar">
      <span class="cm-main__crumb">Main</span>
      <nav class="cm-main__tabs" aria-label="메인화면 탭 (모형)">
        <span v-for="(t, i) in tabs" :key="t" :class="{ 'is-active': i === 2 }">{{ t }}</span>
      </nav>
      <span class="cm-main__range">2026-11-11 00:00:00 ~ 2026-11-11 16:50:00</span>
    </div>
    <div class="cm-main__grid">
      <ContentPanel v-for="w in widgets" :key="w.def.id" :class="w.span" variant="main" :title="w.title" :bg-color="bgColor" :opacity="opacity">
        <CvChart :ref="track" :definition="apply(w.def)" :framed="false" :header="false" :height="230" />
      </ContentPanel>
    </div>
  </div>
</template>
