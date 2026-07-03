"""FastAPI 应用入口"""
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.qqmusic import router as qqmusic_router
from app.core.config import settings
from app.schemas.common import ErrorCode
from app.schemas.response import error

app = FastAPI(title="LLMusic API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.APP_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(qqmusic_router, prefix="/api/v1/qqmusic")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content=error(code=ErrorCode.INTERNAL_ERROR, message="系统内部错误"),
    )


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.APP_HOST,
        port=settings.APP_PORT,
        reload=True,
    )
