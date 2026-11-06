import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './styles/base.css';
import './styles/design-language.css';
import { installPalette } from './styles/palette';
installPalette();
createApp(App).use(createPinia()).mount('#app');
