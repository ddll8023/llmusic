/**
 * 歌曲搜索下载 API
 */
import axios from "axios";

const apiClient = axios.create({
	baseURL: "http://localhost:9752/api/v1/song",
	timeout: 300000,
	headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.response.use(
	(response) => {
		const res = response.data;
		if (res.code === 0) return res;
		return Promise.reject(new Error(res.message || "请求失败"));
	},
	(error) => Promise.reject(error),
);

export function searchSongs(params) {
	return apiClient.post("/search", params);
}

export function getAlbumImages(requestId, albumIdList) {
	return apiClient.post("/albumImg", { requestId, albumIdList });
}

export function getSongUrls(requestId, songIdList) {
	return apiClient.post("/songUrl", { requestId, songIdList });
}

export function searchByKeyword(keyword, page, pageSize) {
	return apiClient.post("/searchByKeyword", {
		requestId: String(Date.now()),
		keyword,
		page,
		pageSize,
	});
}
