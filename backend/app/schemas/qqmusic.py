"""QQ音乐数据模型"""
from pydantic import BaseModel, ConfigDict, Field


# ========== 辅助类（Support）==========


class QMPlaylistItem(BaseModel):
    """QQ 音乐用户歌单项"""
    id: int = Field(default=0, description="歌单 ID")
    title: str = Field(default="", description="歌单标题")
    coverUrl: str = Field(default="", description="歌单封面 URL")
    songCount: int = Field(default=0, description="歌曲数量")
    createTime: str = Field(default="", description="创建时间")


class AlbumInfo(BaseModel):
    albumId: int = Field(default=0, description="专辑 ID")
    albumMid: str = Field(default="", description="专辑 MID")
    albumName: str = Field(default="", description="专辑名称")
    albumCoverUrl: str = Field(default="", description="专辑封面 URL")


class SongUrlInfo(BaseModel):
    url: str = Field(default="", description="歌曲播放/下载 URL")
    urlType: str = Field(default="mp3", description="音频格式: mp3/flac")


class SongItem(BaseModel):
    songId: int = Field(default=0, description="歌曲 ID")
    songMid: str = Field(default="", description="歌曲 MID")
    songName: str = Field(default="", description="歌曲名称")
    singer: str = Field(default="", description="歌手")
    genre: str = Field(default="", description="流派")
    lan: str = Field(default="", description="语言")
    createTime: str = Field(default="", description="发行时间")
    album: AlbumInfo = Field(default=AlbumInfo(), description="专辑信息")
    duration: str = Field(default="", description="时长 mm:ss")
    songUrl: SongUrlInfo | None = Field(default=None, description="歌曲播放链接")


# ========== 请求类（Request）==========


class SearchRequest(BaseModel):
    requestId: str = Field(default="0", description="请求 ID 用于跟踪")
    urlType: str = Field(..., description="链接类型: song 或 playlist")
    searchUrl: str = Field(..., description="QQ 音乐分享链接")
    page: int = Field(default=1, ge=1, description="页码")
    pageSize: int = Field(default=10, ge=1, le=100, description="每页数量")


class AlbumImgRequest(BaseModel):
    requestId: str = Field(default="0", description="请求 ID 用于跟踪")
    albumIdList: list[str] = Field(..., description="专辑 MID 列表")


class SongUrlRequest(BaseModel):
    requestId: str = Field(default="0", description="请求 ID 用于跟踪")
    songIdList: list[str] = Field(..., description="歌曲 MID 列表")


class KeywordSearchRequest(BaseModel):
    requestId: str = Field(default="0", description="请求 ID 用于跟踪")
    keyword: str = Field(..., description="搜索关键词")
    page: int = Field(default=1, ge=1, description="页码")
    pageSize: int = Field(default=10, ge=1, le=50, description="每页数量")


class GetUserLikedRequest(BaseModel):
    page: int = Field(default=1, ge=1, description="页码")
    pageSize: int = Field(default=20, ge=1, le=100, description="每页数量")


class GetPlaylistSongsRequest(BaseModel):
    page: int = Field(default=1, ge=1, description="页码")
    pageSize: int = Field(default=20, ge=1, le=100, description="每页数量")


class CheckQRCodeRequest(BaseModel):
    session_id: str = Field(..., description="登录会话 ID")


# ========== 响应类（Response）==========


class UserPlaylistsResponse(BaseModel):
    playlists: list[QMPlaylistItem] = Field(default=[], description="用户创建的歌单列表")
    total: int = Field(default=0, description="歌单总数")

    model_config = ConfigDict(from_attributes=True)


class LikedSongsResponse(BaseModel):
    result: list[SongItem] = Field(default=[], description="用户喜欢的歌曲列表")
    total: int = Field(default=0, description="歌曲总数")

    model_config = ConfigDict(from_attributes=True)


class PlaylistSongsResponse(BaseModel):
    result: list[SongItem] = Field(default=[], description="歌单歌曲列表")
    total: int = Field(default=0, description="歌曲总数")
    requestId: str = Field(default="", description="请求 ID")

    model_config = ConfigDict(from_attributes=True)


class SearchResponse(BaseModel):
    result: list[SongItem] = Field(default=[], description="搜索结果列表")
    total: int = Field(default=0, description="结果总数")
    requestId: str = Field(default="", description="请求 ID")

    model_config = ConfigDict(from_attributes=True)


class AlbumImgResponse(BaseModel):
    requestId: str = Field(default="", description="请求 ID")
    result: list[str] = Field(default=[], description="封面 URL 列表")

    model_config = ConfigDict(from_attributes=True)


class SongUrlItem(BaseModel):
    url: str = Field(default="", description="歌曲 URL")
    urlType: str = Field(default="mp3", description="音频格式: mp3/flac")

    model_config = ConfigDict(from_attributes=True)


class SongUrlResponse(BaseModel):
    requestId: str = Field(default="", description="请求 ID")
    result: list[SongUrlItem] = Field(default=[], description="歌曲 URL 列表")

    model_config = ConfigDict(from_attributes=True)
