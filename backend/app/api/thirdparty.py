"""第三方下载源 API — 测试 + 获取播放链接"""
import time
from fastapi import APIRouter
import httpx

from app.schemas.response import error, success
from app.utils.exception import ServiceException

router = APIRouter()


@router.post("/thirdparty/test-source")
async def test_source(req: dict):
    """测试第三方下载源是否可用"""
    url_template = req.get("url", "")
    song_mid = req.get("songMid", "")
    if not url_template or not song_mid:
        return error(code=1001, message="参数缺失")

    url = url_template.replace("{songMid}", song_mid).replace("{songId}", song_mid)
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            r = await c.get(url, headers={"User-Agent": "Mozilla/5.0"})
            r.raise_for_status()
            data = r.json()
        dl_url = (data.get("data") or {}).get("url") or data.get("url") or ""
        ok = bool(dl_url)
    except Exception:
        ok = False
    ms = int((time.time() - start) * 1000)
    return success(data={"ok": ok, "ms": ms})


@router.post("/thirdparty/get-url")
async def get_url(req: dict):
    """代理获取第三方下载链接（解决前端 CORS 问题）"""
    url_template = req.get("url", "")
    song_mid = req.get("songMid", "")
    if not url_template or not song_mid:
        return error(code=1001, message="参数缺失")

    url = url_template.replace("{songMid}", song_mid).replace("{songId}", song_mid)
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.get(url, headers={"User-Agent": "Mozilla/5.0"})
            r.raise_for_status()
            data = r.json()
        dl_url = (data.get("data") or {}).get("url") or data.get("url") or ""
        if dl_url:
            dl_url = dl_url.replace("http://", "https://")
            return success(data={"url": dl_url, "urlType": "flac" if ".flac" in dl_url.lower() else "mp3"})
    except Exception:
        pass
    return error(code=5001, message="获取播放链接失败")


@router.post("/thirdparty/validate-url")
async def validate_url(req: dict):
    """验证第三方下载链接是否可访问"""
    url = req.get("url", "")
    if not url:
        return error(code=1001, message="参数缺失")
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.head(url, headers={"User-Agent": "Mozilla/5.0"})
        return success(data={"ok": r.status_code < 400, "status": r.status_code})
    except Exception:
        return success(data={"ok": False, "status": 0})
