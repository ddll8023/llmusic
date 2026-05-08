"""QQ 音乐凭证管理"""
import json
import os

from qqmusic_api.models.request import Credential

from app.schemas.common import ErrorCode
from app.utils.exception import ServiceException


def get_credential():
    """从本地 JSON 文件加载凭证"""
    try:
        credential_path = os.path.join(os.path.dirname(__file__), "credential.json")
        with open(credential_path, "r", encoding="utf-8") as f:
            credential_dict = json.loads(f.read())
        return Credential.model_validate(credential_dict)
    except FileNotFoundError:
        raise ServiceException(ErrorCode.NOT_LOGGED_IN, "请先登录")
