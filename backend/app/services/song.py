"""QQ 音乐搜索下载服务"""
import logging
from urllib.parse import parse_qs, urlparse

import httpx
from qqmusic_api.modules.song import SongFileInfo, SongFileType
from qqmusic_api.modules.search import SearchType

from app.credential.get_credential import get_credential
from app.qqmusic.client import get_client
from app.schemas.common import ErrorCode
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


async def get_song_detail(song_id):
    """获取单曲详情"""
    client = await get_client()

    try:
        detail = await client.execute(client.song.get_detail(song_id))
    except ServiceException:
        raise
    except Exception:
        logging.exception(f"获取歌曲详情失败: {song_id}")
        raise ServiceException(ErrorCode.AI_SERVICE_ERROR, "服务调用失败，请稍后重试")

    return {
        "result": [_build_single_song_item(song_id, detail)],
        "total": 1,
    }


async def get_songlist_detail(songlist_id, page, page_size, request_id):
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

    return {
        "result": items,
        "total": result.total,
        "requestId": request_id,
    }


async def get_song_url_list(song_mid_list, file_type, credential):
    """获取歌曲下载链接"""
    client = await get_client()
    file_info = [SongFileInfo(mid=mid) for mid in song_mid_list]

    try:
        result = await client.execute(
            client.song.get_song_urls(
                file_info=file_info,
                file_type=file_type,
                credential=credential,
            )
        )
    except ServiceException:
        raise
    except Exception:
        logging.exception("获取歌曲下载链接失败")
        raise ServiceException(ErrorCode.AI_SERVICE_ERROR, "服务调用失败，请稍后重试")

    url_map = {}
    for item in result.data:
        url = f"{CDN_DOMAIN}{item.purl}" if item.purl else ""
        url_map[item.mid] = url

    return url_map


async def search_by_keyword(keyword, page, page_size, request_id):
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

    return {
        "result": items,
        "total": result.total_num,
        "requestId": request_id,
    }


def get_album_covers(album_mid_list):
    """获取专辑封面 URL 列表"""
    return [ALBUM_COVER_TEMPLATE.format(mid=mid) for mid in album_mid_list]


async def get_song_url_list_v2(song_mid_list: list[str]):
    """获取歌曲链接，有凭证→FLAC，失败降级→ACC_96匿名试听"""
    try:
        credential = get_credential()
    except ServiceException:
        # 从未登录过 → 直接匿名 ACC_96 试听
        return await _request_anonymous_try(song_mid_list)

    # 有凭证 → 先试 FLAC
    try:
        client = await get_client()
        file_info = [SongFileInfo(mid=mid) for mid in song_mid_list]
        result = await client.execute(
            client.song.get_song_urls(
                file_info=file_info,
                file_type=SongFileType.FLAC,
                credential=credential,
            )
        )
        url_map = {}
        for item in result.data:
            url = f"{CDN_DOMAIN}{item.purl}" if item.purl and getattr(item, "result", 0) == 0 else ""
            url_map[item.mid] = url
        return _build_url_result(url_map, is_trial=False)
    except Exception:
        # 凭证过期或其它异常 → 降级为匿名 ACC_96 试听
        logging.warning("FLAC 获取失败，降级到 ACC_96 试听")
        return await _request_anonymous_try(song_mid_list)

    # 有凭证 → FLAC
    client = await get_client()
    file_info = [SongFileInfo(mid=mid) for mid in song_mid_list]

    try:
        result = await client.execute(
            client.song.get_song_urls(
                file_info=file_info,
                file_type=SongFileType.FLAC,
                credential=credential,
            )
        )
    except Exception:
        # 凭证过期或其它异常 → 返回空（前端提示重新登录）
        logging.exception("FLAC 获取失败")
        return [{"url": "", "urlType": "", "isTrial": True} for _ in song_mid_list]

    url_map = {}
    for item in result.data:
        url = f"{CDN_DOMAIN}{item.purl}" if item.purl and getattr(item, "result", 0) == 0 else ""
        url_map[item.mid] = url

    return _build_url_result(url_map, is_trial=False)


async def _request_anonymous_try(song_mid_list: list[str]):
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
        return [{"url": "", "urlType": "", "isTrial": True} for _ in song_mid_list]

    url_map = {}
    for item in result.data:
        url = f"{CDN_DOMAIN}{item.purl}" if item.purl and getattr(item, "result", 0) == 0 else ""
        url_map[item.mid] = url

    return _build_url_result(url_map, is_trial=True)

"""辅助函数"""


def _build_url_result(song_urls: dict[str, str], is_trial: bool) -> list[dict]:
    """构建歌曲 URL 结果列表"""
    result = []
    for song_mid, url in song_urls.items():
        url_type = "flac" if "flac" in url.lower() else "mp3"
        result.append({
            "url": url or "",
            "urlType": url_type,
            "isTrial": is_trial,
        })
    return result

def _safe_get_genre(detail):
    """安全提取流派信息"""
    try:
        return " / ".join(item.value for item in detail.genre)
    except (AttributeError, TypeError):
        return ""


def _format_duration(seconds):
    """格式化秒数为 mm:ss"""
    return f"{seconds // 60:02d}:{seconds % 60:02d}"


def _build_single_song_item(song_id, detail):
    """构建单曲结果项"""
    track = detail.track
    singer = " / ".join(s.name for s in track.singer)
    lan = " / ".join(item.value for item in detail.lan) if detail.lan else ""

    return {
        "songId": song_id,
        "songMid": track.mid,
        "songName": track.title,
        "singer": singer,
        "genre": _safe_get_genre(detail),
        "lan": lan,
        "createTime": track.time_public,
        "album": {
            "albumId": track.album.id,
            "albumMid": track.album.mid,
            "albumName": track.album.title,
            "albumCoverUrl": "",
        },
        "duration": _format_duration(track.interval),
        "songUrl": "",
    }


def _build_from_search_song(song):
    """构建关键词搜索结果的歌曲项"""
    singer = " / ".join(s.name for s in song.singer)

    return {
        "songId": song.id,
        "songMid": song.mid,
        "songName": song.title,
        "singer": singer,
        "genre": "",
        "lan": "",
        "createTime": song.time_public,
        "album": {
            "albumId": song.album.id,
            "albumMid": song.album.mid,
            "albumName": song.album.name,
            "albumCoverUrl": "",
        },
        "duration": _format_duration(song.interval),
        "songUrl": "",
    }


def _build_songlist_item(song):
    """构建歌单中的歌曲结果项"""
    singer = " / ".join(s.name for s in song.singer)

    return {
        "songId": song.id,
        "songMid": song.mid,
        "songName": song.title,
        "singer": singer,
        "genre": "",
        "lan": "",
        "createTime": song.time_public,
        "album": {
            "albumId": song.album.id,
            "albumMid": song.album.mid,
            "albumName": song.album.title,
            "albumCoverUrl": "",
        },
        "duration": _format_duration(song.interval),
        "songUrl": {"url": "", "urlType": "flac"},
    }
