"""应用运行时可写目录，并兼容旧开发目录的一次性迁移。"""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path


_APP_DATA_DIR_NAME = "LLMusic"
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_LEGACY_CREDENTIAL_PATH = Path(__file__).resolve().parents[1] / "credential" / "credential.json"
_LEGACY_LOG_PATH = _BACKEND_ROOT / "logs" / "operation.log"
_CONFIGURED_DATA_DIR = os.environ.get("APP_DATA_DIR", "").strip()


def _default_data_dir() -> Path:
    """计算与 Electron 一致的跨平台默认数据目录。"""
    home = Path.home()
    if sys.platform == "darwin":
        return home / "Library" / "Application Support" / _APP_DATA_DIR_NAME
    if os.name == "nt":
        return Path(os.environ.get("APPDATA", home / "AppData" / "Roaming")) / _APP_DATA_DIR_NAME
    return Path(os.environ.get("XDG_CONFIG_HOME", home / ".config")) / _APP_DATA_DIR_NAME


def _move_legacy_file(source: Path, target: Path) -> None:
    """目标不存在时移动旧运行时文件；目标已有内容时不覆盖。"""
    if not source.exists() or source.resolve() == target.resolve():
        return
    if target.exists():
        print(f"[Paths] 目标文件已存在，保留旧文件待人工处理: {source}")
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source), str(target))
    print(f"[Paths] 已迁移旧运行时文件: {source} -> {target}")


DATA_DIR = Path(_CONFIGURED_DATA_DIR).expanduser() if _CONFIGURED_DATA_DIR else _default_data_dir()
CREDENTIAL_DIR = DATA_DIR / "credential"
LOG_DIR = DATA_DIR / "logs"
CREDENTIAL_PATH = str(CREDENTIAL_DIR / "credential.json")
LOG_PATH = str(LOG_DIR / "operation.log")

# 开发模式旧目录只在目标不存在时迁移，避免覆盖用户已经产生的新数据。
_move_legacy_file(_LEGACY_CREDENTIAL_PATH, Path(CREDENTIAL_PATH))
_move_legacy_file(_LEGACY_LOG_PATH, Path(LOG_PATH))
