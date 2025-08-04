# import asyncio
# import sys

# from qqmusic_api.login_utils import PhoneLogin, PhoneLoginEvents


# async def phone_login():
#     phone = input("请输入手机号码")
#     login = PhoneLogin(int(phone))
#     while 1:
#         state = await login.send_authcode()
#         if state == PhoneLoginEvents.SEND:
#             print("发送成功")
#             break
#         if state == PhoneLoginEvents.CAPTCHA:
#             if login.auth_url is None:
#                 print("获取滑块验证链接失败")
#                 return
#             print("需要滑块验证", login.auth_url)
#             if sys.platform == "win32":
#                 await asyncio.create_subprocess_exec(
#                     "start", login.auth_url, shell=False
#                 )
#             elif sys.platform == "darwin":
#                 await asyncio.create_subprocess_exec("open", login.auth_url)
#             else:
#                 await asyncio.create_subprocess_exec("xdg-open", login.auth_url)
#             print("验证后回车")
#             await asyncio.sleep(0)
#         else:
#             print("未知情况", login.error_msg)
#             return
#     code = int(input("请输入验证码"))
#     credential = await login.authorize(code)
#     print(credential)
#     credential_json = credential.as_json()
#     with open("credential.json", "w") as f:
#         f.write(credential_json)


# asyncio.run(phone_login())


import asyncio

from qqmusic_api.login import (
    QR,
    LoginError,
    QRCodeLoginEvents,
    QRLoginType,
    check_qrcode,
    get_qrcode,
)


def show_qrcode(qr: QR):
    """显示二维码"""
    try:
        from io import BytesIO

        from PIL import Image
        from pyzbar.pyzbar import decode
        from qrcode import QRCode  # type: ignore

        img = Image.open(BytesIO(qr.data))
        url = decode(img)[0].data.decode("utf-8")
        qr = QRCode()
        qr.add_data(url)
        qr.print_ascii()
    except ImportError:
        # 保存二维码到当前目录
        save_path = qr.save()
        print(f"二维码已保存至: {save_path}")


async def qrcode_login_example(login_type: QRLoginType):
    """二维码登录示例"""

    try:
        # 1. 获取二维码
        qr = await get_qrcode(login_type)
        print(f"获取 {login_type.name} 二维码成功")

        show_qrcode(qr)

        # 2. 轮询检查扫码状态
        while True:
            event, credential = await check_qrcode(qr)
            print(f"当前状态: {event.name}")

            if event == QRCodeLoginEvents.DONE:
                print(f"登录成功! MusicID: {credential.musicid}")
                print(credential)
                credential_json = credential.as_json()
                with open("credential/credential.json", "w") as f:
                    f.write(credential_json)
                return credential
            if event == QRCodeLoginEvents.TIMEOUT:
                print("二维码已过期,请重新获取")
                break
            if event == QRCodeLoginEvents.SCAN:
                await asyncio.sleep(5)  # 5秒轮询一次
            else:
                await asyncio.sleep(2)

    except LoginError as e:
        print(f"登录失败: {e!s}")
    except Exception:
        raise


async def main():
    print("请选择登录方式:")
    print("1. QQ")
    print("2. WX")

    choice = input("请输入选项 (1/2): ").strip()

    if choice == "1":
        await qrcode_login_example(QRLoginType.QQ)
    elif choice == "2":
        await qrcode_login_example(QRLoginType.WX)
    else:
        print("无效的选项")


if __name__ == "__main__":
    asyncio.run(main())
# import asyncio

# from qqmusic_api.login import (
#     LoginError,
#     PhoneLoginEvents,
#     phone_authorize,
#     send_authcode,
# )


# async def phone_login_example():
#     """手机验证码登录示例"""
#     phone = 17385716325
#     country_code = 86

#     try:
#         # 1. 发送验证码
#         event, info = await send_authcode(phone, country_code)

#         if event == PhoneLoginEvents.CAPTCHA:
#             print(f"需要验证,访问链接: {info}")
#             return None
#         if event == PhoneLoginEvents.FREQUENCY:
#             print("操作过于频繁,请稍后再试")
#             return None

#         print("验证码已发送")

#         # 2. 获取用户输入
#         auth_code = input("请输入验证码: ").strip()

#         # 3. 执行登录
#         credential = await phone_authorize(phone, int(auth_code), country_code)
#         print(f"登录成功! MusicID: {credential.musicid}")
#         print(credential)
#         credential_json = credential.as_json()
#         with open("credential.json", "w") as f:
#             f.write(credential_json)
#         return credential

#     except LoginError as e:
#         print(f"登录失败: {e!s}")
#     except ValueError:
#         print("验证码必须为6位数字")
#     except Exception as e:
#         print(f"发生未知错误: {e!s}")


# asyncio.run(phone_login_example())
