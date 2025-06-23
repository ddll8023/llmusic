import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./styles/main.scss";

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.mount("#app");

// 窗口关闭行为初始化已移至App.vue组件内
