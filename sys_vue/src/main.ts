import { createApp } from 'vue'
import { createPinia } from 'pinia'

// 导入 Font Awesome CSS
import 'font-awesome/css/font-awesome.min.css'

// 导入 Tailwind CSS（纯 CSS 入口，由 @tailwindcss/vite 处理）
import './styles/tailwind-entry.css'

// 导入全局基础样式（CSS Reset、动画等）
import './styles/base.css'

import App from './App.vue'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')
