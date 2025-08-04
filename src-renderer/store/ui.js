import { defineStore } from "pinia";

// 从localStorage加载初始状态
const loadState = () => {
	try {
		const savedLyricsAnimation = localStorage.getItem("lyricsAnimationStyle");
		const savedCloseBehavior = localStorage.getItem("closeBehavior");
		const savedSidebarVisible = localStorage.getItem("sidebarVisible");

		// 强制重置侧边栏为可见状态，清除之前的错误状态
		if (savedSidebarVisible === "false") {
			localStorage.setItem("sidebarVisible", "true");
		}

		return {
			lyricsAnimationStyle: savedLyricsAnimation || "fade", // 'fade' 或 'slide'
			closeBehavior: savedCloseBehavior || "exit", // 'exit' 或 'minimize'
			isSidebarVisible: true, // 强制设为true
		};
	} catch (e) {
		return {
			lyricsAnimationStyle: "fade",
			closeBehavior: "exit",
			isSidebarVisible: true,
		};
	}
};

export const useUiStore = defineStore("ui", {
	state: () => ({
		isSidebarVisible: loadState().isSidebarVisible,
		sidebarWidth: 250,
		isPlaylistVisible: false,
		currentView: "main",
		lyricsAnimationStyle: loadState().lyricsAnimationStyle, // 歌词页面动画效果
		closeBehavior: loadState().closeBehavior, // 窗口关闭行为
	}),
	getters: {
		// 计算侧边栏是否处于收缩状态
		isSidebarCollapsed: (state) => state.sidebarWidth <= 130,
		// 计算当前侧边栏的实际显示宽度
		effectiveSidebarWidth: (state) =>
			state.isSidebarVisible ? state.sidebarWidth : 0,
	},
	actions: {
		setView(view) {
			this.currentView = view;

			// 当切换到非歌单页面时，清除歌单选中状态
			if (view !== "playlist") {
				// 需要导入playlistStore，但为了避免循环依赖，使用动态导入
				import("./playlist.js")
					.then(({ usePlaylistStore }) => {
						const playlistStore = usePlaylistStore();
						playlistStore.clearCurrentPlaylist();
					})
					.catch((error) => {
						console.error("清除歌单状态失败:", error);
					});
			}
		},
		toggleSidebar() {
			this.isSidebarVisible = !this.isSidebarVisible;
			localStorage.setItem("sidebarVisible", this.isSidebarVisible);
		},
		// 收缩/展开侧边栏（调整宽度）
		toggleSidebarCollapse() {
			if (this.isSidebarCollapsed) {
				// 当前是收缩状态，展开到默认宽度
				this.sidebarWidth = 250;
			} else {
				// 当前是展开状态，收缩到最小宽度
				this.sidebarWidth = 60;
			}
		},
		// 收缩侧边栏
		collapseSidebar() {
			this.sidebarWidth = 60;
		},
		// 展开侧边栏
		expandSidebar() {
			this.sidebarWidth = 250;
		},
		togglePlaylist() {
			this.isPlaylistVisible = !this.isPlaylistVisible;
		},
		showSidebar() {
			this.isSidebarVisible = true;
			localStorage.setItem("sidebarVisible", "true");
		},
		hideSidebar() {
			this.isSidebarVisible = false;
			localStorage.setItem("sidebarVisible", "false");
		},
		setSidebarWidth(newWidth) {
			const minWidth = 60; // 减小最小宽度，为纯图标模式提供更紧凑的空间
			const maxWidth = 300;
			if (newWidth < minWidth) {
				this.sidebarWidth = minWidth;
			} else if (newWidth > maxWidth) {
				this.sidebarWidth = maxWidth;
			} else {
				this.sidebarWidth = newWidth;
			}
		},
		// 设置歌词页面动画效果
		setLyricsAnimationStyle(style) {
			this.lyricsAnimationStyle = style;
			// 保存到localStorage
			try {
				localStorage.setItem("lyricsAnimationStyle", style);
			} catch (e) {
				console.error("保存设置失败:", e);
			}
		},
		// 设置窗口关闭行为
		async setCloseBehavior(behavior) {
			// 确保值是有效的
			if (behavior !== "exit" && behavior !== "minimize") {
				console.error("无效的窗口关闭行为:", behavior);
				return false;
			}

			// 通过IPC通知主进程更新设置
			const result = await window.electronAPI.setCloseBehavior(behavior);
			if (result) {
				this.closeBehavior = behavior;
				// 保存到localStorage
				try {
					localStorage.setItem("closeBehavior", behavior);
				} catch (e) {
					console.error("保存设置失败:", e);
				}
				return true;
			}
			return false;
		},
		// 初始化窗口关闭行为
		async initCloseBehavior() {
			try {
				// 从主进程获取当前设置
				const currentBehavior = await window.electronAPI.getCloseBehavior();
				// 如果主进程和本地存储的设置不一致，以主进程为准
				if (currentBehavior !== this.closeBehavior) {
					this.closeBehavior = currentBehavior;
					localStorage.setItem("closeBehavior", currentBehavior);
				}
			} catch (e) {
				console.error("初始化窗口关闭行为失败:", e);
			}
		},
	},
});
