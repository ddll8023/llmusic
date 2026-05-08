"""QQ 音乐二维码登录脚本"""
import asyncio
import json
import os
from pathlib import Path

from qqmusic_api import Client, LoginError
from qqmusic_api.models.login import QR, QRLoginType

_saved_qrcode_path: Path | None = None


def show_qrcode(qr: QR):
    """显示二维码"""
    global _saved_qrcode_path
    try:
        from io import BytesIO

        from PIL import Image
        from pyzbar.pyzbar import decode
        from qrcode import QRCode

        img = Image.open(BytesIO(qr.data))
        url = decode(img)[0].data.decode("utf-8")
        qr_console = QRCode()
        qr_console.add_data(url)
        qr_console.print_ascii()
    except ImportError:
        _saved_qrcode_path = qr.save()
        print(f"二维码已保存至: {_saved_qrcode_path}")


def _cleanup_qrcode():
    """删除已保存的二维码文件"""
    global _saved_qrcode_path
    if _saved_qrcode_path and _saved_qrcode_path.exists():
        os.remove(_saved_qrcode_path)
        _saved_qrcode_path = None


async def qrcode_login(login_type: QRLoginType):
    """二维码登录"""
    from qqmusic_api.modules.login_utils import QRCodeLoginSession

    client = Client()
    session = QRCodeLoginSession(api=client.login, login_type=login_type, timeout_seconds=180)

    try:
        qr = await session.get_qrcode()
        print(f"获取 {login_type.name} 二维码成功")
        show_qrcode(qr)

        credential = await session.wait_qrcode_login()
        print(f"登录成功! MusicID: {credential.musicid}")
        credential_json = json.dumps(credential.model_dump(), ensure_ascii=False, indent=2)
        with open("credential/credential.json", "w", encoding="utf-8") as f:
            f.write(credential_json)
        return credential

    except LoginError as e:
        print(f"登录失败: {e!s}")
    except Exception:
        raise
    finally:
        _cleanup_qrcode()


async def main():
    print("请选择登录方式:")
    print("1. QQ")
    print("2. WX")

    choice = input("请输入选项 (1/2): ").strip()

    if choice == "1":
        await qrcode_login(QRLoginType.QQ)
    elif choice == "2":
        await qrcode_login(QRLoginType.WX)
    else:
        print("无效的选项")


if __name__ == "__main__":
    asyncio.run(main())
