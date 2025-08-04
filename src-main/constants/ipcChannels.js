// 所有 IPC 通道名称常量集中于此，避免魔法字符串
// PS: 若需新增/修改通道，请在此文件维护统一源

const CHANNELS = {
	// --- 窗口 & UI ---
	WINDOW_MINIMIZE: "window-minimize",
	WINDOW_MAXIMIZE: "window-maximize",
	WINDOW_RESTORE: "window-restore",
	WINDOW_CLOSE: "window-close",
	WINDOW_SHOW: "window-show",
	IS_WINDOW_MAXIMIZED: "is-window-maximized",
	WINDOW_MAXIMIZED_CHANGE: "window-maximized-change", // 仅用于发送
	NAVIGATE_TO_MAIN: "navigate-to-main", // 事件

	// --- 扫描相关 ---
	SCAN_MUSIC_START: "scan-music-start",
	SCAN_MUSIC_CANCEL: "scan-music-cancel",
	SCAN_PROGRESS: "scan-progress", // 仅发送

	// --- 歌曲 / 音频 ---
	GET_SONGS: "get-songs",
	GET_SONG_BY_ID: "get-song-by-id",
	GET_LYRICS: "get-lyrics",
	GET_SONG_COVER: "get-song-cover",
	FORCE_EXTRACT_COVER: "force-extract-cover",

	PARSE_SONG_FROM_FILE: "parse-song-from-file",
	CLEAR_ALL_SONGS: "clear-all-songs",
	INCREMENT_PLAY_COUNT: "increment-play-count", // 新增：增加播放次数
	DELETE_SONG: "delete-song", // 新增：删除单个歌曲

	// 播放控制
	PLAYER_PLAY: "player-play",

	PLAYER_STOP: "player-stop",
	PLAYER_SEEK: "player-seek",

	PLAYER_GET_STATUS: "player-get-status",
	PLAYER_AUDIO_DATA: "player-audio-data", // 发送

	PLAYER_ENDED: "player-ended", // 发送
	PLAYER_ERROR: "player-error", // 发送

	// --- 文件 & 剪贴板 ---
	SHOW_ITEM_IN_FOLDER: "show-item-in-folder",
	COPY_TO_CLIPBOARD: "copy-to-clipboard",

	// --- 播放列表 ---
	GET_PLAYLISTS: "get-playlists",
	GET_PLAYLIST_BY_ID: "get-playlist-by-id",
	CREATE_PLAYLIST: "create-playlist",
	UPDATE_PLAYLIST: "update-playlist",
	DELETE_PLAYLIST: "delete-playlist",
	ADD_SONGS_TO_PLAYLIST: "add-songs-to-playlist",
	REMOVE_SONGS_FROM_PLAYLIST: "remove-songs-from-playlist",

	// --- 音乐库 ---
	GET_LIBRARIES: "get-libraries",
	ADD_LIBRARY: "add-library",
	REMOVE_LIBRARY: "remove-library",
	UPDATE_LIBRARY: "update-library",

	// Window and Dialog
	SELECT_DIRECTORY: "select-directory",

	// --- 标签编辑 ---
	GET_SONG_TAGS: "get-song-tags",
	UPDATE_SONG_TAGS: "update-song-tags",
	VALIDATE_TAG_CHANGES: "validate-tag-changes",

	// --- 文件对话框 ---
	SHOW_OPEN_DIALOG: "show-open-dialog",

	// --- 音乐导入 ---
	IMPORT_MUSIC_FILES: "import-music-files",

	// --- 在线搜索 ---
	SEARCH_ONLINE_METADATA: "search-online-metadata",

	// --- 文件路径获取 ---
	GET_PATH_FOR_FILE: "get-path-for-file",

	// --- 窗口行为设置 ---
	SET_CLOSE_BEHAVIOR: "set-close-behavior",
	GET_CLOSE_BEHAVIOR: "get-close-behavior",
};

module.exports = { CHANNELS };
