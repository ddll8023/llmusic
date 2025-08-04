from qqmusic_api.song import SongFileType, get_detail,get_song_urls,EncryptedSongFileType
import json
import os
from credential.get_credential import get_credential
from qqmusic_api.songlist import get_songlist


async def search_song(song_id: int):
    # 获取歌曲详情
    song_detail = await get_detail(song_id)
    # 保存到临时json文件
    temp_path = os.path.join(os.path.dirname(__file__), "temp_song_detail.json")
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(song_detail, f, ensure_ascii=False, indent=2)
    # print(f"song_detail: {song_detail}")

    song_mid = song_detail.get("track_info").get("mid")
    credential = get_credential()
    # 获取歌曲下载链接
    song_urls = await get_song_urls(mid=[song_mid],file_type= SongFileType.FLAC,credential=credential)
    print(f"song_urls: {song_urls}")

    try:
        genre: str = " / ".join(
            item["value"]
            for item in song_detail["info"]["genre"]["content"]
        )
    except KeyError:
        genre: str = ""

    lan: str = " / ".join(
        item["value"] for item in song_detail["info"]["lan"]["content"]
    )
    album_id: int = song_detail["track_info"]["album"]["id"]
    album_mid: str = song_detail["track_info"]["album"]["mid"]
    album_name: str = song_detail["track_info"]["album"]["title"]
    album: dict = {
        "albumId": album_id,
        "albumMid": album_mid,
        "albumName": album_name,
        "albumCoverUrl": "",
    }
    song_mid: str = song_detail["track_info"]["mid"]
    singer: str = " / ".join(
        item["title"] for item in song_detail["track_info"]["singer"]
    )
    create_time: str = song_detail["track_info"]["time_public"]
    song_name: str = song_detail["track_info"]["title"]
    duration: int = song_detail["track_info"]["interval"]
    dur_min = duration // 60
    dur_sec = duration % 60
    duration_str: str = f"{dur_min:02d}:{dur_sec:02d}"
    data = {
        "result": [
            {
                "songId": song_id,
                "songMid": song_mid,
                "songName": song_name,
                "singer": singer,
                "genre": genre,
                "lan": lan,
                "createTime": create_time,
                "album": album,
                "duration": duration_str,
                "songUrl": "",
            }
        ],
        "total": 1,
    }
    return data

async def search_songlist(songlist_id:int, page: int = 1, page_size: int = 10, request_id: str = '0'):
    songlist = await get_songlist(songlist_id)
    # 保存到临时json文件
    temp_path = os.path.join(os.path.dirname(__file__), "temp_song_detail.json")
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(songlist, f, ensure_ascii=False, indent=2)
    # print(f"songlist: {songlist}")

    # 计算分页
    total = len(songlist)
    start_idx = (page - 1) * page_size
    end_idx = min(start_idx + page_size, total)
    print(f"total: {total}, start_idx: {start_idx}, end_idx: {end_idx}")
    current_page_data = songlist[start_idx:end_idx]
    print(f"current_page_data: {current_page_data}")
    data = {
        "result": [],
        "total": total,
        "requestId": request_id,
    }

    for song in current_page_data:
        song_id: int = song["id"]
        song_mid: str = song["mid"]
        song_name: str = song["title"]
        singer: str = ",".join(item["title"] for item in song["singer"])
        # genre: str = " / ".join(item["value"] for item in song["genre"])
        # lan: str = " / ".join(item["value"] for item in song["lan"])
        genre: str = ""
        lan: str = ""
        create_time: str = song["time_public"]
        album_id: int = song["album"]["id"]
        album_mid: str = song["album"]["mid"]
        album_name: str = song["album"]["title"]
        album_cover_url: str = ""
        duration: int = song["interval"]
        dur_min = duration // 60
        dur_sec = duration % 60
        duration_str: str = f"{dur_min:02d}:{dur_sec:02d}"
        album = {
            "albumId": album_id,
            "albumMid": album_mid,
            "albumName": album_name,
            "albumCoverUrl": album_cover_url,
        }
        data["result"].append(
            {
                "songId": song_id,
                "songMid": song_mid,
                "songName": song_name,
                "singer": singer,
                "genre": genre,
                "lan": lan,
                "createTime": create_time,
                "album": album,
                "duration": duration_str,
                "songUrl": {"url:": "", "urlType": "flac"},
            }
        )
    return data

async def get_song_url_list(song_mid_list:list,file_type,credential):
    song_urls = await get_song_urls(mid=song_mid_list,file_type=file_type,credential=credential)
    # 保存到临时json文件
    temp_path = os.path.join(os.path.dirname(__file__), "temp_song_urls.json")
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(song_urls, f, ensure_ascii=False, indent=2)
    return song_urls
