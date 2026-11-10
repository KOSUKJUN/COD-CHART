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
      { name: ['Today_1', 'Today_2', 'Today_3', 'Today_4', 'Today_5', 'Today_6', 'Today_7', 'Today_8'], value: [51, 24, 72, 43, 91, 15, 64, 34] },
      { name: ['Weeks_1', 'Weeks_2', 'Weeks_3', 'Weeks_4', 'Weeks_5', 'Weeks_6', 'Weeks_7', 'Weeks_8'], value: [84, 33, 56, 12, 76, 25, 94, 44] },
      { name: ['Older_1', 'Older_2', 'Older_3', 'Older_4', 'Older_5', 'Older_6', 'Older_7', 'Older_8'], value: [68, 18, 38, 81, 57, 28, 99, 48] },
    ],
  }] },
  { ...base, id: 'contents-word-cloud', type: 'word-cloud', title: 'Contents · Word Cloud', contentsData: [
    { name: '악성코드', weight: 100 }, { name: '트로이목마', weight: 82 }, { name: '개인정보', weight: 76 },
    { name: '애드웨어', weight: 62 }, { name: '위협대응', weight: 95 }, { name: '랜섬웨어', weight: 90 },
    { name: '네트워크', weight: 71 }, { name: '취약점', weight: 85 }, { name: '침해사고', weight: 68 },
    { name: '보안관제', weight: 64 }, { name: '접근제어', weight: 55 }, { name: '이상징후', weight: 70 },
    { name: '피싱', weight: 78 }, { name: '스팸', weight: 37 }, { name: '방화벽', weight: 48 },
    { name: '인증', weight: 54 }, { name: '암호화', weight: 52 }, { name: '로그분석', weight: 58 },
    { name: '클라우드', weight: 66 }, { name: '엔드포인트', weight: 49 }, { name: '데이터유출', weight: 72 },
    { name: '계정탈취', weight: 47 }, { name: '위험관리', weight: 46 }, { name: '보안정책', weight: 40 },
    { name: '해킹', weight: 61 }, { name: '모니터링', weight: 56 }, { name: '위협정보', weight: 51 },
    { name: '디도스', weight: 59 }, { name: '사고대응', weight: 60 }, { name: '시스템', weight: 43 },
    { name: '패치', weight: 31 }, { name: '백업', weight: 30 }, { name: '탐지', weight: 53 },
    { name: '차단', weight: 45 }, { name: '분석', weight: 44 }, { name: '복구', weight: 29 },
    { name: '사용자', weight: 32 }, { name: '인프라', weight: 35 }, { name: '보안', weight: 74 },
    { name: '위험', weight: 34 }, { name: '기록', weight: 25 }, { name: '감사', weight: 28 },
  ] },
];
