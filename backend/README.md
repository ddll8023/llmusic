# LLMusic 后端服务

## 技术栈

- Flask + Flask-CORS
- asyncio + httpx
- qqmusic-api-python
- Python logging + RotatingFileHandler
- uv 依赖管理配置：`pyproject.toml`

## 端口

- 服务端口：`8080`
- CORS 源：`http://localhost:9753`

## 目录结构

```text
backend/
├── app/
│   ├── main.py                  # Flask 应用入口
│   ├── api/
│   │   └── song.py              # 歌曲相关接口
│   ├── common/
│   │   ├── configure_logging.py # 日志配置
│   │   └── result.py            # 统一响应
│   ├── credential/
│   │   ├── credential.json
│   │   ├── get_credential.py
│   │   └── request_credential.py
│   └── services/
│       ├── search_song.py
│       ├── temp_song_detail.json
│       └── temp_song_urls.json
├── pyproject.toml
└── requirements.txt
```

## API

- `POST /song/search`：搜索单曲或歌单。
- `POST /song/albumImg`：批量获取专辑封面。
- `POST /song/songUrl`：批量获取歌曲链接。

## 启动

在项目根目录执行：

```bash
start_backend.bat
```

等价命令：

```bash
uv run --directory backend python -m app.main
```

## 响应格式

```json
{
	"code": 200,
	"msg": "success",
	"data": {}
}
```
