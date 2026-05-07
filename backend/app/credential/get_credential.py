import json
import os
from qqmusic_api import Credential


def get_credential():
    try:
        credential_path = os.path.join(os.path.dirname(__file__), "credential.json")
        # print(f"credential_path:{credential_path}")
        with open(credential_path, "r") as f:
            credential_json = f.read()
            credential_dict = json.loads(credential_json)
        credential = Credential.from_cookies_dict(credential_dict)
        return credential
    except FileNotFoundError:
        print("请先登录")
        exit(1)


def judge_credential():
    credential = get_credential()
    print(f"credential:{credential}")
    print(f"credential是否有效:{Credential.raise_for_invalid(credential)}")
    # print(f"credential是否能刷新:{sync(credential.can_refresh())}")
    # print(f"credential刷新:{sync(credential.refresh())}")
    # print(f"credential是否过期:{sync(Credential.is_expired(credential))}")


get_credential()
#
