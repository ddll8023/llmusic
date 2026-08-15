import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

// 后端服务地址（与 sys_electron/constants/backend.ts 保持一致，改端口需同步两处）
const BACKEND_BASE_URL = "http://127.0.0.1:9752";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [vue(), tailwindcss()],
	base: "./",
	define: {
		__BACKEND_BASE_URL__: JSON.stringify(BACKEND_BASE_URL),
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "src"),
		},
	},
	server: {
		port: 9753,
		fs: {
			allow: [".."],
		},
	},
	build: {
		outDir: resolve(__dirname, "dist"),
		emptyOutDir: true,
		rollupOptions: {
			input: {
				main: resolve(__dirname, "index.html"),
				desktopLyric: resolve(__dirname, "desktop-lyric.html"),
			},
		},
	},
	// SCSS 配置已移除 — 项目已从 SCSS 迁移到 Tailwind CSS
});
