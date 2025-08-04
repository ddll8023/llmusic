const {
	getPlaylists,
	getPlaylistById,
	createPlaylist,
	updatePlaylist,
	deletePlaylist,
	addSongsToPlaylist,
	removeSongsFromPlaylist,
} = require("../../services/data/Database");
const { CHANNELS } = require("../../constants/ipcChannels");

function createPlaylistHandlers() {
	const handlers = [
		{ channel: CHANNELS.GET_PLAYLISTS, handler: () => getPlaylists() },
		{
			channel: CHANNELS.GET_PLAYLIST_BY_ID,
			handler: (e, id) => getPlaylistById(id),
		},
		{
			channel: CHANNELS.CREATE_PLAYLIST,
			handler: (e, data) => createPlaylist(data),
		},
		{
			channel: CHANNELS.UPDATE_PLAYLIST,
			handler: (e, id, data) => updatePlaylist(id, data),
		},
		{
			channel: CHANNELS.DELETE_PLAYLIST,
			handler: (e, id) => deletePlaylist(id),
		},
		{
			channel: CHANNELS.ADD_SONGS_TO_PLAYLIST,
			handler: (e, id, songIds) => addSongsToPlaylist(id, songIds),
		},
		{
			channel: CHANNELS.REMOVE_SONGS_FROM_PLAYLIST,
			handler: (e, id, songIds) => removeSongsFromPlaylist(id, songIds),
		},
	];
	return { handlers, cleanup: () => {} };
}

module.exports = { createPlaylistHandlers };
