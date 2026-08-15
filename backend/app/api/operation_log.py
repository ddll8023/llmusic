"""操作日志 API 路由"""
import math

from fastapi import APIRouter

from app.schemas.common import ApiResponse, PaginatedResponse, PaginationInfo
from app.schemas.operation_log import OperationLogItem, OperationLogListRequest
from app.schemas.response import success
from app.services import operation_log as services_operation_log

router = APIRouter()


@router.post("/list", response_model=ApiResponse[PaginatedResponse[OperationLogItem]])
async def list_operation_logs(req: OperationLogListRequest):
    """分页查询操作日志"""
    items, total = await services_operation_log.list_operation_logs(
        page=req.page,
        page_size=req.page_size,
        level=req.level,
        log_type=req.log_type,
        keyword=req.keyword,
    )
    total_pages = math.ceil(total / req.page_size) if total else 0
    return success(
        data=PaginatedResponse(
            lists=items,
            pagination=PaginationInfo(
                page=req.page,
                page_size=req.page_size,
                total=total,
                total_pages=total_pages,
            ),
        )
    )
