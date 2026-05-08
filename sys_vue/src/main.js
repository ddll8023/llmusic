import { createApp } from "vue";
import { createPinia } from "pinia";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";

// 导入 Font Awesome CSS
import "font-awesome/css/font-awesome.min.css";

// 导入 Tailwind CSS（纯 CSS 入口，由 @tailwindcss/vite 处理）
import "./styles/tailwind-entry.css";

// 导入主样式文件（SCSS）
import "./styles/main.scss";

import App from "./App.vue";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(ElementPlus);

app.mount("#app");

// 窗口关闭行为初始化已移至App.vue组件内
