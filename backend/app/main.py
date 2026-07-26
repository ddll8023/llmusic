"""FastAPI 应用入口"""
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.qqmusic import router as qqmusic_router
from app.core.config import settings
from app.qqmusic.client import reset_client
from app.schemas.common import ErrorCode
from app.schemas.response import error
from app.services import auth as services_auth
from app.utils.exception import ServiceException
from app.utils.logger import setup_logger

logger = setup_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await services_auth.ensure_credential_fresh()
    yield
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
