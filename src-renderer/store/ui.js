import { defineStore } from "pinia";

// 从localStorage加载初始状态
const loadState = () => {
	try {
		const savedLyricsAnimation = localStorage.getItem("lyricsAnimationStyle");
		const savedCloseBehavior = localStorage.getItem("closeBehavior");
		const savedSidebarVisible = localStorage.getItem("sidebarVisible");
		return {
			lyricsAnimationStyle: savedLyricsAnimation || "fade", // 'fade' 或 'slide'
			closeBehavior: savedCloseBehavior || "exit", // 'exit' 或 'minimize'
			isSidebarVisible:
				savedSidebarVisible === null ? true : savedSidebarVisible === "true",
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
	actions: {
		setView(view) {
			this.currentView = view;
		},
		toggleSidebar() {
			this.isSidebarVisible = !this.isSidebarVisible;
			localStorage.setItem("sidebarVisible", this.isSidebarVisible);
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
			const minWidth = 60;  // 减小最小宽度，为纯图标模式提供更紧凑的空间
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
