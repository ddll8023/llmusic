"""QQ 音乐凭证管理"""
import json
import os

from pydantic import ValidationError
from qqmusic_api.models.request import Credential

from app.core.paths import CREDENTIAL_PATH
from app.schemas.common import ErrorCode
from app.utils.exception import ServiceException

_cached_credential: Credential | None = None
_cached_mtime: float | None = None


def get_credential():
    """从本地 JSON 文件加载凭证（文件未变时命中进程内缓存）"""
    global _cached_credential, _cached_mtime

    try:
        mtime = os.path.getmtime(CREDENTIAL_PATH)
    except OSError:
        _cached_credential = None
        _cached_mtime = None
        raise ServiceException(ErrorCode.NOT_LOGGED_IN, "请先登录")

    if _cached_credential is not None and mtime == _cached_mtime:
        return _cached_credential

    try:
        with open(CREDENTIAL_PATH, "r", encoding="utf-8") as f:
            credential = Credential.model_validate(json.load(f))
    except (OSError, json.JSONDecodeError, ValidationError):
        _cached_credential = None
        _cached_mtime = None
        raise ServiceException(ErrorCode.NOT_LOGGED_IN, "凭证无效，请重新登录")

    _cached_credential = credential
    _cached_mtime = mtime
    return credential
