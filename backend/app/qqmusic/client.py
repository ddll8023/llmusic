"""QQ Music API 客户端管理"""
from qqmusic_api import Client
from qqmusic_api.models.request import Credential

from app.credential.get_credential import get_credential

_client: Client | None = None


async def get_client():
    """获取全局 Client 单例"""
    global _client
    if _client is None:
        credential = get_credential()
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
