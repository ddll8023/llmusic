"""QQ 音乐登录认证 API"""
from fastapi import APIRouter

from app.schemas import auth as schemas_auth
from app.schemas.common import ApiResponse
from app.schemas.response import error, success
from app.services import auth as services_auth
from app.utils.exception import ServiceException

router = APIRouter()


@router.get("/status", response_model=ApiResponse)
async def get_login_status():
    """查询当前登录状态"""
    try:
        result = services_auth.get_login_status()
        if result["is_logged_in"]:
            is_expired = await services_auth.check_credential_expired()
            result["is_expired"] = is_expired
        return success(data=result)
    except ServiceException as e:
        return error(code=e.code, message=e.message)


@router.post("/qrcode", response_model=ApiResponse)
async def create_qrcode(req: schemas_auth.QRCodeRequest):
    """创建二维码登录会话"""
    try:
        result = await services_auth.create_qrcode_session(req.login_type)
        return success(data=result)
    except ServiceException as e:
        return error(code=e.code, message=e.message)


@router.get("/check", response_model=ApiResponse)
async def check_qrcode(session_id: str):
    """查询二维码登录状态"""
    try:
        result = await services_auth.check_qrcode_status(session_id)
        return success(data=result)
    except ServiceException as e:
        return error(code=e.code, message=e.message)


@router.post("/logout", response_model=ApiResponse)
async def logout():
    """退出登录"""
    try:
        await services_auth.logout()
        return success(message="已退出登录")
    except ServiceException as e:
        return error(code=e.code, message=e.message)
