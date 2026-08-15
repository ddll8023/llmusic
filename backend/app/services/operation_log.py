"""操作日志服务：JSON Lines 落盘、查询与筛选"""
import asyncio
import json
import os
from datetime import datetime

from app.schemas.operation_log import OperationLogItem
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

LOG_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "logs")
LOG_PATH = os.path.join(LOG_DIR, "operation.log")

_lock = asyncio.Lock()


async def log_operation(
    *,
    level: str = "INFO",
    log_type: str,
    action: str,
    message: str = "",
    status: int | None = None,
    duration_ms: int | None = None,
    error_code: int | None = None,
    detail: dict | None = None,
) -> None:
    """写入一条操作日志；写入失败不影响业务主流程"""
    entry = {
        "time": datetime.now().astimezone().isoformat(timespec="seconds"),
        "level": level,
        "type": log_type,
        "action": action,
        "message": message,
        "status": status,
        "duration_ms": duration_ms,
        "error_code": error_code,
        "detail": detail or {},
    }

    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        line = json.dumps(entry, ensure_ascii=False)
        async with _lock:
            with open(LOG_PATH, "a", encoding="utf-8") as f:
                f.write(line + "\n")
    except Exception:
        logger.warning("操作日志写入失败", exc_info=True)


async def list_operation_logs(
    page: int = 1,
    page_size: int = 20,
    level: str | None = None,
    log_type: str | None = None,
    keyword: str | None = None,
) -> tuple[list[OperationLogItem], int]:
    """分页读取操作日志，返回最新在前的结果列表和总条数"""
    if not os.path.exists(LOG_PATH):
        return [], 0

    try:
        with open(LOG_PATH, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except OSError:
        logger.warning("操作日志读取失败", exc_info=True)
        return [], 0

    items: list[OperationLogItem] = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
            items.append(OperationLogItem.model_validate(data))
        except Exception:
            # 单行损坏跳过，不影响其他日志
            continue

    items.reverse()

    if level:
        items = [item for item in items if item.level == level]
    if log_type:
        items = [item for item in items if item.type == log_type]
    if keyword:
        keyword_lower = keyword.lower()
        filtered = []
        for item in items:
            haystack = f"{item.action} {item.message} {json.dumps(item.detail, ensure_ascii=False)}"
            if keyword_lower in haystack.lower():
                filtered.append(item)
        items = filtered

    total = len(items)
    start = (page - 1) * page_size
    return items[start : start + page_size], total
