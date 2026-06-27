/** 全局类型声明 */

// Pinia store 类型
declare module 'pinia' {
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface PiniaCustomProperties {
		// 如需扩展 Pinia 属性可在此声明
	}
}

// PlayerBar 等组件在 window 上挂载的音频相关全局变量
declare global {
	interface Window {
		sourceNode?: AudioBufferSourceNode | null
		audioContext?: AudioContext | null
		decodedAudioBuffer?: AudioBuffer | null
		isAudioPlaying?: boolean
		audioStartTime?: number
		currentlyPlayingNode?: AudioBufferSourceNode | null
		audioFileLoadInterval?: ReturnType<typeof setInterval> | null
		audioDuration?: number
		seekToTime?: number
		isSeeking?: boolean
		gainNode?: GainNode | null
		songStartTimeInAc?: number
		songStartOffset?: number
		isPositionLocked?: boolean
		positionLockTimeout?: ReturnType<typeof setTimeout> | null
		isSeekingFromTimer?: boolean
		_onlineAudio?: HTMLAudioElement | null
		_onlineCoverUrl?: string
		webkitAudioContext?: typeof AudioContext
	}
}

export {}
