"""FastAPI 应用入口"""
import asyncio
import json
import time
from contextlib import asynccontextmanager, suppress

import uvicorn
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.operation_log import router as operation_log_router
from app.api.qqmusic import router as qqmusic_router
from app.core.config import settings
from app.qqmusic.client import reset_client
from app.schemas.common import ErrorCode
from app.schemas.response import error
from app.services import auth as services_auth
from app.services import operation_log as services_operation_log
from app.utils.exception import ServiceException
from app.utils.logger import setup_logger

logger = setup_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await services_auth.ensure_credential_fresh()
    cleanup_task = asyncio.create_task(
        services_operation_log.operation_log_cleanup_loop(settings.operation_log_retention_days)
    )
    try:
        yield
    finally:
        cleanup_task.cancel()
        with suppress(asyncio.CancelledError):
            await cleanup_task
        await reset_client()


app = FastAPI(title="LLMusic API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(qqmusic_router, prefix="/api/v1/qqmusic")
app.include_router(operation_log_router, prefix="/api/v1/operation-log")


@app.middleware("http")
async def operation_log_middleware(request: Request, call_next):
    """业务请求前自动刷新凭证，并记录重要网络请求"""
    path = request.url.path

    if path.startswith("/api/v1/qqmusic"):
        await services_auth.ensure_credential_fresh()

    if path.startswith("/api/v1/qqmusic") and not path.startswith("/api/v1/operation-log"):
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = int((time.perf_counter() - start) * 1000)

        error_code = 0
        try:
            body = json.loads(response.body) if getattr(response, "body", None) else {}
            if isinstance(body, dict):
                error_code = body.get("code", 0)
        except Exception:
            error_code = 0

        await services_operation_log.log_operation(
            level="ERROR" if response.status_code >= 400 or error_code else "INFO",
            log_type="request",
            action=f"{request.method} {path}",
            message="请求完成" if response.status_code < 400 and not error_code else "请求异常",
            status=response.status_code,
            duration_ms=duration_ms,
            error_code=error_code,
        )
        return response

    return await call_next(request)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.exception_handler(ServiceException)
async def service_exception_handler(request: Request, exc: ServiceException):
    return JSONResponse(
        status_code=200,
        content=error(code=exc.code, message=exc.message),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning(f"请求参数校验失败: path={request.url.path} errors={exc.errors()}")
    return JSONResponse(
        status_code=200,
        content=error(code=ErrorCode.PARAM_ERROR, message="参数错误"),
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"未处理异常: path={request.url.path} error={exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content=error(code=ErrorCode.INTERNAL_ERROR, message="系统内部错误"),
    )


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )
