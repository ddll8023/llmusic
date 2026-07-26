"""QQ Music API 客户端管理"""
import asyncio

from qqmusic_api import Client
from qqmusic_api.models.request import Credential

from app.credential.get_credential import get_credential
from app.schemas.common import ErrorCode
from app.utils.exception import ServiceException
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

_client: Client | None = None
_client_lock = asyncio.Lock()


async def get_client():
    """获取全局 Client 单例（并发安全）"""
    global _client
    if _client is not None:
        return _client

    async with _client_lock:
        if _client is not None:
            return _client
        try:
            credential = get_credential()
        except ServiceException as e:
            if e.code == ErrorCode.NOT_LOGGED_IN.value:
                credential = Credential()
                logger.warning("未找到 QQ 音乐登录凭证，使用匿名客户端（部分功能受限）")
            else:
                raise
        _client = Client(credential=credential)
    return _client


async def refresh_client(credential: Credential):
    """登录成功后刷新 Client 单例"""
    global _client
    async with _client_lock:
        if _client is not None:
            try:
                await _client.close()
            except Exception:
                logger.warning("关闭旧 Client 失败，继续创建新实例", exc_info=True)
        _client = Client(credential=credential)


async def reset_client():
    """退出登录或应用关闭时关闭并重置 Client 单例"""
    global _client
    async with _client_lock:
        if _client is not None:
            try:
                await _client.close()
            except Exception:
                logger.warning("关闭 Client 失败", exc_info=True)
            _client = None
