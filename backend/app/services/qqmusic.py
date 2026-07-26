"""QQ音乐业务服务——歌曲搜索、用户歌单、歌曲链接"""
import asyncio
from urllib.parse import parse_qs, urlparse

import httpx
from qqmusic_api.core.exceptions import LoginExpiredError, NotLoginError, RatelimitedError
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
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

ALBUM_COVER_TEMPLATE = "https://y.gtimg.cn/music/photo_new/T002R300x300M000{mid}.jpg"
CDN_DOMAIN = "https://isure.stream.qqmusic.qq.com/"
RESOLVE_URL_TIMEOUT_SECONDS = 10
SONGLIST_MAX_PAGES = 50


# ========== 公共入口函数 ==========


async def resolve_search_url(url_type, search_url):
    """解析 QQ 音乐分享链接重定向，返回歌曲/歌单 ID"""
    try:
        async with httpx.AsyncClient(timeout=RESOLVE_URL_TIMEOUT_SECONDS) as http_client:
            response = await http_client.get(search_url, follow_redirects=False)
    except Exception as exc:
        logger.error(f"分享链接请求失败: url={search_url} error={exc}", exc_info=True)
        raise ServiceException(ErrorCode.AI_SERVICE_ERROR, "链接请求失败") from exc

    if response.status_code != 302:
        raise ServiceException(ErrorCode.PARAM_ERROR, "链接无法解析，请检查URL")

    location = response.headers.get("location")
    if not location:
        raise ServiceException(ErrorCode.PARAM_ERROR, "重定向响应缺少Location头")

    logger.info(f"分享链接重定向到: {location}")
    params = parse_qs(urlparse(location).query)

    param_key = "songid" if url_type == "song" else "id"
    if param_key not in params:
        raise ServiceException(ErrorCode.PARAM_ERROR, "未找到歌曲ID" if url_type == "song" else "未找到歌单ID")

    try:
        return int(params[param_key][0])
    except (ValueError, TypeError) as exc:
        raise ServiceException(ErrorCode.PARAM_ERROR, "链接参数无效") from exc


async def get_song_detail(song_id, request_id=""):
    """获取单曲详情"""
    client = await get_client()

    try:
        detail = await client.execute(client.song.get_detail(song_id))
    except ServiceException:
        raise
    except (LoginExpiredError, NotLoginError, RatelimitedError) as exc:
        raise _convert_credential_error(exc) from exc
    except Exception:
        logger.error(f"获取歌曲详情失败: song_id={song_id}", exc_info=True)
        raise ServiceException(ErrorCode.AI_SERVICE_ERROR, "服务调用失败，请稍后重试")

    item = _build_single_song_item(song_id, detail)
    return SearchResponse(result=[item], total=1, requestId=request_id)


async def get_songlist_detail(songlist_id, page, page_size, request_id=""):
    """获取歌单歌曲列表（单页）"""
    client = await get_client()

    try:
        result = await client.execute(
            client.songlist.get_detail(songlist_id, num=page_size, page=page)
        )
    except ServiceException:
        raise
    except (LoginExpiredError, NotLoginError, RatelimitedError) as exc:
        raise _convert_credential_error(exc) from exc
    except Exception:
        logger.error(f"获取歌单详情失败: songlist_id={songlist_id}", exc_info=True)
        raise ServiceException(ErrorCode.AI_SERVICE_ERROR, "服务调用失败，请稍后重试")

    items = [_build_songlist_item(song) for song in result.songs]
    return PlaylistSongsResponse(result=items, total=result.total, requestId=request_id)


async def get_songlist_detail_all(songlist_id, request_id=""):
    """获取歌单全部歌曲（自动迭代所有页码，一次性返回）"""
    client = await get_client()

    logger.info(f"开始获取歌单全部歌曲: songlist_id={songlist_id}")

    all_songs = []
    total = 0
    page_count = 0

    try:
        pager = client.songlist.get_detail(songlist_id, num=100).paginate()

        async for page in pager:
            page_count += 1
            if page_count > SONGLIST_MAX_PAGES:
                logger.warning(
                    f"歌单页数超过上限，截断返回: songlist_id={songlist_id} max_pages={SONGLIST_MAX_PAGES}"
                )
                break
            for song in page.songs:
                all_songs.append(_build_songlist_item(song))
            total = page.total or total
    except ServiceException:
        raise
    except (LoginExpiredError, NotLoginError, RatelimitedError) as exc:
        raise _convert_credential_error(exc) from exc
    except Exception:
        logger.error(f"获取歌单全部歌曲失败: songlist_id={songlist_id}", exc_info=True)
        raise ServiceException(ErrorCode.AI_SERVICE_ERROR, "服务调用失败，请稍后重试")

    # 一次性批量获取所有歌曲的播放 URL，按 mid 映射回填
    mids = [s.songMid for s in all_songs if s.songMid]
    if mids:
        try:
            url_items = await get_song_url_list_v2(mids, request_id)
            url_list = url_items.result if url_items and url_items.result else []
            url_by_mid = {mid: item for mid, item in zip(mids, url_list)}
            for song in all_songs:
                url_item = url_by_mid.get(song.songMid)
                if url_item and url_item.url:
                    song.songUrl = SongUrlInfo(
                        url=url_item.url,
                        urlType=url_item.urlType or "mp3",
                    )
        except Exception:
            logger.warning(f"批量获取歌单歌曲 URL 失败: songlist_id={songlist_id}")

    return PlaylistSongsResponse(
        result=all_songs,
        total=total or len(all_songs),
        requestId=request_id,
    )


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
    except (LoginExpiredError, NotLoginError, RatelimitedError) as exc:
        raise _convert_credential_error(exc) from exc
    except Exception:
        logger.error(f"关键词搜索失败: keyword={keyword}", exc_info=True)
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
        # 部分歌曲 FLAC 不可用时降级为试听
        missing_mids = []
        for i, item in enumerate(items):
            if not item.url and i < len(song_mid_list):
                missing_mids.append(song_mid_list[i])
        if missing_mids:
            trial_items = await _try_get_trial_urls(missing_mids)
            trial_idx = 0
            for i, item in enumerate(items):
                if not item.url and trial_idx < len(trial_items):
                    items[i] = trial_items[trial_idx]
                    trial_idx += 1
        return SongUrlResponse(requestId=request_id, result=items)

    # FLAC 全部失败 → 匿名试听
    logger.warning("FLAC 获取失败，降级到 ACC_96 试听")
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
    except (LoginExpiredError, NotLoginError, RatelimitedError) as exc:
        raise _convert_credential_error(exc) from exc
    except Exception:
        logger.error("获取用户歌单失败", exc_info=True)
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
    except (LoginExpiredError, NotLoginError, RatelimitedError) as exc:
        raise _convert_credential_error(exc) from exc
    except Exception:
        logger.error("获取用户喜欢歌曲失败", exc_info=True)
        raise ServiceException(ErrorCode.AI_SERVICE_ERROR, "服务调用失败，请稍后重试")

    items = [_build_songlist_item(song) for song in result.songs]
    return LikedSongsResponse(result=items, total=result.total)


async def get_song_download_bundle(song_mid, request_id=""):
    """获取歌曲下载元数据包（详情+歌词+下载链接，三段网络请求并行）"""
    client = await get_client()

    detail, lyrics, song_url = await asyncio.gather(
        _fetch_bundle_detail(client, song_mid),
        _fetch_bundle_lyrics(client, song_mid),
        _fetch_bundle_song_url(song_mid, request_id),
    )

    track = detail.track
    album_info = _build_album_info(track)

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


def _convert_credential_error(exc):
    """将 SDK 凭证/限流异常转换为对应错误码的业务异常"""
    if isinstance(exc, LoginExpiredError):
        return ServiceException(ErrorCode.TOKEN_EXPIRED, "登录已过期，请重新扫码登录")
    if isinstance(exc, NotLoginError):
        return ServiceException(ErrorCode.NOT_LOGGED_IN, "请先登录")
    return ServiceException(ErrorCode.RATE_LIMITED, "操作过于频繁，请稍后重试")


async def _fetch_bundle_detail(client, song_mid):
    """获取下载包所需的歌曲详情，失败抛业务异常"""
    try:
        return await client.execute(client.song.get_detail(song_mid))
    except ServiceException:
        raise
    except (LoginExpiredError, NotLoginError, RatelimitedError) as exc:
        raise _convert_credential_error(exc) from exc
    except Exception:
        logger.error(f"获取歌曲详情失败: song_mid={song_mid}", exc_info=True)
        raise ServiceException(ErrorCode.AI_SERVICE_ERROR, "获取歌曲详情失败")


async def _fetch_bundle_lyrics(client, song_mid):
    """获取歌词文本（含翻译/音译），失败降级为空字符串"""
    try:
        lyric_result = await client.execute(client.lyric.get_lyric(song_mid, trans=True, roma=True))
        if not lyric_result:
            return ""
        decrypted = lyric_result.decrypt()
        lyrics = decrypted.lyric or ""
        if decrypted.trans:
            lyrics += "\n\n" + decrypted.trans
        if decrypted.roma:
            lyrics += "\n\n" + decrypted.roma
        return lyrics
    except Exception:
        logger.warning(f"获取歌词失败: song_mid={song_mid}")
        return ""


async def _fetch_bundle_song_url(song_mid, request_id):
    """获取歌曲下载链接，失败降级为空链接"""
    try:
        url_items = await get_song_url_list_v2([song_mid], request_id)
        if url_items and url_items.result and url_items.result[0]:
            return SongUrlInfo(
                url=url_items.result[0].url or "",
                urlType=url_items.result[0].urlType or "mp3",
            )
    except Exception:
        logger.warning(f"获取下载链接失败: song_mid={song_mid}")
    return SongUrlInfo()


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
        logger.error("FLAC 获取失败", exc_info=True)
        return None

    url_map = {}
    for item in flac_result.data:
        url = f"{CDN_DOMAIN}{item.purl}" if item.purl and getattr(item, "result", 0) == 0 else ""
        url_map[item.mid] = url
    return _build_ordered_url_items(song_mid_list, url_map)


async def _try_get_trial_urls(song_mid_list):
    """通过全局客户端请求 ACC_96 试听链接（复用已有登录凭证）"""
    client = await get_client()
    file_info = [SongFileInfo(mid=mid) for mid in song_mid_list]

    try:
        result = await client.execute(
            client.song.get_song_urls(
                file_info=file_info,
                file_type=SongFileType.ACC_96,
            )
        )
    except Exception:
        logger.warning("ACC_96 试听获取失败（部分歌曲可能没有 FLAC 且试听不可用）")
        return [SongUrlItem(url="", urlType="mp3") for _ in song_mid_list]

    url_map = {}
    for item in result.data:
        url = f"{CDN_DOMAIN}{item.purl}" if item.purl and getattr(item, "result", 0) == 0 else ""
        url_map[item.mid] = url
    return _build_ordered_url_items(song_mid_list, url_map)


def _build_ordered_url_items(song_mid_list: list[str], url_map: dict[str, str]) -> list[SongUrlItem]:
    """按输入顺序构建歌曲 URL 结果列表"""
    items = []
    for mid in song_mid_list:
        url = url_map.get(mid, "")
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
