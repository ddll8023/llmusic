import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [vue(), tailwindcss()],
	base: "./",
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
