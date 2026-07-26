"""QQ 音乐登录认证服务"""
import asyncio
import base64
import json
import os
import time
import uuid
from dataclasses import dataclass, field

from qqmusic_api import Client
from qqmusic_api.models.login import QRCodeLoginEvents, QRLoginType
from qqmusic_api.models.request import Credential
from qqmusic_api.modules.login_utils import QRCodeLoginSession

from app.qqmusic.client import get_client, refresh_client, reset_client
from app.schemas.common import ErrorCode
from app.utils.exception import ServiceException
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

CREDENTIAL_DIR = os.path.join(os.path.dirname(__file__), "..", "credential")
CREDENTIAL_PATH = os.path.join(CREDENTIAL_DIR, "credential.json")

QR_SESSION_TIMEOUT_SECONDS = 180
CREDENTIAL_REFRESH_AHEAD_SECONDS = 21600

_EVENT_STATUS_MAP = {
    QRCodeLoginEvents.SCAN: "scanned",
    QRCodeLoginEvents.CONF: "confirmed",
    QRCodeLoginEvents.DONE: "done",
    QRCodeLoginEvents.TIMEOUT: "expired",
    QRCodeLoginEvents.REFUSE: "error",
    QRCodeLoginEvents.OTHER: "error",
}

_LOGIN_TYPE_MAP = {
    "qq": QRLoginType.QQ,
    "wx": QRLoginType.WX,
}


@dataclass
class _LoginSession:
    session_id: str
    login_type: str
    sdk_session: QRCodeLoginSession
    latest_event: str = "waiting"
    message: str = ""
    credential_dict: dict | None = None
    created_at: float = field(default_factory=time.time)
    task: asyncio.Task | None = None


_active_sessions: dict[str, _LoginSession] = {}


# ========== 公共入口函数 ==========


async def get_login_status():
    """查询当前登录状态及凭证是否过期"""
    await ensure_credential_fresh()

    if not os.path.exists(CREDENTIAL_PATH):
        return {"is_logged_in": False, "music_id": 0, "encrypt_uin": "", "login_type": 0, "is_expired": False}

    try:
        with open(CREDENTIAL_PATH, "r", encoding="utf-8") as f:
            credential_dict = json.loads(f.read())
    except (json.JSONDecodeError, OSError):
        return {"is_logged_in": False, "music_id": 0, "encrypt_uin": "", "login_type": 0, "is_expired": False}

    credential = Credential.model_validate(credential_dict)

    return {
        "is_logged_in": True,
        "music_id": credential.musicid or 0,
        "encrypt_uin": credential.encrypt_uin or "",
        "login_type": credential.login_type or 0,
        "is_expired": False,
    }


async def check_credential_expired():
    """检测已存储的凭证是否过期"""
    if not os.path.exists(CREDENTIAL_PATH):
        return False

    try:
        with open(CREDENTIAL_PATH, "r", encoding="utf-8") as f:
            credential_dict = json.loads(f.read())
        credential = Credential.model_validate(credential_dict)

        client = await get_client()
        return await client.login.check_expired(credential)
    except Exception:
        return True


async def ensure_credential_fresh():
    """检测本地凭证有效期，已过期或临近过期时调用 SDK 刷新并原子写盘"""
    if not os.path.exists(CREDENTIAL_PATH):
        return

    try:
        with open(CREDENTIAL_PATH, "r", encoding="utf-8") as f:
            credential = Credential.model_validate(json.load(f))
    except Exception:
        logger.warning("凭证文件解析失败，跳过自动刷新")
        return

    if not credential.musickey_create_time or not credential.key_expires_in:
        return

    now = int(time.time())
    expires_at = credential.musickey_create_time + credential.key_expires_in
    if now < expires_at - CREDENTIAL_REFRESH_AHEAD_SECONDS:
        return

    client = await get_client()
    try:
        new_credential = await client.login.refresh_credential(credential)
    except Exception as exc:
        logger.warning(f"凭证自动刷新失败，请重新扫码登录: error={exc}")
        return

    _write_credential_file(new_credential.model_dump())
    await refresh_client(new_credential)
    logger.info(f"凭证自动刷新成功: musicid={new_credential.musicid}")


async def create_qrcode_session(login_type: str):
    """创建二维码登录会话"""
    _cleanup_all_sessions()

    qr_type = _LOGIN_TYPE_MAP.get(login_type)
    if qr_type is None:
        raise ServiceException(ErrorCode.PARAM_ERROR, "不支持的登录方式")

    client = Client()
    sdk_session = QRCodeLoginSession(
        api=client.login, login_type=qr_type, timeout_seconds=QR_SESSION_TIMEOUT_SECONDS
    )

    try:
        qr = await sdk_session.get_qrcode()
    except Exception as e:
        logger.error(f"获取二维码失败: login_type={login_type} error={e}", exc_info=True)
        raise ServiceException(ErrorCode.AI_SERVICE_ERROR, "获取二维码失败，请稍后重试") from e

    session_id = uuid.uuid4().hex
    qrcode_base64 = base64.b64encode(qr.data).decode("utf-8")

    session = _LoginSession(
        session_id=session_id,
        login_type=login_type,
        sdk_session=sdk_session,
    )
    _active_sessions[session_id] = session

    task = asyncio.create_task(_poll_qrcode_events(session))
    session.task = task

    logger.info(f"创建二维码登录会话: session_id={session_id} login_type={login_type}")

    return {
        "session_id": session_id,
        "qrcode_base64": qrcode_base64,
        "login_type": login_type,
    }


async def check_qrcode_status(session_id: str):
    """查询二维码登录状态"""
    session = _active_sessions.get(session_id)
    if session is None:
        raise ServiceException(ErrorCode.PARAM_ERROR, "会话不存在或已过期")

    result = {
        "status": session.latest_event,
        "message": session.message,
    }

    if session.latest_event == "done" and session.credential_dict:
        logger.info(f"扫码登录成功: session_id={session_id} musicid={session.credential_dict.get('musicid', 0)}")
        await _persist_credential(session.credential_dict)
        _cleanup_all_sessions()

    return result


async def logout():
    """退出登录"""
    _cleanup_all_sessions()

    if os.path.exists(CREDENTIAL_PATH):
        try:
            os.remove(CREDENTIAL_PATH)
        except OSError:
            logger.warning("删除凭证文件失败", exc_info=True)

    await reset_client()
    logger.info("已退出登录并重置客户端")


"""辅助函数"""


def _map_event_to_status(event: QRCodeLoginEvents) -> tuple[str, str]:
    """将 SDK 事件枚举映射为前端状态字符串"""
    status = _EVENT_STATUS_MAP.get(event, "error")
    message_map = {
        "waiting": "",
        "scanned": "已扫码，请在手机上确认",
        "confirmed": "已确认，正在登录...",
        "done": "登录成功",
        "expired": "二维码已过期，请重新获取",
        "error": "登录失败，请重试",
    }
    return status, message_map.get(status, "")


async def _poll_qrcode_events(session: _LoginSession):
    """后台 Task：迭代 SDK 事件流并更新内存状态"""
    try:
        async for result in session.sdk_session:
            status, message = _map_event_to_status(result.event)
            session.latest_event = status
            session.message = message

            if result.event == QRCodeLoginEvents.DONE and result.credential:
                session.credential_dict = result.credential.model_dump()

            if status in ("done", "expired", "error"):
                break
    except Exception as exc:
        session.latest_event = "error"
        session.message = "登录过程中发生异常"
        logger.error(f"二维码轮询异常: session_id={session.session_id} error={exc}", exc_info=True)


def _write_credential_file(credential_dict: dict):
    """原子写入凭证文件（tmp + os.replace）"""
    os.makedirs(CREDENTIAL_DIR, exist_ok=True)
    tmp_path = CREDENTIAL_PATH + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(credential_dict, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, CREDENTIAL_PATH)


async def _persist_credential(credential_dict: dict):
    """将凭证原子写盘并刷新 Client 单例"""
    _write_credential_file(credential_dict)
    logger.info(f"登录凭证已写盘: musicid={credential_dict.get('musicid', 0)}")

    try:
        credential = Credential.model_validate(credential_dict)
        await refresh_client(credential)
    except Exception:
        logger.error("刷新 Client 单例失败", exc_info=True)


def _cleanup_all_sessions():
    """清理所有活跃会话"""
    for session in _active_sessions.values():
        if session.task and not session.task.done():
            session.task.cancel()
    _active_sessions.clear()
