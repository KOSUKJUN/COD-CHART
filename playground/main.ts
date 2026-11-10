import { createApp } from 'vue';
import { createCodvilChart } from '../src';
import App from './App.vue';
import { createMockServices } from './mockServices';
import './playground.css';

createApp(App)
  .use(createCodvilChart({ locale: 'ko-KR', ...createMockServices() }))
  .mount('#app');
