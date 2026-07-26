"""统一日志配置"""
import logging

from app.core.config import settings


def setup_logger(name):
    """创建带统一格式的模块级 logger（重复调用同一 name 安全）"""
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(settings.log_level.upper())
    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter(
            "[%(asctime)s] [%(filename)s:%(lineno)d] [%(name)s] [%(levelname)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    logger.addHandler(handler)
    logger.propagate = False
    return logger
