<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { usePlayerStore } from '../../store/player'
import type { OnlineSongInfo } from '../../store/player'
import { useUiStore } from '../../store/ui'
import FAIcon from './FAIcon.vue'
import CustomButton from '../custom/CustomButton.vue'
import type { Song } from '@/types'

const playerStore = usePlayerStore()
const uiStore = useUiStore()
const songListRef = ref<HTMLElement | null>(null)

const songs = ref<Song[]>([])
const isLoading = ref(false)

interface DisplaySong {
	id: string
	title: string
	artist: string
	isOnline: boolean
	onlineIndex: number
	onlineInfo: OnlineSongInfo | null
	localSong: Song | null
}

const displaySongs = computed<DisplaySong[]>(() => {
	if (playerStore.isOnlineSong) {
		return playerStore.onlinePlayQueue.map((info, i) => ({
			id: info.songMid,
			title: info.songName,
			artist: info.singer,
			isOnline: true,
			onlineIndex: i,
			onlineInfo: info,
			localSong: null,
		}))
	}
	return songs.value.map(s => ({
		id: s.id,
		title: s.title,
		artist: s.artist,
		isOnline: false,
		onlineIndex: -1,
		onlineInfo: null,
		localSong: s,
	}))
})

const currentId = computed(() => {
	if (playerStore.isOnlineSong) return playerStore.onlineSongMid
	return playerStore.currentSong?.id || ''
})

async function fetchSongsDetails(ids: string[]) {
	if (!ids || ids.length === 0) {
		songs.value = []
		return
	}
	isLoading.value = true
	try {
		const songDetails: Song[] = []
		for (const id of ids) {
			const result = await window.electronAPI.getSongById(id)
			if (result.success && result.song) songDetails.push(result.song)
		}
		songs.value = songDetails
	} catch (error) {
		console.error('Error fetching playlist songs:', error)
		songs.value = []
	} finally {
		isLoading.value = false
		await nextTick()
		scrollToCurrentSong()
	}
}

function playDisplaySong(item: DisplaySong) {
	if (item.isOnline && item.onlineInfo) {
		playerStore.playOnlineSong(item.onlineInfo, {
			queue: playerStore.onlinePlayQueue,
			startIndex: item.onlineIndex,
		})
	} else if (item.localSong) {
		playerStore.playSong(item.localSong)
	}
}

function handleRemove(item: DisplaySong) {
	if (item.isOnline) return
	const index = playerStore.playlist.indexOf(item.id)
	if (index > -1) playerStore.removeFromPlaylist(index)
}

async function scrollToCurrentSong() {
	await nextTick()
	if (!uiStore.isPlaylistVisible || !currentId.value || !songListRef.value) return
	const songEl = songListRef.value.querySelector(`[data-song-id="${currentId.value}"]`) as HTMLElement | null
	if (songEl) songEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

onMounted(() => fetchSongsDetails(playerStore.playlist))

watch(
	() => playerStore.playlist,
	(newIds) => fetchSongsDetails(newIds),
	{ deep: true }
)
watch(
	() => uiStore.isPlaylistVisible,
	(isVisible) => {
		if (isVisible) scrollToCurrentSong()
	}
)
watch(
	() => playerStore.currentSong,
	() => {
		if (uiStore.isPlaylistVisible) scrollToCurrentSong()
	},
	{ deep: true }
)
watch(
	() => playerStore.onlineSongMid,
	() => {
		if (uiStore.isPlaylistVisible) scrollToCurrentSong()
	}
)
</script>

<template>
	<div
		:class="[
			'flex flex-col h-full bg-surface-elevated text-content-base rounded shadow-custom overflow-hidden border border-line-base select-none slide-in',
			'max-md:rounded-none max-md:shadow-none max-md:border-none max-md:border-l max-md:border-line-base',
			!playerStore.isOnlineSong && isLoading ? 'opacity-80' : '',
		]">
		<div
			class="flex justify-between items-center p-4 bg-surface-overlay border-b border-line-base shrink-0 max-md:p-3">
			<h3 class="m-0 text-lg font-medium text-content-base max-md:text-base">播放列表</h3>
			<CustomButton type="icon-only" icon="times" @click="uiStore.togglePlaylist()"
				:customClass="'min-w-[44px] min-h-[44px] max-md:min-w-[40px] max-md:min-h-[40px]'" aria-label="关闭播放列表" />
		</div>

		<div class="flex-1 flex flex-col overflow-hidden">
			<div v-if="!playerStore.isOnlineSong && isLoading"
				class="flex flex-col items-center justify-center flex-1 gap-4 text-content-secondary p-8 max-md:gap-3 max-md:p-4">
				<div class="w-8 h-8 border-3 border-surface-overlay border-t-accent-green rounded-full spin max-md:w-7 max-md:h-7 max-md:border-2"></div>
				<span class="text-sm font-medium max-md:text-xs">正在加载...</span>
			</div>

			<ul v-else-if="displaySongs.length > 0" ref="songListRef"
				class="list-none m-0 p-0 overflow-y-auto flex-1 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-surface-base [&::-webkit-scrollbar-thumb]:bg-overlay-medium [&::-webkit-scrollbar-thumb]:rounded-[4px] [&::-webkit-scrollbar-thumb]:transition-colors [&::-webkit-scrollbar-thumb]:duration-200 [&::-webkit-scrollbar-thumb:hover]:bg-overlay-light max-md:[&::-webkit-scrollbar]:w-[6px]">
				<li v-for="item in displaySongs" :key="item.id" :data-song-id="item.id" @click="playDisplaySong(item)"
					:class="[
						'group flex justify-between items-center px-4 py-3 cursor-pointer border-b border-surface-base transition-all duration-200 relative min-h-[60px]',
						'hover:bg-overlay-light active:bg-overlay-medium active:scale-[0.98]',
						currentId === item.id
							? 'bg-surface-overlay text-accent-green border-l-3 border-l-accent-green pl-[13px]'
							: '',
						'max-md:px-3 max-md:py-2 max-md:min-h-[52px]',
						currentId === item.id ? 'max-md:pl-[9px]' : '',
					]">
					<span v-if="currentId === item.id"
						class="absolute left-2 top-1/2 -translate-y-1/2 w-1 h-5 bg-gradient-to-b from-accent-green to-accent-green-hover rounded-[2px] playing-pulse">
					</span>
					<div class="flex flex-col min-w-0 flex-1 mr-4 max-md:mr-3">
						<span
							:class="[
								'font-medium text-sm truncate mb-1 max-md:text-xs',
								currentId === item.id ? 'text-accent-green font-medium' : 'text-content-base',
							]">{{ item.title }}</span>
						<span class="text-xs text-content-secondary truncate max-md:text-2xs">{{ item.artist }}</span>
					</div>
					<CustomButton v-if="!item.isOnline" type="icon-only" icon="trash" size="small"
						@click.stop="handleRemove(item)"
						:customClass="[
							'min-w-8 min-h-8 shrink-0 transition-all duration-200',
							'max-md:min-w-7 max-md:min-h-7 max-md:opacity-100 max-md:visible',
							'opacity-0 invisible group-hover:opacity-100 group-hover:visible',
						].join(' ')" aria-label="从播放列表移除" />
				</li>
			</ul>

			<div v-else
				class="flex flex-col items-center justify-center flex-1 p-8 text-center text-content-secondary max-md:p-4">
				<FAIcon name="music" size="xl" color="secondary" />
				<p class="text-lg font-medium m-0 mb-2 max-md:text-base">播放列表为空</p>
				<p class="text-sm text-content-disabled m-0 max-md:text-xs">添加一些歌曲开始播放</p>
			</div>
		</div>
	</div>
</template>
