<script setup>
import { ref, watch, onMounted, nextTick } from 'vue';
import { usePlayerStore } from '../../store/player';
import { useUiStore } from '../../store/ui';
import FAIcon from './FAIcon.vue';

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
    <div class="playlist" :class="{
        'is-loading': isLoading,
        'is-empty': !isLoading && songs.length === 0
    }">
        <div class="playlist__header">
            <h3 class="playlist__title">播放列表</h3>
            <button @click="uiStore.togglePlaylist()" class="playlist__close-btn" aria-label="关闭播放列表">
                <FAIcon name="times" size="medium" color="secondary" :clickable="true" />
            </button>
        </div>

        <div class="playlist__content">
            <!-- Loading State -->
            <div v-if="isLoading" class="playlist__loading">
                <div class="loading-spinner"></div>
                <span class="loading-text">正在加载...</span>
            </div>

            <!-- Song List -->
            <ul v-else-if="songs.length > 0" class="playlist__song-list" ref="songListRef">
                <li v-for="song in songs" :key="song.id" :data-song-id="song.id" @click="playSong(song)"
                    class="playlist__song-item" :class="{
                        'is-playing': playerStore.currentSong && playerStore.currentSong.id === song.id
                    }">
                    <div class="playlist__song-info">
                        <span class="playlist__song-title">{{ song.title }}</span>
                        <span class="playlist__song-artist">{{ song.artist }}</span>
                    </div>
                    <button @click.stop="removeFromPlaylist(song.id)" class="playlist__remove-btn" aria-label="从播放列表移除">
                        <FAIcon name="trash" size="small" color="danger" :clickable="true" />
                    </button>
                </li>
            </ul>

            <!-- Empty State -->
            <div v-else class="playlist__empty">
                <FAIcon name="music" size="xl" color="secondary" />
                <p class="playlist__empty-text">播放列表为空</p>
                <p class="playlist__empty-hint">添加一些歌曲开始播放</p>
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
@use "../../styles/variables/_colors" as *;
@use "../../styles/variables/_layout" as *;

.playlist {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: $bg-secondary;
    color: $text-primary;
    border-radius: $border-radius;
    box-shadow: $box-shadow;
    overflow: hidden;
    animation: slideIn $transition-base ease-out;
    user-select: none;
    border: 1px solid $bg-tertiary;

    @include respond-to("sm") {
        border-radius: 0;
        box-shadow: none;
        border: none;
        border-left: 1px solid $bg-tertiary;
    }
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateX(20px);
    }

    to {
        opacity: 1;
        transform: translateX(0);
    }
}

.playlist__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: $content-padding;
    background-color: $bg-tertiary;
    border-bottom: 1px solid $bg-tertiary;
    flex-shrink: 0;

    @include respond-to("sm") {
        padding: ($content-padding * 0.75);
    }
}

.playlist__title {
    margin: 0;
    font-size: $font-size-lg;
    font-weight: $font-weight-medium;
    color: $text-primary;

    @include respond-to("sm") {
        font-size: $font-size-base;
    }
}

.playlist__close-btn {
    background: none;
    border: none;
    color: $text-secondary;
    cursor: pointer;
    padding: ($content-padding * 0.375);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: $border-radius;
    transition: all $transition-base;
    min-width: 44px;
    min-height: 44px;

    &:hover {
        color: $text-primary;
        background-color: $overlay-light;
        transform: scale(1.05);
    }

    &:active {
        transform: scale(0.95);
    }

    @include respond-to("sm") {
        min-width: 40px;
        min-height: 40px;
        padding: ($content-padding * 0.25);
    }
}



.playlist__content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.playlist__loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: $content-padding;
    color: $text-secondary;
    padding: ($content-padding * 2);

    @include respond-to("sm") {
        padding: $content-padding;
        gap: ($content-padding * 0.75);
    }
}

.loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid $bg-tertiary;
    border-top: 3px solid $accent-green;
    border-radius: 50%;
    animation: spin 1s linear infinite;

    @include respond-to("sm") {
        width: 28px;
        height: 28px;
        border-width: 2px;
    }
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}

.loading-text {
    font-size: $font-size-base;
    font-weight: $font-weight-medium;

    @include respond-to("sm") {
        font-size: $font-size-sm;
    }
}

.playlist__song-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    flex: 1;

    // 自定义滚动条
    &::-webkit-scrollbar {
        width: 8px;
    }

    &::-webkit-scrollbar-track {
        background: $bg-primary;
    }

    &::-webkit-scrollbar-thumb {
        background: $overlay-medium;
        border-radius: 4px;
        transition: background-color $transition-base;

        &:hover {
            background: $overlay-light;
        }
    }

    @include respond-to("sm") {
        &::-webkit-scrollbar {
            width: 6px;
        }
    }
}

.playlist__song-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: ($content-padding * 0.75) $content-padding;
    cursor: pointer;
    border-bottom: 1px solid $bg-primary;
    transition: all $transition-base;
    position: relative;
    min-height: 60px;

    &:hover {
        background-color: $overlay-light;

        .playlist__remove-btn {
            opacity: 1;
            visibility: visible;
        }
    }

    &:active {
        background-color: $overlay-medium;
        transform: scale(0.98);
    }

    &.is-playing {
        background-color: $bg-tertiary;
        color: $accent-green;
        border-left: 3px solid $accent-green;
        padding-left: calc(#{$content-padding} - 3px);

        .playlist__song-title {
            color: $accent-green;
            font-weight: $font-weight-medium;
        }

        &::before {
            content: '';
            position: absolute;
            left: ($content-padding * 0.5);
            top: 50%;
            transform: translateY(-50%);
            width: 4px;
            height: 20px;
            background: linear-gradient(to bottom, $accent-green, $accent-hover);
            border-radius: 2px;
            animation: pulse $transition-slow infinite alternate;
        }
    }

    @include respond-to("sm") {
        padding: ($content-padding * 0.5) ($content-padding * 0.75);
        min-height: 52px;

        &.is-playing {
            padding-left: calc(#{$content-padding * 0.75} - 3px);
        }
    }
}

@keyframes pulse {
    0% {
        opacity: 0.6;
    }

    100% {
        opacity: 1;
    }
}

.playlist__song-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
    margin-right: $content-padding;

    @include respond-to("sm") {
        margin-right: ($content-padding * 0.75);
    }
}

.playlist__song-title {
    font-weight: $font-weight-medium;
    font-size: $font-size-base;
    color: $text-primary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 4px;

    @include respond-to("sm") {
        font-size: $font-size-sm;
    }
}

.playlist__song-artist {
    font-size: $font-size-sm;
    color: $text-secondary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    @include respond-to("sm") {
        font-size: $font-size-xs;
    }
}

.playlist__remove-btn {
    background: none;
    border: none;
    color: $text-secondary;
    cursor: pointer;
    padding: ($content-padding * 0.375);
    opacity: 0;
    visibility: hidden;
    transition: all $transition-base;
    border-radius: $border-radius;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    min-height: 32px;
    flex-shrink: 0;

    &:hover {
        color: $danger;
        background-color: rgba($danger, 0.1);
        transform: scale(1.1);
    }

    &:active {
        transform: scale(0.9);
    }

    @include respond-to("sm") {
        opacity: 1;
        visibility: visible;
        min-width: 28px;
        min-height: 28px;
        padding: ($content-padding * 0.25);
    }
}



.playlist__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    padding: ($content-padding * 2);
    text-align: center;
    color: $text-secondary;

    @include respond-to("sm") {
        padding: $content-padding;
    }
}



.playlist__empty-text {
    font-size: $font-size-lg;
    font-weight: $font-weight-medium;
    color: $text-secondary;
    margin: 0 0 ($content-padding * 0.5) 0;

    @include respond-to("sm") {
        font-size: $font-size-base;
    }
}

.playlist__empty-hint {
    font-size: $font-size-sm;
    color: $text-disabled;
    margin: 0;

    @include respond-to("sm") {
        font-size: $font-size-xs;
    }
}

// 加载状态下的动画
.playlist.is-loading {
    .playlist__header {
        opacity: 0.8;
    }
}

// 空状态下的动画
.playlist.is-empty {
    .playlist__empty {
        animation: fadeInUp $transition-slow ease-out;
    }
}

@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

// 高对比度模式支持
@media (prefers-contrast: high) {
    .playlist {
        border: 2px solid $text-primary;
    }

    .playlist__song-item {
        border-bottom: 1px solid $text-secondary;

        &.is-playing {
            border-left-width: 4px;
        }
    }
}

// 减少动画模式支持
@media (prefers-reduced-motion: reduce) {

    .playlist,
    .playlist__song-item,
    .playlist__remove-btn,
    .playlist__close-btn,
    .loading-spinner {
        animation: none;
        transition: none;
    }

    .playlist__song-item {

        &:hover,
        &:active {
            transform: none;
        }
    }

    .playlist__close-btn,
    .playlist__remove-btn {

        &:hover,
        &:active {
            transform: none;
        }
    }
}
</style>