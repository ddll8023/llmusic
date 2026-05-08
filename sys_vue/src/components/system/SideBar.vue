<script setup>
import { ref, computed, onMounted } from 'vue';
import { useUiStore } from '../../store/ui';
import { usePlaylistStore } from '../../store/playlist';
import { useMediaStore } from '../../store/media';
import FAIcon from '../common/FAIcon.vue';
import CustomButton from '../custom/CustomButton.vue';

const uiStore = useUiStore();
const playlistStore = usePlaylistStore();
const mediaStore = useMediaStore();

const isCollapsed = computed(() => uiStore.isSidebarCollapsed);

// 计算收缩/展开按钮图标
const collapseIcon = computed(() => isCollapsed.value ? 'chevron-right' : 'chevron-left');

// 加载歌单列表和音乐库
onMounted(async () => {
    await playlistStore.loadPlaylists();
    await mediaStore.loadLibraries();
});

const handleSetLibrary = (libraryId) => {
    mediaStore.setActiveLibrary(libraryId);
    uiStore.setView('main');
};
</script>

<template>
    <div class="sidebar" :class="{ 'sidebar--collapsed': isCollapsed }">
        <div class="sidebar__logo">
            <h1 v-if="!isCollapsed" class="sidebar__logo-title">LLMusic</h1>
            <div class="sidebar__controls">
                <CustomButton type="icon-only" size="small" :icon="collapseIcon"
                    :title="isCollapsed ? '展开侧边栏' : '收缩侧边栏'" circle @click="uiStore.toggleSidebarCollapse()" />
            </div>
        </div>

        <div class="sidebar__section">
            <div class="sidebar__section-title"><span class="sidebar__text">在线音乐</span></div>
            <div class="sidebar__menu-item"
                :class="{ 'is-active': uiStore.currentView === 'discover' }"
                @click="uiStore.setView('discover')">
                <FAIcon name="compass" size="medium" color="primary" :clickable="true" />
                <span class="sidebar__text">发现音乐</span>
            </div>
            <div class="sidebar__menu-item sidebar__menu-item--disabled">
                <FAIcon name="signal" size="medium" color="secondary" />
                <span class="sidebar__text">私人FM</span>
            </div>
        </div>

        <div class="sidebar__section">
            <div class="sidebar__section-title"><span class="sidebar__text">我的音乐</span></div>
            <div class="sidebar__menu-item"
                :class="{ 'is-active': uiStore.currentView === 'main' && mediaStore.activeLibraryId === null }"
                @click="handleSetLibrary(null)">
                <FAIcon name="folder" size="medium" color="primary" :clickable="true" />
                <span class="sidebar__text">所有音乐</span>
            </div>
            <div v-for="lib in mediaStore.libraries" :key="lib.id" class="sidebar__menu-item"
                :class="{ 'is-active': uiStore.currentView === 'main' && mediaStore.activeLibraryId === lib.id }"
                @click="handleSetLibrary(lib.id)">
                <FAIcon name="music" size="medium" color="primary" :clickable="true" />
                <span class="sidebar__text">{{ lib.name }}</span>
            </div>
            <div class="sidebar__menu-item sidebar__menu-item--disabled">
                <FAIcon name="clock-o" size="medium" color="secondary" />
                <span class="sidebar__text">最近播放</span>
            </div>
            <div class="sidebar__menu-item sidebar__menu-item--disabled">
                <FAIcon name="heart" size="medium" color="secondary" />
                <span class="sidebar__text">我的收藏</span>
            </div>
        </div>

        <div class="sidebar__section">
            <div class="sidebar__section-title">
                <span class="sidebar__text">创建的歌单</span>
                <CustomButton v-if="!isCollapsed" type="icon-only" size="small" icon="plus" title="创建歌单" circle
                    @click="playlistStore.openCreatePlaylistDialog()" />
            </div>

            <!-- 歌单加载中 -->
            <div v-if="playlistStore.loading" class="sidebar__playlist-loading">
                <span v-if="!isCollapsed" class="sidebar__text">加载中...</span>
            </div>

            <!-- 歌单列表 -->
            <template v-else>
                <!-- 无歌单提示 -->
                <div v-if="playlistStore.playlists.length === 0" class="sidebar__no-playlists">
                    <span v-if="!isCollapsed" class="sidebar__text">暂无歌单，点击"+"创建</span>
                </div>

                <!-- 歌单项目 -->
                <div v-for="playlist in playlistStore.playlists" :key="playlist.id"
                    class="sidebar__menu-item sidebar__playlist-item"
                    :class="{ 'is-active': playlistStore.currentPlaylistId === playlist.id }"
                    @click="playlistStore.loadPlaylistById(playlist.id); uiStore.setView('playlist')">
                    <FAIcon name="list" size="medium" color="primary" :clickable="true" />
                    <span class="sidebar__playlist-name" :title="playlist.name">{{ playlist.name }}</span>
                    <!-- 编辑按钮，只在鼠标悬浮时显示 -->
                    <div class="sidebar__playlist-actions" v-if="!isCollapsed" @click.stop>
                        <CustomButton type="icon-only" size="small" icon="edit" title="编辑歌单" circle
                            @click="playlistStore.openEditPlaylistDialog(playlist)" />
                        <CustomButton type="icon-only" size="small" icon="play" title="播放歌单" circle
                            @click="playlistStore.playPlaylist(playlist.id)" />
                    </div>
                </div>
            </template>
        </div>

        <div class="sidebar__spacer"></div>

        <!-- 元数据管理按钮 -->
        <div class="sidebar__menu-item sidebar__bottom-item"
            :class="{ 'is-active': uiStore.currentView === 'metadata' }" @click="uiStore.setView('metadata')">
            <FAIcon name="edit" size="medium" color="primary" :clickable="true" />
            <span class="sidebar__text">元数据管理</span>
        </div>

        <!-- 设置按钮 -->
        <div class="sidebar__menu-item sidebar__bottom-item"
            :class="{ 'is-active': uiStore.currentView === 'settings' }" @click="uiStore.setView('settings')">
            <FAIcon name="cog" size="medium" color="primary" :clickable="true" />
            <span class="sidebar__text">设置</span>
        </div>
    </div>
</template>

<style lang="scss" scoped>
// 样式变量已通过 Vite 自动注入

// ========== 动画关键帧 ==========

// 简化入场动画（仅 opacity，无 transform 避免重排）
@keyframes sidebarFadeIn {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

// 活跃指示器滑入动画
@keyframes activeIndicatorSlide {
    from {
        transform: translateY(-50%) scaleX(0);
    }
    to {
        transform: translateY(-50%) scaleX(1);
    }
}

// Logo 淡入动画
@keyframes logoFadeIn {
    from {
        opacity: 0;
        transform: translateX(-4px);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}

.sidebar {
    width: var(--sidebar-width, 250px);
    background-color: $bg-secondary;
    color: $text-secondary;
    padding: ($content-padding * 1.5) ($content-padding * 1.25) ($content-padding * 1.5) ($content-padding * 1.5);
    display: flex;
    flex-direction: column;
    transition: width $transition-slow;
    overflow: hidden;
    flex-shrink: 0;
    box-sizing: border-box;
    flex: 1;
    min-height: 0;
    font-family: $font-family-base;
    z-index: $z-sidebar;

    // 收缩状态
    &--collapsed {
        padding: ($content-padding * 1.5) ($content-padding * 0.5);
    }
}

// 文字过渡效果（仅 opacity）
.sidebar {

    .sidebar__text,
    .sidebar__logo-title,
    .sidebar__section-title,
    .sidebar__playlist-name {
        transition: opacity $transition-base;
    }
}

.sidebar--collapsed {

    .sidebar__text,
    .sidebar__logo-title,
    .sidebar__section-title,
    .sidebar__playlist-name {
        display: none;
    }
}

// Logo 区域
.sidebar__logo {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: ($content-padding * 1.5);
}

.sidebar__logo-title {
    font-size: $font-size-xl;
    color: $text-primary;
    white-space: nowrap;
    overflow: hidden;
    font-weight: $font-weight-bold;
    font-family: $font-family-base;
    margin: 0;
    line-height: $line-height-base;
    animation: logoFadeIn 0.3s cubic-bezier(0.25, 1, 0.5, 1) forwards;

    .sidebar--collapsed & {
        animation: none;
        opacity: 0;
    }
}

// 菜单分区
.sidebar__section {
    margin-bottom: ($content-padding * 1.5);
}

.sidebar__section-title {
    font-size: $font-size-xs;
    font-weight: $font-weight-bold;
    font-family: $font-family-base;
    text-transform: uppercase;
    margin-bottom: ($content-padding * 0.5);
    white-space: nowrap;
    overflow: hidden;
    color: $text-primary;
    padding-left: ($content-padding * 0.5);
    display: flex;
    align-items: center;
    justify-content: space-between;
    letter-spacing: 0.5px;
    line-height: $line-height-base;
}

// 收缩状态下的分区标题
.sidebar--collapsed .sidebar__section-title {
    text-align: center;
    padding: 0;
    margin-bottom: ($content-padding * 0.75);

    &::after {
        content: '';
        display: block;
        width: 24px;
        height: 2px;
        background: linear-gradient(90deg, transparent, $text-secondary, transparent);
        margin: 0 auto;
        border-radius: $border-radius;
    }
}

// 菜单区域入场动画（简化为淡入）
.sidebar__section {
    &:nth-child(2) .sidebar__menu-item {
        animation: sidebarFadeIn 0.2s ease-out backwards;
    }
    &:nth-child(3) .sidebar__menu-item {
        animation: sidebarFadeIn 0.2s ease-out backwards;
        animation-delay: 0.03s;
    }
    &:nth-child(4) .sidebar__menu-item {
        animation: sidebarFadeIn 0.2s ease-out backwards;
        animation-delay: 0.06s;
    }
}

// 底部菜单项入场动画
.sidebar__bottom-item {
    animation: sidebarFadeIn 0.2s ease-out backwards;
    animation-delay: 0.09s;
}

// 歌单项入场（交错淡入）
.sidebar__playlist-item {
    animation: sidebarFadeIn 0.2s ease-out backwards;
}

// 菜单项基础样式
.sidebar__menu-item {
    display: flex;
    align-items: center;
    padding: ($content-padding * 0.625) ($content-padding * 0.5);
    border-radius: $border-radius;
    cursor: pointer;
    // 优化：只过渡必要的属性，避免 box-shadow 触发重排
    transition: background-color $transition-fast, color $transition-fast, transform 0.15s ease-out;
    white-space: nowrap;
    overflow: hidden;
    font-size: $font-size-base;
    font-family: $font-family-base;
    position: relative;
    line-height: $line-height-base;

    // 收缩状态下的菜单项
    .sidebar--collapsed & {
        justify-content: center;
        padding: ($content-padding * 0.625) ($content-padding * 0.25);
    }

    // FAIcon 样式 - 图标过渡优化
    .fa {
        margin-right: $content-padding;
        flex-shrink: 0;
        // 只过渡 transform 和 color，避免其他属性触发重排
        transition: transform 0.15s ease-out, color $transition-fast;

        .sidebar--collapsed & {
            margin-right: 0;
        }
    }

    // 交互状态 - 简化 hover 效果
    &:hover {
        background-color: $bg-tertiary;
        color: $text-primary;

        .fa {
            transform: scale(1.08);
        }
    }

    &:active {
        transform: scale(0.98);
        background-color: $bg-tertiary-hover;

        .fa {
            transform: scale(0.96);
        }
    }

    &:focus {
        outline: 2px solid $accent-green;
        outline-offset: 2px;
    }

    &.is-active {
        background-color: $bg-tertiary;
        color: $text-primary;

        // 活跃状态图标平滑过渡到绿色
        .fa {
            color: $accent-green;
        }

        &::before {
            content: '';
            position: absolute;
            left: 0;
            top: 50%;
            width: 3px;
            height: 60%;
            background-color: $accent-green;
            border-radius: 0 $border-radius $border-radius 0;
            animation: activeIndicatorSlide 0.2s ease-out forwards;
        }
    }

    &--disabled {
        opacity: 0.6;
        cursor: not-allowed;

        &:hover {
            background-color: transparent;
            transform: none;
            color: $text-secondary;

            .fa {
                transform: none;
            }
        }
    }
}

// 侧边栏控制按钮容器
.sidebar__controls {
    display: flex;
    gap: ($content-padding * 0.25);
    align-items: center;
}

// 间距器
.sidebar__spacer {
    flex-grow: 1;
    min-height: ($content-padding * 1.25);
}

// 底部设置项
.sidebar__bottom-item {
    margin-top: ($content-padding * 0.5);
}

// 歌单项目样式
.sidebar__playlist-item {
    position: relative;
    padding-right: ($content-padding * 1.875);

    // 悬停显示操作按钮
    &:hover .sidebar__playlist-actions {
        opacity: 1;
        transform: translateX(0);
    }
}

.sidebar__playlist-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: $font-family-base;
    line-height: $line-height-base;
}

.sidebar__playlist-actions {
    position: absolute;
    right: ($content-padding * 0.5);
    display: flex;
    gap: ($content-padding * 0.25);
    align-items: center;
    opacity: 0;
    transform: translateX(4px);
    transition: opacity $transition-fast, transform $transition-fast;
}

// 加载中和无歌单提示
.sidebar__playlist-loading,
.sidebar__no-playlists {
    font-size: $font-size-sm;
    font-family: $font-family-base;
    padding: ($content-padding * 0.5);
    color: $text-disabled;
    text-align: center;
    font-style: italic;
    line-height: $line-height-base;
}

// 响应式适配
@include respond-to("md") {
    .sidebar {
        padding: ($content-padding * 1.25);

        .sidebar__menu-item {
            padding: ($content-padding * 0.5) ($content-padding * 0.375);
            font-size: $font-size-sm;
        }

        .sidebar__section {
            margin-bottom: $content-padding;
        }
    }
}

@include respond-to("sm") {
    .sidebar {
        padding: $content-padding;

        .sidebar__menu-item,
        .sidebar__bottom-item {
            padding: ($content-padding * 0.5) ($content-padding * 0.375);
            font-size: $font-size-sm;
        }

        .sidebar__logo {
            margin-bottom: $content-padding;
        }

        .sidebar__logo-title {
            font-size: $font-size-lg;
        }

        .sidebar__section-title {
            font-size: $font-size-xs;
            margin-bottom: ($content-padding * 0.375);
        }

        .sidebar__section {
            margin-bottom: $content-padding;
        }

        .sidebar__collapse-btn {
            width: 28px;
            height: 28px;
            font-size: $font-size-sm;
        }

        .sidebar__add-btn {
            width: 18px;
            height: 18px;
            font-size: $font-size-sm;
        }
    }
}

// 高对比度模式支持
@media (prefers-contrast: high) {
    .sidebar {
        border-right: 2px solid $text-primary;
    }

    .sidebar__menu-item {
        &.is-active {
            border: 1px solid $text-primary;

            &::before {
                width: 4px;
                background-color: $text-primary;
            }
        }

        &:focus {
            outline: 3px solid $text-primary;
            outline-offset: 1px;
        }
    }

    .sidebar__collapse-btn,
    .sidebar__add-btn,
    .sidebar__action-btn {
        &:focus {
            outline: 3px solid $text-primary;
            outline-offset: 1px;
        }
    }
}

// 减少动画模式支持
@media (prefers-reduced-motion: reduce) {

    .sidebar,
    .sidebar__menu-item,
    .sidebar__add-btn,
    .sidebar__action-btn,
    .sidebar__collapse-btn,
    .sidebar__text,
    .sidebar__logo-title,
    .sidebar__section-title,
    .sidebar__playlist-name,
    .sidebar__playlist-item,
    .sidebar__bottom-item {
        transition: none !important;
        animation: none !important;
    }

    .sidebar__menu-item:hover,
    .sidebar__add-btn:hover,
    .sidebar__action-btn:hover,
    .sidebar__collapse-btn:hover {
        transform: none !important;
    }

    .fa.icon--clickable:active,
    .sidebar__menu-item .fa {
        transform: none !important;
    }
}
</style>