"""QQ音乐 API 路由——歌曲搜索、登录认证、用户歌单"""
from fastapi import APIRouter

from app.schemas import qqmusic as schemas_qqmusic
from app.schemas import auth as schemas_auth
from app.schemas.common import ApiResponse
from app.schemas.qqmusic import (
    AlbumImgResponse,
    LikedSongsResponse,
    PlaylistSongsResponse,
    SearchResponse,
    SongDownloadBundleResponse,
    SongUrlResponse,
    UserPlaylistsResponse,
)
from app.schemas.response import error, success
from app.services import qqmusic as services_qqmusic
from app.services import auth as services_auth
from app.utils.exception import ServiceException

router = APIRouter()


# ========== 歌曲搜索 ==========


@router.post("/song/search", response_model=ApiResponse)
async def search_song(req: schemas_qqmusic.SearchRequest):
    """搜索 QQ 音乐歌曲或歌单（双返回类型，无法限定泛型）"""
    try:
        params = services_qqmusic.resolve_search_url(req.urlType, req.searchUrl)

        if req.urlType == "song":
            song_id = int(params["songid"][0])
            result = await services_qqmusic.get_song_detail(song_id, req.requestId)
            return success(data=result)

        playlist_id = int(params["id"][0])
        result = await services_qqmusic.get_songlist_detail(
            playlist_id, req.page, req.pageSize, req.requestId
        )
        return success(data=result)

    except ServiceException as e:
        return error(code=e.code, message=e.message)


@router.post("/song/album-img", response_model=ApiResponse[AlbumImgResponse])
def get_album_images(req: schemas_qqmusic.AlbumImgRequest):
    """获取专辑封面"""
    try:
        result = services_qqmusic.get_album_covers(req.albumIdList, req.requestId)
        return success(data=result)

    except ServiceException as e:
        return error(code=e.code, message=e.message)


@router.post("/song/song-url", response_model=ApiResponse[SongUrlResponse])
async def get_song_urls(req: schemas_qqmusic.SongUrlRequest):
    """获取歌曲链接（有凭证→FLAC，无凭证→ACC_96试听）"""
    try:
        result = await services_qqmusic.get_song_url_list_v2(
            song_mid_list=req.songIdList,
            request_id=req.requestId,
        )
        return success(data=result)

    except ServiceException as e:
        return error(code=e.code, message=e.message)


@router.post("/song/download-bundle", response_model=ApiResponse[SongDownloadBundleResponse])
async def get_song_download_bundle(req: schemas_qqmusic.SongDownloadBundleRequest):
    """获取歌曲下载元数据包（含详情、封面、歌词、下载链接）"""
    try:
        result = await services_qqmusic.get_song_download_bundle(
            song_mid=req.songMid,
            request_id=req.requestId,
        )
        return success(data=result)

    except ServiceException as e:
        return error(code=e.code, message=e.message)


@router.post("/song/search-by-keyword", response_model=ApiResponse[SearchResponse])
async def search_by_keyword(req: schemas_qqmusic.KeywordSearchRequest):
    """通过关键词搜索歌曲"""
    try:
        result = await services_qqmusic.search_by_keyword(
            keyword=req.keyword,
            page=req.page,
            page_size=req.pageSize,
            request_id=req.requestId,
        )
        return success(data=result)

    except ServiceException as e:
        return error(code=e.code, message=e.message)


# ========== 用户数据 ==========


@router.post("/user/playlists", response_model=ApiResponse[UserPlaylistsResponse])
async def get_user_playlists():
    """获取当前登录用户创建的歌单列表"""
    try:
        result = await services_qqmusic.get_user_playlists()
        return success(data=result)

    except ServiceException as e:
        return error(code=e.code, message=e.message)


@router.post("/user/liked", response_model=ApiResponse[LikedSongsResponse])
async def get_user_liked_songs(req: schemas_qqmusic.GetUserLikedRequest):
    """获取当前登录用户喜欢的歌曲列表"""
    try:
        result = await services_qqmusic.get_user_liked_songs(
            page=req.page,
            page_size=req.pageSize,
        )
        return success(data=result)

    except ServiceException as e:
        return error(code=e.code, message=e.message)


# ========== 歌单详情 ==========


@router.post("/playlist/{playlist_id}/songs", response_model=ApiResponse[PlaylistSongsResponse])
async def get_playlist_songs(playlist_id: int, req: schemas_qqmusic.GetPlaylistSongsRequest):
    """获取 QQ 音乐歌单内的歌曲列表（单页）"""
    try:
        result = await services_qqmusic.get_songlist_detail(
            playlist_id, req.page, req.pageSize, request_id=""
        )
        return success(data=result)

    except ServiceException as e:
        return error(code=e.code, message=e.message)


@router.post("/playlist/{playlist_id}/songs/all", response_model=ApiResponse[PlaylistSongsResponse])
async def get_playlist_songs_all(playlist_id: int):
    """获取 QQ 音乐歌单内的全部歌曲（自动迭代所有页码，一次性返回）"""
    try:
        result = await services_qqmusic.get_songlist_detail_all(
            playlist_id, request_id=""
        )
        return success(data=result)

    except ServiceException as e:
        return error(code=e.code, message=e.message)


# ========== 登录认证 ==========


@router.post("/auth/status", response_model=ApiResponse)
async def get_login_status():
    """查询当前登录状态"""
    try:
        result = services_auth.get_login_status()
        if result["is_logged_in"]:
            is_expired = await services_auth.check_credential_expired()
            result["is_expired"] = is_expired
        return success(data=result)

    except ServiceException as e:
        return error(code=e.code, message=e.message)


@router.post("/auth/qrcode", response_model=ApiResponse)
async def create_qrcode(req: schemas_auth.QRCodeRequest):
    """创建二维码登录会话"""
    try:
        result = await services_auth.create_qrcode_session(req.login_type)
        return success(data=result)

    except ServiceException as e:
        return error(code=e.code, message=e.message)


@router.post("/auth/check", response_model=ApiResponse)
async def check_qrcode(req: schemas_qqmusic.CheckQRCodeRequest):
    """查询二维码登录状态"""
    try:
        result = await services_auth.check_qrcode_status(req.session_id)
        return success(data=result)

    except ServiceException as e:
        return error(code=e.code, message=e.message)


@router.post("/auth/logout", response_model=ApiResponse)
async def logout():
    """退出登录"""
    try:
        await services_auth.logout()
        return success(message="已退出登录")

    except ServiceException as e:
        return error(code=e.code, message=e.message)
