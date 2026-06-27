declare module "fluent-ffmpeg" {
	import { EventEmitter } from "events"
	import { Stream } from "stream"

	export interface FfmpegCommand extends EventEmitter {
		seekInput(time: number | string): this
		noVideo(): this
		audioCodec(codec: string): this
		audioChannels(channels: number): this
		audioFrequency(freq: number): this
		format(format: string): this
		outputOptions(options: string[]): this
		output(target: string): this
		on(event: string, listener: (...args: any[]) => void): this
		pipe(): Stream
		run(): void
		kill(signal?: string): void
		clone(): FfmpegCommand
	}

	interface FfmpegStatic {
		(filePath: string): FfmpegCommand
		setFfmpegPath(path: string): void
		setFfprobePath(path: string): void
	}

	const ffmpeg: FfmpegStatic
	export = ffmpeg
}
