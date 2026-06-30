/**
 * 音乐平台注册配置
 * 在此注册的平台将自动出现在侧边栏和设置"平台管理"页面
 */

export interface PlatformNavItem {
  /** 导航项标识 */
  id: string
  /** 显示名称 */
  label: string
  /** FontAwesome 图标名（不含前缀） */
  icon: string
  /** 对应的视图名，用于 uiStore.setView() */
  view: string
}

export interface MusicPlatform {
  /** 平台唯一标识 */
  id: string
  /** 平台显示名称 */
  name: string
  /** FontAwesome 品牌图标名 */
  icon: string
  /** 是否需要登录才能使用该平台功能 */
  requireLogin: boolean
  /** 该平台下的导航项列表 */
  navItems: PlatformNavItem[]
}

/** 所有已注册的音乐平台 */
export const musicPlatforms: MusicPlatform[] = [
  {
    id: 'qqmusic',
    name: 'QQ音乐',
    icon: 'qq',
    requireLogin: true,
    navItems: [
      { id: 'liked', label: '我喜欢的音乐', icon: 'heart', view: 'qq-liked' },
      { id: 'playlists', label: '创建的歌单', icon: 'list', view: 'qq-playlists' },
    ],
  },
  // 新增平台只需在此注册：
  // {
  //   id: 'netease',
  //   name: '网易云音乐',
  //   icon: 'music',
  //   requireLogin: true,
  //   navItems: [
  //     { id: 'liked', label: '我喜欢的音乐', icon: 'heart', view: 'netease-liked' },
  //     { id: 'daily', label: '每日推荐', icon: 'calendar', view: 'netease-daily' },
  //   ],
  // },
]

/** 平台可见性存储键名前缀 */
export const PLATFORM_VISIBILITY_PREFIX = 'platform_visibility_'
