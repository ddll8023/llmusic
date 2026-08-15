"""操作日志服务：JSON Lines 落盘、查询、筛选与清理"""
import asyncio
import json
import os
import tempfile
from datetime import datetime, timedelta, timezone

from app.schemas.common import ErrorCode
from app.schemas.operation_log import OperationLogCleanupResult, OperationLogItem
from app.utils.exception import ServiceException
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

LOG_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "logs")
LOG_PATH = os.path.join(LOG_DIR, "operation.log")
CLEANUP_INTERVAL_SECONDS = 24 * 60 * 60

_lock = asyncio.Lock()


def _append_log_line(line: str) -> None:
    """同步追加一行日志。"""
    os.makedirs(LOG_DIR, exist_ok=True)
    with open(LOG_PATH, "a", encoding="utf-8") as file:
        file.write(line + "\n")


def _read_log_lines() -> list[str]:
    """同步读取日志快照。"""
    with open(LOG_PATH, "r", encoding="utf-8") as file:
        return file.readlines()


def _parse_log_time(value: object) -> datetime | None:
    """解析日志时间并转换为 UTC；无法解析时返回 None。"""
    if not isinstance(value, str) or not value.strip():
        return None

    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"

    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.astimezone()
    return parsed.astimezone(timezone.utc)


def _cleanup_log_file(retention_days: int) -> OperationLogCleanupResult:
    """同步按时间过滤日志，并原子替换日志文件。"""
    now = datetime.now().astimezone()
    cutoff = now - timedelta(days=retention_days)
    cutoff_utc = cutoff.astimezone(timezone.utc)
    result = OperationLogCleanupResult(
        retention_days=retention_days,
        cutoff_time=cutoff.isoformat(timespec="seconds"),
    )

    if not os.path.exists(LOG_PATH):
        return result

    temporary_path: str | None = None
    try:
        file_descriptor, temporary_path = tempfile.mkstemp(
            prefix=".operation.log.",
            suffix=".tmp",
            dir=LOG_DIR,
        )
        with os.fdopen(file_descriptor, "w", encoding="utf-8") as temporary_file:
            with open(LOG_PATH, "r", encoding="utf-8") as source:
                for raw_line in source:
                    if not raw_line.strip():
                        continue

                    try:
                        data = json.loads(raw_line)
                        parsed_time = _parse_log_time(data.get("time")) if isinstance(data, dict) else None
                    except (TypeError, ValueError, json.JSONDecodeError):
                        parsed_time = None

                    if parsed_time is not None and parsed_time < cutoff_utc:
                        result.deleted_count += 1
                        continue

                    temporary_file.write(raw_line if raw_line.endswith("\n") else f"{raw_line}\n")
                    result.retained_count += 1
                    if parsed_time is None:
                        result.invalid_count += 1

            temporary_file.flush()
            os.fsync(temporary_file.fileno())

        os.replace(temporary_path, LOG_PATH)
        temporary_path = None
        return result
    finally:
        if temporary_path and os.path.exists(temporary_path):
            os.unlink(temporary_path)


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
    """写入一条操作日志；写入失败不影响业务主流程。"""
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
        line = json.dumps(entry, ensure_ascii=False)
        async with _lock:
            await asyncio.to_thread(_append_log_line, line)
    except Exception:
        logger.warning("操作日志写入失败", exc_info=True)


async def list_operation_logs(
    page: int = 1,
    page_size: int = 20,
    level: str | None = None,
    log_type: str | None = None,
    keyword: str | None = None,
) -> tuple[list[OperationLogItem], int]:
    """分页读取操作日志，返回最新在前的结果列表和总条数。"""
    try:
        async with _lock:
            lines = await asyncio.to_thread(_read_log_lines)
    except (FileNotFoundError, OSError, UnicodeError):
        if not os.path.exists(LOG_PATH):
            return [], 0
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


async def cleanup_operation_logs(retention_days: int) -> OperationLogCleanupResult:
    """删除超过保留期限的日志，清理失败时返回统一业务错误。"""
    if not 7 <= retention_days <= 30:
        raise ServiceException(ErrorCode.PARAM_ERROR, "日志保留天数必须在 7 到 30 天之间")

    try:
        async with _lock:
            return await asyncio.to_thread(_cleanup_log_file, retention_days)
    except ServiceException:
        raise
    except Exception as exc:
        logger.warning("操作日志清理失败", exc_info=True)
        raise ServiceException(ErrorCode.INTERNAL_ERROR, "日志清理失败，请稍后重试") from exc


async def operation_log_cleanup_loop(retention_days: int) -> None:
    """启动后立即清理，并按天重复清理；任务取消时正常退出。"""
    while True:
        try:
            result = await cleanup_operation_logs(retention_days)
            if result.deleted_count:
                logger.info(
                    "操作日志自动清理完成: retention_days=%s deleted_count=%s",
                    retention_days,
                    result.deleted_count,
                )
        except Exception:
            logger.warning("操作日志自动清理失败", exc_info=True)
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
