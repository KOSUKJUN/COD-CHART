import type { ContentsChartDefinition } from '../src';

const series = {
  timesArr: ['17:00', '17:05', '17:10', '17:15', '17:20'],
  data: [
    { key: 'INBOUND BPS', color: '#4D8DFF', values: [142, 186, 182, 196, 189].map((y, x) => ({ x, y })) },
    { key: 'INBOUND PPS', color: '#36D6F5', values: [212, 216, 136, 118, 129].map((y, x) => ({ x, y })) },
  ],
};

const base = { schemaVersion: '1.0.0' };

export const contentsDefinitions: ContentsChartDefinition[] = [
  { ...base, id: 'contents-line', type: 'line', title: 'Contents · 선형 차트', contentsData: series },
  { ...base, id: 'contents-area', type: 'area', title: 'Contents · 영역 차트', contentsData: series },
  { ...base, id: 'contents-bar', type: 'bar', title: 'Contents · 수평 막대', contentsData: series },
  { ...base, id: 'contents-column', type: 'column', title: 'Contents · 수직 막대', contentsData: series },
  { ...base, id: 'contents-point', type: 'line', title: 'Contents · 선형 차트(Point)', contentsData: series, options: { showPoints: true } },
  { ...base, id: 'contents-pie', type: 'pie', title: 'Contents · Pie 차트', contentsData: [
    { col0: 'Canon', col1: 11.3 }, { col0: 'PanasonicHD', col1: 14.5 }, { col0: 'Defeway', col1: 17.7 },
  ] },
  { ...base, id: 'contents-polar', type: 'polar-pie', title: 'Contents · Pie 차트(Polar)', contentsData: [
    { id: '0', parent: '', name: 'The World', value: '15' },
    { id: '1', parent: '0', name: 'Asia', value: '3' },
    { id: '1_1', parent: '1', name: 'China', value: '1' },
    { id: '1_2', parent: '1', name: 'Korea', value: '1' },
    { id: '2', parent: '0', name: 'Africa', value: '3' },
    { id: '3', parent: '0', name: 'America', value: '3' },
    { id: '4', parent: '0', name: 'Europe', value: '3' },
    { id: '5', parent: '0', name: 'Oceanic', value: '3' },
  ] },
  { ...base, id: 'contents-radar', type: 'radar', title: 'Contents · Spider 차트', contentsData: {
    categories: ['a.dns.kr', 'b.dns.kr', 'c.dns.kr', 'd.dns.kr', 'e.dns.kr', 'f.dns.kr'],
    data: [
      { name: '600 msec', data: [10, 5, 65, 0, 0, 0], pointPlacement: 'on' },
      { name: '400 msec', data: [30, 25, 85, 20, 0, 0], pointPlacement: 'on' },
      { name: '200 msec', data: [50, 45, 105, 40, 20, 30], pointPlacement: 'on' },
    ],
  } },
  { ...base, id: 'contents-gauge', type: 'gauge', title: 'Contents · Gauge 차트', contentsData: [
    { col0: 'Angel', col1: 11 }, { col0: 'Babal', col1: 32 }, { col0: 'Consol', col1: 45 },
    { col0: 'Depth', col1: 17 }, { col0: 'Earth', col1: 65 },
  ] },
  { ...base, id: 'contents-bubble', type: 'bubble', title: 'Contents · Bubble 차트', contentsData: [{
    categories: ['Today', 'Weeks', 'Older'],
    data: [
      { name: ['Today_1', 'Today_2'], value: [51, 24] },
      { name: ['Weeks_1', 'Weeks_2'], value: [84, 33] },
      { name: ['Older_1', 'Older_2'], value: [68, 12] },
    ],
  }] },
  { ...base, id: 'contents-word-cloud', type: 'word-cloud', title: 'Contents · Word Cloud', contentsData: [
    { name: '악성코드', weight: 12 }, { name: '트로이목마', weight: 8 }, { name: '개인정보', weight: 3 },
    { name: '애드웨어', weight: 7 }, { name: '위협대응', weight: 7 },
  ] },
];
