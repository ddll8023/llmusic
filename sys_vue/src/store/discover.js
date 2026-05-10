import { defineStore } from "pinia";
import { ref, nextTick } from "vue";
import { searchSongs, getAlbumImages, getSongUrls } from "../api/song.js";

export const useDiscoverStore = defineStore("discover", () => {
	// 搜索状态
	const searchUrl = ref("");
	const urlType = ref("song");
	const searchResults = ref([]);
	const total = ref(0);
	const page = ref(1);
	const pageSize = ref(10);
	const requestId = ref("0");
	const loading = ref(false);
	const errorMsg = ref("");

	// 下载状态
	const downloadingIds = ref(new Set());

	// 搜索进度（三步串行）
	const searchStep = ref(""); // "" | "searching" | "covers" | "urls" | "done"

	/**
	 * 三步串行搜索：搜索 → 封面 → 下载链接
	 */
	async function handleSearch() {
		if (!searchUrl.value.trim()) return;

		loading.value = true;
		errorMsg.value = "";
		searchResults.value = [];
		total.value = 0;
		searchStep.value = "searching";
		const currentRequestId = String(Date.now());
		requestId.value = currentRequestId;

		// 确保 loading 遮罩先渲染到 DOM，避免快速响应时用户看不到加载动画
		await nextTick();

		try {
			// 步骤 1：搜索歌曲基本信息
			const searchRes = await searchSongs({
				requestId: currentRequestId,
				urlType: urlType.value,
				searchUrl: searchUrl.value.trim(),
				page: page.value,
				pageSize: pageSize.value,
			});

			const songs = searchRes.data.result || [];
			total.value = searchRes.data.total || 0;

			if (songs.length === 0) {
				searchStep.value = "done";
				return;
			}

			// 步骤 2：获取专辑封面
			searchStep.value = "covers";
			const albumMids = songs
				.map((s) => s.album?.albumMid)
				.filter(Boolean);
			if (albumMids.length > 0) {
				try {
					const coverRes = await getAlbumImages(currentRequestId, albumMids);
					const coverUrls = coverRes.data.result || [];
					songs.forEach((song, idx) => {
						if (song.album?.albumMid && coverUrls[idx]) {
							song.album.albumCoverUrl = coverUrls[idx];
						}
					});
				} catch {
					// 封面获取失败不阻塞流程
				}
			}

			// 步骤 3：获取下载链接
			searchStep.value = "urls";
			const songMids = songs.map((s) => s.songMid).filter(Boolean);
			if (songMids.length > 0) {
				try {
					const urlRes = await getSongUrls(currentRequestId, songMids);
					const urlList = urlRes.data.result || [];
					songs.forEach((song, idx) => {
						if (urlList[idx]) {
							song.songUrl = urlList[idx];
						}
					});
				} catch {
					// 下载链接获取失败不阻塞流程
				}
			}

			searchResults.value = songs;
			searchStep.value = "done";
		} catch (e) {
			errorMsg.value = e.message || "搜索失败";
			searchStep.value = "";
		} finally {
			loading.value = false;
		}
	}

	/**
	 * 下载单曲
	 */
	async function downloadSong(song) {
		if (!song.songUrl?.url) return;
		const id = song.songMid || song.songId;
		downloadingIds.value.add(id);

		try {
			const ext = song.songUrl.urlType || "mp3";
			const filename = `${song.songName} - ${song.singer}.${ext}`;
			const result = await window.electronAPI.downloadFile({
				url: song.songUrl.url,
				filename,
			});
			return result;
		} finally {
			downloadingIds.value.delete(id);
		}
	}

	/**
	 * 批量下载选中的歌曲
	 */
	async function batchDownload(songs) {
		const validSongs = songs.filter(s => s.songUrl?.url);
		if (validSongs.length === 0) return;
		validSongs.forEach(s => downloadingIds.value.add(s.songMid || s.songId));
		try {
			await window.electronAPI.batchDownloadFiles({
				songs: validSongs.map(s => ({
					url: s.songUrl.url,
					filename: `${s.songName} - ${s.singer}.${s.songUrl.urlType || 'mp3'}`,
				})),
			});
		} finally {
			validSongs.forEach(s => downloadingIds.value.delete(s.songMid || s.songId));
		}
	}

	/**
	 * 切换页码（歌单模式）
	 */
	function setPage(n) {
		page.value = n;
		handleSearch();
	}

	/**
	 * 切换每页条数
	 */
	function setPageSize(size) {
		pageSize.value = size;
		page.value = 1;
		handleSearch();
	}

	/**
	 * 在线试听 — 返回歌曲信息供 playerStore 使用
	 */
	function playOnline(song) {
		return {
			songName: song.songName,
			singer: song.singer,
			coverUrl: song.album?.albumCoverUrl || "",
			url: song.songUrl?.url || "",
			urlType: song.songUrl?.urlType || "mp3",
		};
	}

	return {
		// 状态
		searchUrl,
		urlType,
		searchResults,
		total,
		page,
		pageSize,
		requestId,
		loading,
		errorMsg,
		downloadingIds,
		searchStep,

		// 方法
		handleSearch,
		downloadSong,
		batchDownload,
		setPage,
		setPageSize,
		playOnline,
	};
});
