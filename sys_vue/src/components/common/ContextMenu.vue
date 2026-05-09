<script setup>
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { usePlayerStore } from '../../store/player';
import { usePlaylistStore } from '../../store/playlist';
import FAIcon from './FAIcon.vue';

const props = defineProps({ show: Boolean, x: Number, y: Number, song: Object, menuType: { type: String, default: 'main' } });
const emit = defineEmits(['close', 'action']);
const playerStore = usePlayerStore();
const playlistStore = usePlaylistStore();

const showPlaylistSubmenu = ref(false);
const menuRef = ref(null);

const menuStyle = computed(() => {
  if (!props.x || !props.y) return { display: 'none' };
  let x = props.x, y = props.y;
  if (menuRef.value) {
    const rect = menuRef.value.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight, pb = 90, av = vh - pb;
    if (x + rect.width > vw) x = vw - rect.width - 5;
    if (y + rect.height > av) y = av - rect.height - 5;
  }
  return { left: `${x}px`, top: `${y}px` };
});

const isCurrentSongPlaying = computed(() => playerStore.currentSong && props.song && playerStore.currentSong.id === props.song.id && playerStore.playing);

const availableMenuItems = computed(() => {
  const base = [
    { key: 'play-toggle', label: isCurrentSongPlaying.value ? '暂停' : '播放', icon: isCurrentSongPlaying.value ? 'pause' : 'play', action: 'play-toggle' },
    { key: 'add-to-playlist', label: '添加到播放列表', icon: 'plus-square-o', action: 'add-to-playlist' },
    { key: 'show-lyrics', label: '显示歌词', icon: 'file-text-o', action: 'show-lyrics' },
    { key: 'song-info', label: '歌曲信息', icon: 'info-circle', action: 'song-info' },
    { key: 'show-in-folder', label: '显示文件位置', icon: 'folder-open', action: 'show-in-folder' },
    { key: 'copy-info', label: '复制歌曲信息', icon: 'copy', action: 'copy-info' },
  ];
  const typeSpecific = {
    main: [
      { key: 'add-to-custom-playlist', label: '添加到歌单', icon: 'plus', action: 'add-to-custom-playlist', hasSubmenu: true },
      { key: 'edit-tags', label: '编辑标签', icon: 'edit', action: 'edit-tags' },
      { key: 'remove-from-list', label: '从列表中删除', icon: 'trash', action: 'remove-from-list', class: 'delete' },
    ],
    playlist: [
      { key: 'add-to-custom-playlist', label: '添加到歌单', icon: 'plus', action: 'add-to-custom-playlist', hasSubmenu: true },
      { key: 'remove-from-list', label: '从歌单移除', icon: 'trash', action: 'remove-from-list', class: 'delete' },
    ],
    metadata: [
      { key: 'edit-tags', label: '编辑标签', icon: 'edit', action: 'edit-tags' },
      { key: 'remove-from-list', label: '从列表中删除', icon: 'trash', action: 'remove-from-list', class: 'delete' },
    ],
  };
  return [...base, ...(typeSpecific[props.menuType] || [])];
});

const handleMenuAction = (action) => { emit('action', { action, song: props.song }); emit('close'); };

const handleAddToPlaylist = async (playlist) => {
  if (props.song && playlist) {
    const songIds = Array.isArray(props.song.id) ? props.song.id : [props.song.id];
    await window.electronAPI.addSongsToPlaylist(playlist.id, songIds);
  }
  emit('close');
};

const handleDocumentClick = (event) => { if (props.show && menuRef.value && !menuRef.value.contains(event.target)) emit('close'); };

watch(() => props.show, (v) => { if (!v) showPlaylistSubmenu.value = false; });

onMounted(async () => {
  document.addEventListener('click', handleDocumentClick);
  if (props.show && menuRef.value) await nextTick();
});
onUnmounted(() => { document.removeEventListener('click', handleDocumentClick); });
</script>

<template>
  <div v-if="show" ref="menuRef"
    class="fixed z-[250] min-w-[200px] max-w-[250px] bg-surface-overlay rounded shadow-custom-hover overflow-hidden fade-in-up select-none border border-surface-overlay
           max-md:min-w-[180px] max-md:max-w-[220px]"
    :style="menuStyle" @click.stop>
    <div v-if="props.song" class="p-3 bg-surface-elevated border-b border-surface-overlay">
      <div class="overflow-hidden">
        <div class="font-medium text-sm text-content-base truncate">{{ props.song.title || '未知歌曲' }}</div>
        <div class="text-xs text-content-secondary mt-1 truncate">{{ props.song.artist || '未知艺术家' }}</div>
      </div>
    </div>

    <div class="py-1">
      <template v-for="item in availableMenuItems" :key="item.key">
        <div v-if="item.hasSubmenu" class="border-b-0">
          <div class="flex items-center justify-between px-4 py-3 cursor-pointer text-sm text-content-base transition-all duration-200 hover:bg-overlay-light active:bg-overlay-medium"
            @click="showPlaylistSubmenu = !showPlaylistSubmenu; if (showPlaylistSubmenu && playlistStore.playlists.length === 0) playlistStore.loadPlaylists()">
            <FAIcon :name="item.icon" size="medium" color="primary" class="mr-3 shrink-0" />
            <span class="flex-1">{{ item.label }}</span>
            <FAIcon :name="showPlaylistSubmenu ? 'chevron-up' : 'chevron-down'" size="small" color="secondary" class="ml-auto" />
          </div>

          <div v-if="showPlaylistSubmenu" class="bg-surface-base border-y border-surface-elevated">
            <div v-if="playlistStore.loading" class="px-4 py-2 pl-8 text-xs text-content-disabled italic cursor-default">加载中...</div>
            <div v-else-if="playlistStore.error" class="px-4 py-2 pl-8 text-xs text-accent-danger italic cursor-default">{{ playlistStore.error }}</div>
            <div v-else-if="playlistStore.playlists.length === 0" class="px-4 py-2 pl-8 text-xs text-content-disabled italic cursor-default">暂无歌单</div>
            <template v-else>
              <div v-for="pl in playlistStore.playlists" :key="pl.id"
                class="px-4 py-2 pl-8 text-xs flex items-center cursor-pointer transition-colors duration-200 hover:bg-overlay-light"
                @click.stop="handleAddToPlaylist(pl)">
                <FAIcon name="music" size="small" color="primary" class="mr-2 shrink-0" />
                <span>{{ pl.name }}</span>
              </div>
            </template>
            <div class="px-4 py-2 pl-8 text-xs flex items-center cursor-pointer border-t border-surface-overlay text-accent-green hover:bg-overlay-light"
              @click.stop="playlistStore.openCreatePlaylistDialog(); emit('close')">
              <FAIcon name="plus-circle" size="small" color="accent" class="mr-2 shrink-0" />
              <span>创建新歌单</span>
            </div>
          </div>
        </div>

        <div v-else @click="handleMenuAction(item.action)"
          :class="[
            'flex items-center px-4 py-3 cursor-pointer text-sm transition-all duration-200',
            item.class === 'delete' ? 'text-accent-danger border-t border-surface-overlay mt-1' : 'text-content-base',
            'hover:bg-overlay-light active:bg-overlay-medium',
          ]">
          <FAIcon :name="item.icon" size="medium" :color="item.class === 'delete' ? 'danger' : 'primary'" class="mr-3 shrink-0" />
          <span>{{ item.label }}</span>
        </div>
      </template>
    </div>
  </div>
</template>
