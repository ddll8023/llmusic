"""歌曲搜索下载 API"""
from fastapi import APIRouter

from app.schemas import song as schemas_song
from app.schemas.common import ApiResponse
from app.schemas.response import error, success
from app.services import song as services_song
from app.utils.exception import ServiceException

router = APIRouter()


@router.post("/search", response_model=ApiResponse)
async def search_song(req: schemas_song.SearchRequest):
    """搜索 QQ 音乐歌曲或歌单"""
    try:
        params = services_song.resolve_search_url(req.urlType, req.searchUrl)

        if req.urlType == "song":
            song_id = int(params["songid"][0])
            result = await services_song.get_song_detail(song_id)
            result["requestId"] = req.requestId
            return success(data=result)

        playlist_id = int(params["id"][0])
        result = await services_song.get_songlist_detail(
            playlist_id, req.page, req.pageSize, req.requestId
        )
        return success(data=result)

    except ServiceException as e:
        return error(code=e.code, message=e.message)


@router.post("/albumImg", response_model=ApiResponse)
def get_album_images(req: schemas_song.AlbumImgRequest):
    """获取专辑封面"""
    try:
        cover_urls = services_song.get_album_covers(req.albumIdList)
        return success(data={"requestId": req.requestId, "result": cover_urls})

    except ServiceException as e:
        return error(code=e.code, message=e.message)


@router.post("/songUrl", response_model=ApiResponse)
async def get_song_urls(req: schemas_song.SongUrlRequest):
    """获取歌曲链接（有凭证→FLAC，无凭证→ACC_96试听）"""
    try:
        result = await services_song.get_song_url_list_v2(
            song_mid_list=req.songIdList,
        )
        return success(data={"requestId": req.requestId, "result": result})

    except ServiceException as e:
        return error(code=e.code, message=e.message)


@router.post("/searchByKeyword", response_model=ApiResponse)
async def search_by_keyword(req: schemas_song.KeywordSearchRequest):
    """通过关键词搜索歌曲"""
    try:
        result = await services_song.search_by_keyword(
            keyword=req.keyword,
            page=req.page,
            page_size=req.pageSize,
            request_id=req.requestId,
        )
        return success(data=result)

    except ServiceException as e:
        return error(code=e.code, message=e.message)
