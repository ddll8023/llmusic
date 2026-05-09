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
	// SCSS 配置已移除 — 项目已从 SCSS 迁移到 Tailwind CSS
});
