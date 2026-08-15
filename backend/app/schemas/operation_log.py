"""操作日志数据模型"""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class OperationLogListRequest(BaseModel):
    """操作日志分页查询请求"""
    page: int = Field(default=1, ge=1, description="页码")
    page_size: int = Field(default=20, ge=1, le=100, description="每页数量")
    level: Literal["INFO", "WARNING", "ERROR"] | None = Field(default=None, description="日志级别筛选")
    log_type: Literal["request", "auth"] | None = Field(default=None, description="日志类型筛选")
    keyword: str | None = Field(default=None, max_length=200, description="关键词筛选")


class OperationLogItem(BaseModel):
    """单条操作日志"""
    time: str = Field(default="", description="ISO 8601 时间")
    level: str = Field(default="INFO", description="日志级别")
    type: str = Field(default="", description="日志类型")
    action: str = Field(default="", description="动作描述")
    message: str = Field(default="", description="日志内容")
    status: int | None = Field(default=None, description="HTTP 状态码")
    duration_ms: int | None = Field(default=None, description="请求耗时毫秒")
    error_code: int | None = Field(default=None, description="业务错误码")
    detail: dict = Field(default_factory=dict, description="补充信息")

    model_config = ConfigDict(from_attributes=True)
