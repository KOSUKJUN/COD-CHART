<script setup lang="ts">
import { CvChart, type ContentsChartDefinition } from '../../src';
import ContentPanel from './ContentPanel.vue';
import { content } from './contents-scene';

/** 3D 상황판 look-alike: charts float as HUD panels over a starfield, grid floor and globe. */
defineProps<{
  bgColor: string;
  opacity: number;
  apply: (def: ContentsChartDefinition) => ContentsChartDefinition;
  track: (el: unknown) => void;
}>();

const left = ['contents-line', 'contents-radar', 'contents-gauge', 'contents-pie'].map(content);
const right = ['contents-polar', 'contents-bubble', 'contents-word-cloud', 'contents-empty'].map(content);
const bottom = ['contents-area', 'contents-column', 'contents-bar', 'contents-point'].map(content);
</script>

<template>
  <div class="cm-scene cm-scene--board">
    <div class="cm-scene__sky" aria-hidden="true" />
    <div class="cm-scene__floor" aria-hidden="true" />

    <div class="cm-board">
      <div class="cm-board__col">
        <ContentPanel v-for="c in left" :key="c.def.id" variant="hud" :title="c.title" :bg-color="bgColor" :opacity="opacity">
          <CvChart :ref="track" :definition="apply(c.def)" :framed="false" :header="false" :height="200" />
        </ContentPanel>
      </div>

      <div class="cm-board__center">
        <div class="cm-globe" aria-hidden="true">
          <svg viewBox="-260 -260 520 520">
            <defs>
              <radialGradient id="cm-globe-fill" cx="-0.25" cy="-0.3" r="1.1">
                <stop offset="0" stop-color="#2f7fb0" />
                <stop offset="0.45" stop-color="#11446b" />
                <stop offset="1" stop-color="#041526" />
              </radialGradient>
              <radialGradient id="cm-globe-halo" r="0.5">
                <stop offset="0.78" stop-color="#36d6f5" stop-opacity="0.35" />
                <stop offset="1" stop-color="#36d6f5" stop-opacity="0" />
              </radialGradient>
              <clipPath id="cm-globe-clip"><circle r="200" /></clipPath>
            </defs>
            <circle r="258" fill="url(#cm-globe-halo)" />
            <circle r="200" fill="url(#cm-globe-fill)" />
            <g clip-path="url(#cm-globe-clip)" fill="none" stroke="#7fe3ff" stroke-opacity="0.22">
              <g class="cm-globe__meridians">
                <ellipse v-for="i in 6" :key="i" :rx="200 * Math.cos((i * Math.PI) / 7)" ry="200" />
              </g>
              <line v-for="i in 7" :key="`p${i}`" x1="-200" x2="200" :y1="-200 + i * 50" :y2="-200 + i * 50" />
            </g>
            <circle r="200" fill="none" stroke="#7fe3ff" stroke-opacity="0.6" />
            <g class="cm-globe__orbit" fill="none" stroke="#36d6f5" stroke-width="2" stroke-dasharray="24 14" stroke-opacity="0.65">
              <circle r="236" />
            </g>
            <path d="M-120 -40 Q 40 -260 150 60" fill="none" stroke="#ff4b5c" stroke-width="2.5" />
            <path d="M-160 70 Q -20 -120 110 -110" fill="none" stroke="#ffb020" stroke-width="2" />
          </svg>
        </div>
        <div class="cm-board__bottom">
          <ContentPanel v-for="c in bottom" :key="c.def.id" variant="hud" :title="c.title" :bg-color="bgColor" :opacity="opacity">
            <CvChart :ref="track" :definition="apply(c.def)" :framed="false" :header="false" :height="190" />
          </ContentPanel>
        </div>
      </div>

      <div class="cm-board__col">
        <ContentPanel v-for="c in right" :key="c.def.id" variant="hud" :title="c.title" :bg-color="bgColor" :opacity="opacity">
          <CvChart :ref="track" :definition="apply(c.def)" :framed="false" :header="false" :height="200" />
        </ContentPanel>
      </div>
    </div>
  </div>
</template>
