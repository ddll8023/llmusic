"""歌曲搜索下载 Schema"""
from pydantic import BaseModel, Field

# ========== 辅助类（Support）==========


class AlbumInfo(BaseModel):
    albumId: int = 0
    albumMid: str = ""
    albumName: str = ""
    albumCoverUrl: str = ""


class SongUrlInfo(BaseModel):
    url: str = ""
    urlType: str = "mp3"


class SongItem(BaseModel):
    songId: int = 0
    songMid: str = ""
    songName: str = ""
    singer: str = ""
    genre: str = ""
    lan: str = ""
    createTime: str = ""
    album: AlbumInfo = AlbumInfo()
    duration: str = ""
    songUrl: SongUrlInfo | None = None


# ========== 请求类（Request）==========


class SearchRequest(BaseModel):
    requestId: str = "0"
    urlType: str = Field(..., description="song 或 playlist")
    searchUrl: str = Field(..., description="QQ 音乐分享链接")
    page: int = Field(default=1, ge=1)
    pageSize: int = Field(default=10, ge=1, le=100)


class AlbumImgRequest(BaseModel):
    requestId: str = "0"
    albumIdList: list[str] = Field(..., description="专辑 MID 列表")


class SongUrlRequest(BaseModel):
    requestId: str = "0"
    songIdList: list[str] = Field(..., description="歌曲 MID 列表")


# ========== 响应类（Response）==========


class SearchResponse(BaseModel):
    result: list[SongItem] = []
    total: int = 0
    requestId: str = ""


class AlbumImgResponse(BaseModel):
    requestId: str = ""
    result: list[str] = []


class SongUrlItem(BaseModel):
    url: str = ""
    urlType: str = "mp3"


class SongUrlResponse(BaseModel):
    requestId: str = ""
    result: list[SongUrlItem] = []
