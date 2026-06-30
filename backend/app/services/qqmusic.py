"""QQ音乐业务服务——歌曲搜索、用户歌单、歌曲链接"""
import logging
from urllib.parse import parse_qs, urlparse

import httpx
from qqmusic_api.modules.song import SongFileInfo, SongFileType
from qqmusic_api.modules.search import SearchType

from app.credential.get_credential import get_credential
from app.qqmusic.client import get_client
from app.schemas.common import ErrorCode
from app.schemas.qqmusic import (
    AlbumImgResponse,
    AlbumInfo,
    LikedSongsResponse,
    PlaylistSongsResponse,
    QMPlaylistItem,
    SearchResponse,
    SongDownloadBundleResponse,
    SongItem,
    SongUrlInfo,
    SongUrlItem,
    SongUrlResponse,
    UserPlaylistsResponse,
)
from app.utils import ensure_https
from app.utils.exception import ServiceException

ALBUM_COVER_TEMPLATE = "https://y.gtimg.cn/music/photo_new/T002R300x300M000{mid}.jpg"
CDN_DOMAIN = "https://isure.stream.qqmusic.qq.com/"


# ========== 公共入口函数 ==========


def resolve_search_url(url_type, search_url):
    """解析 QQ 音乐分享链接重定向获取参数"""
    try:
        response = httpx.get(search_url, follow_redirects=False)
    except Exception:
        raise ServiceException(ErrorCode.INTERNAL_ERROR, "链接请求失败")

    if response.status_code != 302:
        raise ServiceException(ErrorCode.PARAM_ERROR, "链接无法解析，请检查URL")

    location = response.headers.get("location")
    if not location:
        raise ServiceException(ErrorCode.PARAM_ERROR, "重定向响应缺少Location头")

    logging.info(f"重定向到: {location}")
    parsed = urlparse(location)
    params = parse_qs(parsed.query)

    if url_type == "song":
        if "songid" not in params:
            raise ServiceException(ErrorCode.PARAM_ERROR, "未找到 songid")
    elif url_type == "playlist":
        if "id" not in params:
            raise ServiceException(ErrorCode.PARAM_ERROR, "未找到歌单ID")

    return params


async def get_song_detail(song_id, request_id=""):
    """获取单曲详情"""
    client = await get_client()

    try:
        detail = await client.execute(client.song.get_detail(song_id))
    except ServiceException:
        raise
    except Exception:
        logging.exception(f"获取歌曲详情失败: {song_id}")
        raise ServiceException(ErrorCode.AI_SERVICE_ERROR, "服务调用失败，请稍后重试")

    item = _build_single_song_item(song_id, detail)
    return SearchResponse(result=[item], total=1, requestId=request_id)


async def get_songlist_detail(songlist_id, page, page_size, request_id=""):
    """获取歌单歌曲列表"""
    client = await get_client()

    try:
        result = await client.execute(
            client.songlist.get_detail(songlist_id, num=page_size, page=page)
        )
    except ServiceException:
        raise
    except Exception:
        logging.exception(f"获取歌单详情失败: {songlist_id}")
        raise ServiceException(ErrorCode.AI_SERVICE_ERROR, "服务调用失败，请稍后重试")

    items = [_build_songlist_item(song) for song in result.songs]
    return PlaylistSongsResponse(result=items, total=result.total, requestId=request_id)


async def search_by_keyword(keyword, page, page_size, request_id=""):
    """通过关键词搜索歌曲"""
    client = await get_client()

    try:
        result = await client.execute(
            client.search.search_by_type(
                keyword=keyword,
                search_type=SearchType.SONG,
                num=page_size,
                page=page,
            )
        )
    except ServiceException:
        raise
    except Exception:
        logging.exception(f"关键词搜索失败: {keyword}")
        raise ServiceException(ErrorCode.AI_SERVICE_ERROR, "服务调用失败，请稍后重试")

    items = [_build_from_search_song(song) for song in result.song]
    return SearchResponse(result=items, total=result.total_num, requestId=request_id)


def get_album_covers(album_mid_list, request_id=""):
    """获取专辑封面 URL 列表"""
    urls = [ALBUM_COVER_TEMPLATE.format(mid=mid) for mid in album_mid_list]
    return AlbumImgResponse(requestId=request_id, result=urls)


async def get_song_url_list_v2(song_mid_list, request_id=""):
    """获取歌曲链接，有凭证→FLAC，失败降级→ACC_96匿名试听"""
    try:
        credential = get_credential()
    except ServiceException:
        items = await _try_get_trial_urls(song_mid_list)
        return SongUrlResponse(requestId=request_id, result=items)

    items = await _try_get_flac_urls(song_mid_list, credential)
    if items is not None:
        return SongUrlResponse(requestId=request_id, result=items)

    # FLAC 降级 → 匿名试听
    logging.warning("FLAC 获取失败，降级到 ACC_96 试听")
    items = await _try_get_trial_urls(song_mid_list)
    return SongUrlResponse(requestId=request_id, result=items)


async def get_user_playlists():
    """获取当前登录用户创建的歌单列表"""
    credential = get_credential()

    if not credential.musicid:
        raise ServiceException(ErrorCode.NOT_LOGGED_IN, "未登录")

    client = await get_client()

    try:
        result = await client.execute(
            client.user.get_created_songlist(uin=credential.musicid)
        )
    except ServiceException:
        raise
    except Exception:
        logging.exception("获取用户歌单失败")
        raise ServiceException(ErrorCode.AI_SERVICE_ERROR, "服务调用失败，请稍后重试")

    playlists = [
        QMPlaylistItem(
            id=pl.id,
            title=pl.title,
            coverUrl=ensure_https(pl.picurl),
            songCount=pl.songnum,
            createTime=str(pl.create_time or ""),
        )
        for pl in result.playlists
    ]
    return UserPlaylistsResponse(playlists=playlists, total=result.total)


async def get_user_liked_songs(page=1, page_size=20):
    """获取当前登录用户喜欢的歌曲列表"""
    credential = get_credential()

    if not credential.encrypt_uin:
        raise ServiceException(ErrorCode.NOT_LOGGED_IN, "未登录")

    client = await get_client()

    try:
        result = await client.execute(
            client.user.get_fav_song(euin=credential.encrypt_uin, page=page, num=page_size)
        )
    except ServiceException:
        raise
    except Exception:
        logging.exception("获取用户喜欢歌曲失败")
        raise ServiceException(ErrorCode.AI_SERVICE_ERROR, "服务调用失败，请稍后重试")

    items = [_build_songlist_item(song) for song in result.songs]
    return LikedSongsResponse(result=items, total=result.total)


async def get_song_download_bundle(song_mid, request_id=""):
    """获取歌曲下载元数据包（详情+歌词+下载链接）"""
    client = await get_client()

    try:
        detail = await client.execute(client.song.get_detail(song_mid))
    except ServiceException:
        raise
    except Exception:
        logging.exception(f"获取歌曲详情失败: {song_mid}")
        raise ServiceException(ErrorCode.AI_SERVICE_ERROR, "获取歌曲详情失败")

    track = detail.track
    album_info = _build_album_info(track)

    lyrics = ""
    try:
        lyric_result = await client.execute(client.lyric.get_lyric(song_mid, trans=True, roma=True))
        if lyric_result:
            lyrics = lyric_result.decrypt().lyric or ""
            trans = lyric_result.decrypt().trans or ""
            roma = lyric_result.decrypt().roma or ""
            if trans:
                lyrics += "\n\n" + trans
            if roma:
                lyrics += "\n\n" + roma
    except Exception:
        logging.warning(f"获取歌词失败: {song_mid}")

    song_url = SongUrlInfo()
    try:
        url_items = await get_song_url_list_v2([song_mid], request_id)
        if url_items and url_items.result and url_items.result[0]:
            song_url = SongUrlInfo(
                url=url_items.result[0].url or "",
                urlType=url_items.result[0].urlType or "mp3",
            )
    except Exception:
        logging.warning(f"获取下载链接失败: {song_mid}")

    return SongDownloadBundleResponse(
        songMid=song_mid,
        songName=track.title or "",
        singer=_build_singer(track),
        album=AlbumInfo(**album_info),
        trackNumber=track.index_album or 0,
        genre=_safe_get_genre(detail),
        year=track.time_public or "",
        duration=track.interval or 0,
        lyrics=lyrics,
        songUrl=song_url,
    )


"""辅助函数"""


async def _try_get_flac_urls(song_mid_list, credential):
    """尝试获取 FLAC 无损链接，失败返回 None"""
    client = await get_client()
    file_info = [SongFileInfo(mid=mid) for mid in song_mid_list]
    try:
        flac_result = await client.execute(
            client.song.get_song_urls(
                file_info=file_info,
                file_type=SongFileType.FLAC,
                credential=credential,
            )
        )
    except Exception:
        logging.exception("FLAC 获取失败")
        return None

    url_map = {}
    for item in flac_result.data:
        url = f"{CDN_DOMAIN}{item.purl}" if item.purl and getattr(item, "result", 0) == 0 else ""
        url_map[item.mid] = url
    return _build_url_result_items(url_map, is_trial=False)


async def _try_get_trial_urls(song_mid_list):
    """匿名客户端请求 ACC_96 试听链接"""
    from qqmusic_api import Client as AnonClient

    anon_client = AnonClient()
    file_info = [SongFileInfo(mid=mid) for mid in song_mid_list]

    try:
        result = await anon_client.execute(
            anon_client.song.get_song_urls(
                file_info=file_info,
                file_type=SongFileType.ACC_96,
            )
        )
    except Exception:
        logging.exception("ACC_96 试听获取失败")
        return [SongUrlItem(url="", urlType="mp3") for _ in song_mid_list]

    url_map = {}
    for item in result.data:
        url = f"{CDN_DOMAIN}{item.purl}" if item.purl and getattr(item, "result", 0) == 0 else ""
        url_map[item.mid] = url
    return _build_url_result_items(url_map, is_trial=True)


def _build_url_result_items(song_urls: dict[str, str], is_trial: bool) -> list[SongUrlItem]:
    """构建歌曲 URL 结果列表"""
    items = []
    for song_mid, url in song_urls.items():
        url_type = "flac" if "flac" in url.lower() else "mp3"
        items.append(SongUrlItem(url=url or "", urlType=url_type))
    return items


def _safe_get_genre(detail):
    """安全提取流派信息"""
    try:
        return " / ".join(item.value for item in detail.genre)
    except (AttributeError, TypeError):
        return ""


def _format_duration(seconds):
    """格式化秒数为 mm:ss"""
    return f"{seconds // 60:02d}:{seconds % 60:02d}"


def _build_album_info(track, name_key="name"):
    """从 track 对象提取专辑信息"""
    album_id = getattr(track.album, "id", 0)
    album_mid = getattr(track.album, "mid", "")
    album_name = getattr(track.album, name_key, "")
    album_cover_url = ALBUM_COVER_TEMPLATE.format(mid=album_mid) if album_mid else ""
    return {"albumId": album_id, "albumMid": album_mid, "albumName": album_name, "albumCoverUrl": album_cover_url}


def _build_singer(track):
    """提取歌手名"""
    return " / ".join(s.name for s in track.singer)


def _build_single_song_item(song_id, detail):
    """构建单曲结果"""
    track = detail.track
    return SongItem(
        songId=song_id,
        songMid=track.mid,
        songName=track.title,
        singer=_build_singer(track),
        genre=_safe_get_genre(detail),
        lan=" / ".join(item.value for item in detail.lan) if detail.lan else "",
        createTime=track.time_public,
        album=AlbumInfo(**_build_album_info(track)),
        duration=_format_duration(track.interval),
        songUrl=None,
    )


def _build_from_search_song(song):
    """构建关键词搜索结果"""
    return SongItem(
        songId=song.id,
        songMid=song.mid,
        songName=song.title,
        singer=_build_singer(song),
        genre="",
        lan="",
        createTime=song.time_public,
        album=AlbumInfo(**_build_album_info(song, name_key="name")),
        duration=_format_duration(song.interval),
        songUrl=None,
    )


def _build_songlist_item(song):
    """构建歌单中的歌曲结果"""
    return SongItem(
        songId=song.id,
        songMid=song.mid,
        songName=song.title,
        singer=_build_singer(song),
        genre="",
        lan="",
        createTime=song.time_public,
        album=AlbumInfo(**_build_album_info(song)),
        duration=_format_duration(song.interval),
        songUrl=SongUrlInfo(url="", urlType="flac"),
    )
