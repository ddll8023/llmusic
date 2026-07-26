/**
 * 共享 ffmpeg 实例：统一修正打包后的二进制路径，避免各 handler 重复配置
 */
import ffmpeg from "fluent-ffmpeg"
import ffmpegPath from "ffmpeg-static"
import ffprobeStatic from "ffprobe-static"

const correctedFfmpegPath = (ffmpegPath as string).replace("app.asar", "app.asar.unpacked")
const correctedFfprobePath = ffprobeStatic.path.replace("app.asar", "app.asar.unpacked")

ffmpeg.setFfmpegPath(correctedFfmpegPath)
ffmpeg.setFfprobePath(correctedFfprobePath)

export { ffmpeg }
