<script setup>
import { ref, watch, onMounted, nextTick } from 'vue';
import { usePlayerStore } from '../store/player';
import { useUiStore } from '../store/ui';

const playerStore = usePlayerStore();
const uiStore = useUiStore();
const songListRef = ref(null);

const songs = ref([]);
const isLoading = ref(false);

async function fetchSongsDetails(ids) {
    if (!ids || ids.length === 0) {
        songs.value = [];
        return;
    }
    isLoading.value = true;
    try {
        const songDetails = [];
        for (const id of ids) {
            const result = await window.electronAPI.getSongById(id);
            if (result.success && result.song) {
                songDetails.push(result.song);
            }
        }
        songs.value = songDetails;
    } catch (error) {
        console.error("Error fetching playlist songs individually:", error.message || error);
        songs.value = [];
    } finally {
        isLoading.value = false;
        // After fetching/updating songs, try to scroll
        await nextTick();
        scrollToCurrentSong();
    }
}

function playSong(song) {
    playerStore.playSong(song);
}

function removeFromPlaylist(songId) {
    const index = playerStore.playlist.indexOf(songId);
    if (index > -1) {
        playerStore.removeFromPlaylist(index);
    }
}

async function scrollToCurrentSong() {
    // Wait for DOM update
    await nextTick();

    if (!uiStore.isPlaylistVisible || !playerStore.currentSong || !songListRef.value) {
        return;
    }

    const songId = playerStore.currentSong.id;
    // The `li` elements are direct children of the `ul` (songListRef)
    const songElement = songListRef.value.querySelector(`[data-song-id="${songId}"]`);

    if (songElement) {
        songElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
    }
}

onMounted(() => {
    fetchSongsDetails(playerStore.playlist);
});

// Watch for changes in the playlist (add/remove songs)
watch(() => playerStore.playlist, (newIds) => {
    fetchSongsDetails(newIds);
}, { deep: true });

// Watch for when the playlist becomes visible
watch(() => uiStore.isPlaylistVisible, (isVisible) => {
    if (isVisible) {
        // We might need to fetch details again if the playlist was hidden
        // and the main song list changed. However, for now, just scroll.
        scrollToCurrentSong();
    }
});

// Watch for changes in the currently playing song
watch(() => playerStore.currentSong, () => {
    // Only scroll if the playlist is already visible
    if (uiStore.isPlaylistVisible) {
        scrollToCurrentSong();
    }
}, { deep: true });
</script>

<template>
    <div class="playlist-panel">
        <div class="playlist-header">
            <h3>播放列表</h3>
            <button @click="uiStore.togglePlaylist()" class="close-btn">&times;</button>
        </div>
        <div v-if="isLoading" class="loading">正在加载...</div>
        <ul v-else-if="songs.length > 0" class="song-list" ref="songListRef">
            <li v-for="song in songs" :key="song.id" :data-song-id="song.id" @click="playSong(song)"
                :class="{ 'is-playing': playerStore.currentSong && playerStore.currentSong.id === song.id }">
                <div class="song-info">
                    <span class="title">{{ song.title }}</span>
                    <span class="artist">{{ song.artist }}</span>
                </div>
                <button @click.stop="removeFromPlaylist(song.id)" class="remove-btn">移除</button>
            </li>
        </ul>
        <div v-else class="empty-playlist">
            <p>播放列表为空</p>
        </div>
    </div>
</template>

<style scoped>
.playlist-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: transparent;
    color: #fff;
}

.playlist-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid #282828;
}

.playlist-header h3 {
    margin: 0;
    font-size: 18px;
}

.close-btn {
    background: none;
    border: none;
    color: #fff;
    font-size: 24px;
    cursor: pointer;
}

.loading,
.empty-playlist {
    text-align: center;
    padding: 20px;
    color: #b3b3b3;
}

.song-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    flex: 1;
}

.song-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    cursor: pointer;
    border-bottom: 1px solid #222;
    transition: background-color 0.2s;
}

.song-list li:hover {
    background-color: #282828;
}

.song-list li.is-playing {
    background-color: #333;
    color: #1db954;
    /* Spotify green */
}

.song-info {
    display: flex;
    flex-direction: column;
}

.song-info .title {
    font-weight: 500;
}

.song-info .artist {
    font-size: 12px;
    color: #b3b3b3;
    margin-top: 4px;
}

.remove-btn {
    background: none;
    border: none;
    color: #b3b3b3;
    cursor: pointer;
    visibility: hidden;
    opacity: 0;
    transition: opacity 0.2s, color 0.2s;
}

.song-list li:hover .remove-btn {
    visibility: visible;
    opacity: 1;
}

.remove-btn:hover {
    color: #fff;
}
</style>