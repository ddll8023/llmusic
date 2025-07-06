/**
 * 标签编辑相关的 IPC 处理器
 * 
 * 处理来自渲染进程的标签编辑请求，包括：
 * - 获取歌曲标签信息
 * - 更新歌曲标签
 * - 验证标签数据
 */

const { CHANNELS } = require("../constants/ipcChannels");
const { getSongTags, updateSongTags, validateTagChanges } = require("../tagEditor");
const { getSongById, parseSongFromFile } = require("../database");

/**
 * 创建标签编辑相关的 IPC 处理器
 * @returns {{ handlers: Array<{channel:string, handler:Function}>, cleanup: Function }}
 */
function createTagHandlers() {
  const handlers = [
    {
      channel: CHANNELS.GET_SONG_TAGS,
      handler: async (event, songId) => {
        try {
          if (!songId) {
            return { success: false, error: "歌曲ID不能为空" };
          }

          // 从数据库获取歌曲信息
          const song = await getSongById(songId);
          if (!song) {
            return { success: false, error: "未找到指定的歌曲" };
          }

          // 从文件读取最新的标签信息
          const tagResult = await getSongTags(song.filePath);
          if (!tagResult.success) {
            return {
              success: false,
              error: `读取标签失败: ${tagResult.error}`,
              songId
            };
          }

          return {
            success: true,
            songId,
            song: {
              id: song.id,
              title: song.title,
              artist: song.artist,
              album: song.album,
              filePath: song.filePath
            },
            tags: tagResult.tags,
            format: tagResult.format
          };

        } catch (error) {
          console.error('获取歌曲标签失败:', error);
          return {
            success: false,
            error: error.message,
            songId
          };
        }
      }
    },

    {
      channel: CHANNELS.UPDATE_SONG_TAGS,
      handler: async (event, { songId, tags }) => {
        try {
          if (!songId) {
            return { success: false, error: "歌曲ID不能为空" };
          }

          if (!tags || typeof tags !== 'object') {
            return { success: false, error: "标签数据不能为空" };
          }

          // 从数据库获取歌曲信息
          const song = await getSongById(songId);
          if (!song) {
            return { success: false, error: "未找到指定的歌曲" };
          }

          // 更新文件标签
          const updateResult = await updateSongTags(song.filePath, tags);
          if (!updateResult.success) {
            return {
              success: false,
              error: updateResult.error,
              validation: updateResult.validation,
              songId
            };
          }

          // 重新解析文件以获取更新后的元数据
          try {
            const updatedSong = await parseSongFromFile(song.filePath, song.id, song.libraryId);
            if (updatedSong) {
              // 数据库会在 parseSongFromFile 中自动更新
              return {
                success: true,
                message: '标签更新成功',
                songId,
                updatedSong,
                validation: updateResult.validation
              };
            } else {
              // 文件标签更新成功，但数据库更新失败
              return {
                success: true,
                message: '标签更新成功，但数据库同步失败',
                songId,
                validation: updateResult.validation,
                warning: '请重新扫描音乐库以同步数据库'
              };
            }
          } catch (parseError) {
            console.error('重新解析歌曲文件失败:', parseError);
            return {
              success: true,
              message: '标签更新成功，但数据库同步失败',
              songId,
              validation: updateResult.validation,
              warning: '请重新扫描音乐库以同步数据库'
            };
          }

        } catch (error) {
          console.error('更新歌曲标签失败:', error);
          return {
            success: false,
            error: error.message,
            songId
          };
        }
      }
    },

    {
      channel: CHANNELS.VALIDATE_TAG_CHANGES,
      handler: async (event, tags) => {
        try {
          if (!tags || typeof tags !== 'object') {
            return { success: false, error: "标签数据不能为空" };
          }

          const validation = validateTagChanges(tags);
          
          return {
            success: true,
            validation
          };

        } catch (error) {
          console.error('验证标签数据失败:', error);
          return {
            success: false,
            error: error.message
          };
        }
      }
    }
  ];

  return {
    handlers,
    cleanup: () => {
      // 清理资源（如果需要）
      console.log('标签编辑处理器已清理');
    }
  };
}

module.exports = {
  createTagHandlers
};
