# musicdl 第三方中转 API 收录

> 本文档收录 [musicdl](https://github.com/CharlesPikachu/musicdl) 项目中集成的所有第三方音乐中转 API，供 LLMusic 在线音乐下载功能开发时参考。
> 更新日期：2026-07-02
> 来源版本：musicdl v2.12.9

---

## 1. 背景说明

musicdl 是一个纯 Python 编写的轻量级音乐下载器，支持 **42+** 音乐/有声书平台。当用户未提供平台 VIP Cookies 时，musicdl 会尝试调用互联网上第三方开发者搭建的**免费中转 API** 来获取歌曲下载链接。

这些第三方 API 的原理：
> 运营者自己持有各平台的 VIP/会员账号 → 搭建 API 把官方下载接口包装成简单 HTTP 接口 → musicdl 逐个尝试碰运气。

**注意：**
- 这些 API **随时可能失效** —— 这也是 musicdl 频繁更新版本的原因
- 品质不稳定 —— API 背后的 VIP 账号可能过期或被限速
- 无统一规范 —— 每个 API 的参数格式、返回结构、鉴权方式都不同

---

## 2. QQ 音乐 — 11 个中转 API

### 2.1 SVIP 级（可获取母带/杜比全景声）

#### vkeys.cn
```
GET https://api.vkeys.cn/music/tencent/song/link?mid={song_mid}&quality={N}
参数 quality: 14=极致母带 → 13=空间音频 → 12=杜比 → 11=HiRes → 10=无损 → ...
歌词: GET https://api.vkeys.cn/v2/music/tencent/lyric?mid={song_mid}
```
- 返回 JSON，`data.url` 为下载链接
- 音质从高到低逐级尝试

#### xcvts.cn
```
GET https://api.xcvts.cn/api/music/qq?apiKey={base64_key}&mid={song_mid}&type={quality_name}
quality_name: 臻品母带 / 臻品全景声 / 臻品2.0 / SQ无损 / HQ高品质 / 中品质 / 普通 / 低品质 / 试听
```
- API key 使用 base64 编码存储，运行时解码
- 内置两个 Key 随机使用

### 2.2 VIP 级（可获取无损）

#### znnu.com（HMAC 签名）
```
POST https://music.znnu.com
```
- 使用 HMAC-SHA256 签名请求
- 参数含 `act=song`、`id`、`level`、`rawInput`
- 带随机 IP 头

#### 317ak.cn
```
GET https://api.317ak.cn/api/yinyue/qqyinyue?ckey={key}&i={song_id}&br={quality}&type=json&lrc=1
```

#### lxmusicapi.onrender.com
```
GET https://lxmusicapi.onrender.com/url/tx/{song_id}/{quality}
```
- Render 免费托管，仅返回 mp3/m4a

### 2.3 普通会员级（仅 mp3/m4a）

#### cyapi.top
```
GET https://cyapi.top/API/qq_music.php?apikey={key}&mid={song_mid}&quality=lossless
```

#### cocodownloader.markqq.com（多平台聚合）
```
GET https://cocodownloader.markqq.com/api/url?id={song_id}&provider=qq
```

#### music-api.gdstudio.xyz（GDStudio 聚合）
```
GET https://music-api.gdstudio.xyz/api.php?types=url&id={song_id}&source=qq&br=999
```
- 覆盖 QQ/网易云/酷我/酷狗/咪咕 + 国际平台

### 2.4 不稳定级

#### lpz.chatc.vip
```
GET https://lpz.chatc.vip/apiqq.php?songmid={song_mid}&type=json&br=1
```
- 关闭证书验证（`verify=False`）

#### musicapi.haitangw.net（海唐网聚合）
```
GET https://musicapi.haitangw.net/music/qq.php?id={song_id}
```

#### www.jbsou.cn（煎饼搜聚合）
```
POST https://www.jbsou.cn/
data: {input: hash, filter: 'id', type: 'kugou', page: '1'}
```
- 覆盖 QQ/网易云/酷我/酷狗

---

## 3. 网易云音乐 — 20+ 个中转 API

### 3.1 加密握手型

#### toubiec.cn（最复杂的实现）
```
POST https://nextmusic.toubiec.cn/api/key           → 获取 keyId + keyToken
POST https://nextmusic.toubiec.cn/api/getMusicUrl   → 获取下载链接（AES 加密载荷）
POST https://nextmusic.toubiec.cn/api/getSongUrl    → 备选下载接口
POST https://nextmusic.toubiec.cn/api/getSongLyric  → 歌词
POST https://nextmusic.toubiec.cn/api/getSongInfo   → 歌曲信息
```
- 完整的加密握手流程：获取 key → 加密请求 → 解密响应
- 同一域名下有 5 个接口

### 3.2 Song_V1 模式（统一接口风格）

这批 API 采用相同的接口规范，POST 返回 JSON：

| API 地址 | 请求方式 |
|---------|---------|
| `https://music.rrvenn.cn/Song_V1` | POST `{url:song_id, level, type:'json'}` |
| `https://dm.jfjt.cc/Song_V1` | POST 同上 |
| `https://ncm.kangqiovo.com/Song_V1` | POST 同上（verify=False） |
| `https://yutangxiaowu.cn:4000/Song_V1` | GET `?url=song_id&level=xxx&type=json` |
| `https://metings.qjqq.cn/Song_V1` | POST 同上 |
| `https://music163.lblb.eu/Song_V1` | POST 同上 |
| `https://api.manshuo.ink/wyy/Song_V1` | POST 同上 |

### 3.3 简单 GET 型

| API 地址 | 接口格式 |
|---------|---------|
| `api-v2.cenguigui.cn` | `GET /api/netease/music_v1.php?id={id}&type=json&level={level}` |
| `musicapi.haitangw.net` | `GET /music/wy.php?id={id}&level={level}&type=json` |
| `api.byfuns.top` | `GET /1/?id={id}&level=hires`（返回纯文本 URL） |
| `www.cunyuapi.top` | `GET /163music_play?id={id}&quality={level}` |
| `api.xunjinlu.fun` | `GET /apis/wymusic?action=song&id={id}&key={base64}&level={level}` |
| `apii.xianyuw.cn` | `GET /api/v1/163-music-search?id={id}&key={base64}&no_url=0&br=hires` |
| `m-api.ceseet.me` | `GET /url/wy/{song_id}/hires`（多平台） |
| `www.guyuei.com` | `GET /music/163.php?url=...&yinzhi=hns` |
| `api.s0o1.com` | `GET /API/wyy_music/?id={id}&yz=7` |
| `api.rxtool.top` | `GET /api/meteasecloudmusic.php?id={id}&level=hires` |
| `xwl.vincentzyu233.cn:51217` | `GET /v2/music/netease?id={id}&quality=9` |
| `api.bugpk.com` | `GET /api/163_music?ids={id}&level={level}&type=json` |
| `api.bileizhen.top` | `GET /api/netease?id={id}&level={level}` |
| `api.xcvts.cn` | `GET /api/music/163music?apiKey={key}&id={id}&br=999000` |
| `cocodownloader.markqq.com` | `GET /api/url?id={id}&provider=netease&quality=jymaster` |
| `music-api.gdstudio.xyz` | `GET /api.php?types=url&id={id}&source=netease&br=999` |
| `metingapi.nanorocky.top` | `GET /?server=netease&type=url&id={id}&br=2000`（MetingAPI） |

**品质降级顺序**：`jymaster → hires → lossless → 320k → 128k`

---

## 4. 酷狗音乐 — 5 个中转 API

| API 地址 | 接口格式 |
|---------|---------|
| `musicapi.haitangw.net` | `GET /kgqq/kg.php?type=json&id={file_hash}&level={quality}` |
| `music.haitangw.cc` | `GET /kgqq/kg.php?type=json&id={file_hash}&level={quality}`（备选） |
| `cocodownloader.markqq.com` | `GET /api/url?id={file_hash}&provider=kugou` |
| `api.317ak.cn` | `GET /api/yinyue/kugou?ckey={key}&i={file_hash}&br={quality}&type=json&lrc=1` |
| `www.jbsou.cn` | `POST /` `{input:file_hash, filter:'id', type:'kugou', page:'1'}` |

**音质降级**：按 `flac → 320k → 128k` 逐级尝试。

---

## 5. 酷我音乐 — 9 个中转 API

| API 地址 | 接口格式 | 特点 |
|---------|---------|------|
| `kw-api.cenguigui.cn` | `GET /?id={id}&type=song&level=lossless&format=json` | 优先用 curl_cffi 模拟 Chrome 指纹 |
| `kw.006lp.ccwu.cc:7119` | `GET /api/song?id={id}&level=jymaster&stream=1` | 硬编码端口 |
| `m-api.ceseet.me` | `GET /url/kw/{song_id}/flac` | 多平台通用 |
| `apione.apibyte.cn` | `GET /kwmusic?key={base64}&action=music_url&music_id={id}` | 重试 5 次 |
| `www.guyuei.com` | `GET /music/kw.php?url=...&yinzhi=hns` | 与网易云同域名 |
| `lxmusicapi.onrender.com` | `GET /url/kw/{song_id}/flac` | Render 托管 |
| `music.nxinxz.com` | `GET /kw.php?id={id}&level={level}&type=json` | 简单 GET |
| `musicapi.haitangw.net` | `GET /music/kw.php?id={id}&level={level}&type=json` | 海唐聚合 |
| `kwdec.liuyunidc.cn` | `GET /kwurl?data={RC4加密参数}` | 参数用 RC4 加密 |
| `music-api.gdstudio.xyz` | `GET /api.php?types=url&id={id}&source=kuwo&br=999` | GDStudio 聚合 |

---

## 6. 多平台聚合中转

以下中转 API 覆盖多个音乐平台：

| 名称 | API 地址 | 覆盖平台 |
|------|---------|---------|
| **GDStudio** | `music-api.gdstudio.xyz/api.php?types=url&id={id}&source={source}&br=999` | QQ/网易云/酷我/酷狗/咪咕 + 国际 |
| **煎饼搜** | `www.jbsou.cn` POST | QQ/网易云/酷我/酷狗 |
| **海唐网** | `musicapi.haitangw.net/music/{wy\|kg\|kw\|qq}.php` | 网易云/酷狗/酷我/QQ |
| **cocodownloader** | `cocodownloader.markqq.com/api/url?id={id}&provider={provider}` | qq/netease/kugou |
| **ceseet** | `m-api.ceseet.me/url/{wy\|kw\|tx}/{id}/{quality}` | 网易云/酷我/腾讯 |
| **MetingAPI** | `metingapi.nanorocky.top/?server={server}&type=url&id={id}` | 网易云/QQ/酷狗/... |

---

## 7. 降级调用策略

### QQ 音乐四级降级（`_parsewiththirdpartapis`）

```
代码第259-267行：
l1 = [_parsewithvkeysapi, _parsewithxcvtsapi]            # SVIP 级 — 母带/全景声
l2 = [_parsewithxianyuwapi, ..., _parsewith317akapi]      # VIP 级 — 无损
l3 = [_parsewithcyapi, ..., _parsewithlxmusicapi]         # 普通 — 仅 mp3/m4a
l4 = [_parsewithlpzapi]                                    # 不稳定

每级取第一个可用链接，品质从高到低逐级降。
```

### 网易云音乐品质降级

```python
MUSIC_QUALITIES = ["jymaster", "hires", "lossless", "320k", "128k"]
# 每个品质尝试所有 API，取第一个可用的
```

### 核心逻辑

1. **优先走官方 API**：如果用户提供了平台 VIP Cookies，直接调用官方下载接口
2. **无 Cookies 时走三方**：按等级从高到低、品质从高到低，逐个尝试
3. **链路检测**：每个 URL 实际请求测试，验证可访问性和音频格式
4. **断点续探**：一旦某级 API 返回有效链接，停止后续尝试

---

## 8. 对 LLMusic 的参考价值

| 用途 | 建议 |
|------|------|
| **直接复用** | musicdl 的 Python SDK 可 pip 安装，LLMusic 后端可调用 `musicdl.musicdl.MusicClient` |
| **参考 API 池** | 以上 API 作为下载源候选池，LLMusic 可自行维护健康检查 |
| **注意稳定性** | 第三方 API 随时可能失效，建议加健康检测 + 自动降级 |
| **替代方案** | 考虑自行部署官方 API 代理（需持有对应平台 VIP 账号），比蹭公共 API 更稳定 |
