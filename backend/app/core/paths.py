"""应用运行时可写目录。"""
from __future__ import annotations

import os
import sys
from pathlib import Path


_APP_DATA_DIR_NAME = "LLMusic"
_CONFIGURED_DATA_DIR = os.environ.get("APP_DATA_DIR", "").strip()


def _default_data_dir() -> Path:
    """计算与 Electron 一致的跨平台默认数据目录。"""
    home = Path.home()
    if sys.platform == "darwin":
        return home / "Library" / "Application Support" / _APP_DATA_DIR_NAME
    if os.name == "nt":
        return Path(os.environ.get("APPDATA", home / "AppData" / "Roaming")) / _APP_DATA_DIR_NAME
    return Path(os.environ.get("XDG_CONFIG_HOME", home / ".config")) / _APP_DATA_DIR_NAME


DATA_DIR = Path(_CONFIGURED_DATA_DIR).expanduser() if _CONFIGURED_DATA_DIR else _default_data_dir()
CREDENTIAL_DIR = DATA_DIR / "credential"
LOG_DIR = DATA_DIR / "logs"
CREDENTIAL_PATH = str(CREDENTIAL_DIR / "credential.json")
LOG_PATH = str(LOG_DIR / "operation.log")
