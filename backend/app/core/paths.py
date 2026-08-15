"""应用运行时可写目录。"""
from __future__ import annotations

import os
from pathlib import Path


_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_CONFIGURED_DATA_DIR = os.environ.get("APP_DATA_DIR", "").strip()

if _CONFIGURED_DATA_DIR:
    DATA_DIR = Path(_CONFIGURED_DATA_DIR).expanduser()
    CREDENTIAL_DIR = DATA_DIR / "credential"
    LOG_DIR = DATA_DIR / "logs"
else:
    # 保留开发模式下原有的仓库内数据位置。
    DATA_DIR = _BACKEND_ROOT
    CREDENTIAL_DIR = Path(__file__).resolve().parents[1] / "credential"
    LOG_DIR = _BACKEND_ROOT / "logs"

CREDENTIAL_PATH = str(CREDENTIAL_DIR / "credential.json")
LOG_PATH = str(LOG_DIR / "operation.log")
