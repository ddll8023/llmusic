"""QQ Music API 客户端管理"""
import logging

from qqmusic_api import Client
from qqmusic_api.models.request import Credential

from app.credential.get_credential import get_credential
from app.schemas.common import ErrorCode
from app.utils.exception import ServiceException

_client: Client | None = None


async def get_client():
    """获取全局 Client 单例"""
    global _client
    if _client is None:
        try:
            credential = get_credential()
        except ServiceException as e:
            if e.code == ErrorCode.NOT_LOGGED_IN.value:
                credential = Credential()
                logging.warning("未找到 QQ 音乐登录凭证，使用匿名客户端（部分功能受限）")
            else:
                raise
        _client = Client(credential=credential)
    return _client


async def refresh_client(credential: Credential):
    """登录成功后刷新 Client 单例"""
    global _client
    if _client is not None:
        await _client.close()
    _client = Client(credential=credential)


def reset_client():
    """退出登录时重置 Client 单例"""
    global _client
    _client = None
