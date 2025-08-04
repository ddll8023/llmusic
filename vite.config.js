import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [vue()],
	base: "./",
	root: resolve(__dirname, "src-renderer"),
	resolve: {
		alias: {
			"@": resolve(__dirname, "src-renderer"),
		},
	},
	build: {
		outDir: resolve(__dirname, "src-renderer/dist"),
		emptyOutDir: true,
	},
	css: {
		preprocessorOptions: {
			scss: {
				// 向Vue组件自动注入变量（使用@use语法）
				additionalData: `@use "@/styles/variables.scss" as *;`,
			},
		},
	},
});
