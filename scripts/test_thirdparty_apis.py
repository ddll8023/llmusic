"""
第三方下载源测试工具
测试 thirdpartySources.ts 中配置的下载源是否可用
"""

import requests
import json
import time

TEST_SONG_MID = "0039MnYb0qxYhV"  # QQ音乐 - 晴天

SOURCES = [
    {"id": "vkeys",  "name": "vkeys.cn",    "url": f"https://api.vkeys.cn/music/tencent/song/link?mid={TEST_SONG_MID}&quality=10"},
    {"id": "xcvts",  "name": "xcvts.cn",    "url": f"https://api.xcvts.cn/api/music/qq?mid={TEST_SONG_MID}&type=SQ无损"},
    {"id": "317ak",  "name": "317ak.cn",    "url": f"https://api.317ak.cn/api/yinyue/qqyinyue?i={TEST_SONG_MID}&br=无损&type=json&lrc=0"},
    {"id": "cyapi",  "name": "cyapi.top",   "url": f"https://cyapi.top/API/qq_music.php?mid={TEST_SONG_MID}&quality=lossless"},
]


def test_source(src: dict):
    start = time.time()
    try:
        r = requests.get(src["url"], headers={"User-Agent": "Mozilla/5.0"}, timeout=8)
        r.raise_for_status()
        data = r.json()
        dl_url = (data.get("data") or {}).get("url") or data.get("url") or ""
        ms = round((time.time() - start) * 1000)
        if dl_url:
            proto = "HTTPS" if dl_url.startswith("https") else "HTTP "
            print(f"  ✅ [{src['id']:6s}] {src['name']:12s} {ms:4d}ms {proto}")
        else:
            print(f"  ❌ [{src['id']:6s}] {src['name']:12s} {ms:4d}ms 无链接")
    except requests.Timeout:
        print(f"  ❌ [{src['id']:6s}] {src['name']:12s} 超时 8s")
    except Exception as e:
        print(f"  ❌ [{src['id']:6s}] {src['name']:12s} {type(e).__name__}")


if __name__ == "__main__":
    print(f"\n测试 MID: {TEST_SONG_MID}")
    print(f"来源: sys_vue/src/config/thirdpartySources.ts\n")
    for src in SOURCES:
        test_source(src)
    print()
