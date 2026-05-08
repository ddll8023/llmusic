"""QQ 音乐登录认证 Schema"""
from pydantic import BaseModel, Field


# ========== 请求类（Request）==========


class QRCodeRequest(BaseModel):
    login_type: str = Field(default="qq", description="登录方式: qq 或 wx")


# ========== 响应类（Response）==========


class QRCodeResponse(BaseModel):
    session_id: str = Field(description="登录会话 ID")
    qrcode_base64: str = Field(description="二维码图片 base64 编码")
    login_type: str = Field(description="登录方式")


class LoginStatusResponse(BaseModel):
    is_logged_in: bool = False
    music_id: int = 0
    encrypt_uin: str = ""
    login_type: int = 0
    is_expired: bool = False


class QRCheckResponse(BaseModel):
    status: str = Field(description="登录状态: waiting/scanned/confirmed/done/expired/error")
    message: str = ""
