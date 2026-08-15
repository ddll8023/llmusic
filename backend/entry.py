"""PyInstaller 打包入口 — 生产环境由 Electron 主进程调用"""
import uvicorn
from app.core.config import settings
from app.main import app

if __name__ == "__main__":
    uvicorn.run(
        app,
        host=settings.host,
        port=settings.port,
        reload=False,
    )
