import { CHANNELS } from "../../constants/ipcChannels"
import type { IpcHandlerModule } from "../../types"
import {
	cleanupDesktopLyric,
	getDesktopLyricConfig,
	getNowPlayingSnapshot,
	moveDesktopLyricWindow,
	saveDesktopLyricState,
	setDesktopLyricEnabled,
	setUnlockButtonBounds,
	updateDesktopLyricConfig,
	updateNowPlaying,
	updateNowPlayingPosition,
} from "./desktopLyricWindow"

function createDesktopLyricHandlers(): IpcHandlerModule {
	return {
		handlers: [
			{
				channel: CHANNELS.DESKTOP_LYRIC_SET_ENABLED,
				handler: async (_event, enabled: boolean) => {
					await setDesktopLyricEnabled(!!enabled)
					return { success: true, enabled: !!enabled }
				},
			},
			{
				channel: CHANNELS.DESKTOP_LYRIC_GET_STATE,
				handler: async () => {
					return { success: true, config: getDesktopLyricConfig() }
				},
			},
			{
				channel: CHANNELS.DESKTOP_LYRIC_UPDATE_CONFIG,
				handler: async (_event, partial: Record<string, unknown>) => {
					await updateDesktopLyricConfig(partial as Partial<import("./desktopLyricWindow").DesktopLyricConfig>)
					return { success: true }
				},
			},
			{
				channel: CHANNELS.DESKTOP_LYRIC_REQUEST_SNAPSHOT,
				handler: async () => {
					return { success: true, snapshot: getNowPlayingSnapshot() }
				},
			},
			{
				channel: CHANNELS.DESKTOP_LYRIC_MOVE,
				handler: async (_event, x: number, y: number) => {
					await moveDesktopLyricWindow(Number(x), Number(y))
					return { success: true }
				},
			},
			{
				channel: CHANNELS.DESKTOP_LYRIC_SAVE_STATE,
				handler: async () => {
					await saveDesktopLyricState()
					return { success: true }
				},
			},
			{
				channel: CHANNELS.DESKTOP_LYRIC_CLOSE,
				handler: async () => {
					await setDesktopLyricEnabled(false)
					return { success: true }
				},
			},
			{
				channel: CHANNELS.DESKTOP_LYRIC_SET_UNLOCK_BUTTON_BOUNDS,
				handler: async (
					_event,
					bounds: import("./desktopLyricWindow").DesktopLyricUnlockButtonBounds | null
				) => {
					setUnlockButtonBounds(bounds)
					return { success: true }
				},
			},
			{
				channel: CHANNELS.NOW_PLAYING_UPDATE,
				handler: async (
					_event,
					payload: Omit<import("./desktopLyricWindow").NowPlayingSnapshot, "sendTimestamp">
				) => {
					updateNowPlaying(payload)
					return { success: true }
				},
			},
			{
				channel: CHANNELS.NOW_PLAYING_POSITION,
				handler: async (
					_event,
					payload: { position: number; playing: boolean; speed: number }
				) => {
					updateNowPlayingPosition(payload)
					return { success: true }
				},
			},
		],
		cleanup: cleanupDesktopLyric,
	}
}

export { createDesktopLyricHandlers }
