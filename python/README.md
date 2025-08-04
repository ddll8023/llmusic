# LLMusic Python API 服务

## 技术架构

### 核心技术栈

- **Web 框架**: Flask 2.x + Flask-CORS
- **异步处理**: asyncio + httpx
- **QQ 音乐 API**: qqmusic-api-python 0.3.4
- **数据格式**: JSON RESTful API
- **日志系统**: Python logging + RotatingFileHandler

### 端口配置

- 服务端口: `8080`
- CORS 源: `http://localhost:5173`

## API 端点

### 1. 搜索接口

```
POST /song/search
Content-Type: application/json

{
  "requestId": "string",
  "urlType": "song|playlist",
  "searchUrl": "string",
  "page": 1,
  "pageSize": 10
}
```

### 2. 专辑封面接口

```
POST /song/albumImg
Content-Type: application/json

{
  "requestId": "string",
  "albumIdList": ["string"]
}
```

### 3. 歌曲链接接口

```
POST /song/songUrl
Content-Type: application/json

{
  "requestId": "string",
  "songIdList": [123456]
}
```

## 模块结构

```
├── app.py              # Flask应用入口
├── blueprint/
│   └── song.py         # 路由控制器
├── common/
│   ├── configure_logging.py  # 日志配置
│   └── result.py       # 统一响应格式
├── credential/
│   ├── get_credential.py     # 凭证管理
│   └── request_credential.py # 登录认证
└── untils/
    └── search_song.py  # 业务逻辑
```

## 核心类与方法

### Result 类 (common/result.py)

- `result_success(msg, code, data)` - 成功响应
- `result_fail(msg, code, data)` - 失败响应

### 搜索工具 (untils/search_song.py)

- `search_song(song_id: int)` - 单曲详情
- `search_songlist(songlist_id, page, page_size)` - 歌单分页
- `get_song_url_list(song_mid_list, file_type, credential)` - 获取下载链接

### 认证系统 (credential/)

- `get_credential()` - 获取 QQ 音乐 API 凭证
- `request_credential.py` - 二维码/手机验证码登录

## 日志配置

- 日志文件: `app.log`
- 文件大小限制: 10MB
- 备份数量: 5 个
- 编码格式: UTF-8
- 日志格式: `%Y-%m-%d %H:%M:%S - [level] - [module] - message`

## 依赖安装

```bash
pip install -r requirements.txt
```

依赖列表:

- flask>=2.0.0
- flask-cors>=3.0.0
- qqmusic-api-python>=1.0.0
- httpx>=0.24.0

## 运行步骤

### 1. 首次运行认证

```bash
python credential/request_credential.py
# 选择登录方式: 1.QQ 2.微信
```

### 2. 启动服务

```bash
python app.py
```

### 3. 服务验证

- 健康检查: `curl http://localhost:8080/song/search`
- 预期响应: CORS 配置信息

## 数据格式规范

### 歌曲对象

```json
{
	"songId": 123456,
	"songMid": "001234567",
	"songName": "歌曲名称",
	"singer": "歌手名称",
	"genre": "流派",
	"lan": "语言",
	"createTime": "2023-01-01",
	"album": {
		"albumId": 789012,
		"albumMid": "album_mid",
		"albumName": "专辑名称",
		"albumCoverUrl": "https://..."
	},
	"duration": "03:45",
	"songUrl": "https://..."
}
```

### 响应格式

```json
{
	"code": 200,
	"msg": "success",
	"data": {}
}
```

## 错误码规范

- `200` - 成功
- `400` - 参数错误
- `500` - 服务器内部错误

## 缓存机制

- 临时缓存文件: `untils/temp_song_detail.json`
- 临时 URL 缓存: `untils/temp_song_urls.json`
- 缓存用途: API 响应调试和开发测试

## 环境要求

- Python 版本: 3.8+
- 操作系统: Windows/Linux/macOS
- 网络要求: 可访问 QQ 音乐 API 服务
