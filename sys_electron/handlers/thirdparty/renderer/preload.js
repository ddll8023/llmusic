/**
 * UserAPI 隐藏窗口 preload 脚本
 * 注入 globalThis.lx API，供第三方脚本访问
 * 完全兼容 lx-music 的 UserAPI 协议
 */
const { contextBridge, ipcRenderer } = require('electron')
const needle = require('needle')
const zlib = require('zlib')
const { createCipheriv, publicEncrypt, constants, randomBytes, createHash } = require('crypto')
const { httpOverHttp, httpsOverHttp } = require('tunnel')

// ── 事件名 ──
const EVT = {
  initEnv: 'userApi_initEnv',
  init: 'userApi_init',
  request: 'userApi_request',
  response: 'userApi_response',
  openDevTools: 'userApi_openDevTools',
  showUpdateAlert: 'userApi_showUpdateAlert',
  getProxy: 'userApi_getProxy',
  proxyUpdate: 'userApi_proxyUpdate',
}

const sendMessage = (action, data, status, message) => {
  ipcRenderer.send(action, { data, status, message })
}

// ── 状态 ──
let isInitedApi = false
let isShowedUpdateAlert = false
const proxy = { host: '', port: '' }
const EVENT_NAMES = { request: 'request', inited: 'inited', updateAlert: 'updateAlert' }
const eventNames = Object.values(EVENT_NAMES)
const events = { request: null }

const allSources = ['kw', 'kg', 'tx', 'wy', 'mg', 'local']
const supportQualitys = {
  kw: ['128k', '320k', 'flac', 'flac24bit'],
  kg: ['128k', '320k', 'flac', 'flac24bit'],
  tx: ['128k', '320k', 'flac', 'flac24bit'],
  wy: ['128k', '320k', 'flac', 'flac24bit'],
  mg: ['128k', '320k', 'flac', 'flac24bit'],
  local: [],
}
const supportActions = {
  kw: ['musicUrl'],
  kg: ['musicUrl'],
  tx: ['musicUrl'],
  wy: ['musicUrl'],
  mg: ['musicUrl'],
  local: ['musicUrl', 'lyric', 'pic'],
}

const httpsRxp = /^https:/

// ── SSRF 防护：检测是否为私有 IP ──
const PRIVATE_IP_RANGES = [
  /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^0\./, /^169\.254\./, /^::1$/, /^fe80:/i, /^fc00:/i, /^fd:/i,
]
function isPrivateHost(hostname) {
  const clean = hostname.replace(/^\[|\]$/g, '')
  const ipv4Mapped = clean.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  return PRIVATE_IP_RANGES.some(r => r.test(ipv4Mapped ? ipv4Mapped[1] : clean))
}
const getRequestAgent = url => {
  return proxy.host
    ? (httpsRxp.test(url) ? httpsOverHttp : httpOverHttp)({
        proxy: { host: proxy.host, port: proxy.port },
      })
    : undefined
}

const verifyLyricInfo = (info) => {
  if (typeof info != 'object' || typeof info.lyric != 'string') throw new Error('failed')
  if (info.lyric.length > 51200) throw new Error('failed')
  return {
    lyric: info.lyric,
    tlyric: (typeof info.tlyric == 'string' && info.tlyric.length < 5120) ? info.tlyric : null,
    rlyric: (typeof info.rlyric == 'string' && info.rlyric.length < 5120) ? info.rlyric : null,
    lxlyric: (typeof info.lxlyric == 'string' && info.lxlyric.length < 8192) ? info.lxlyric : null,
  }
}

const handleResponse = (context, { requestKey, data }) => {
  if (!events.request) {
    sendMessage(EVT.response, { requestKey }, false, 'Request event is not defined')
    return
  }
  try {
    events.request
      .call(context, { source: data.source, action: data.action, info: data.info })
      .then((response) => {
        const sendData = { requestKey }
        switch (data.action) {
          case 'musicUrl':
            // lx-music 脚本可返回 string URL 或 { url, type } 对象
            let url = ''
            if (typeof response === 'string') {
              url = response
            } else if (response && typeof response === 'object') {
              url = response.url || ''
            }
            if (typeof url !== 'string' || url.length > 2048 || !/^https?:/.test(url)) throw new Error('failed')
            sendData.result = {
              source: data.source,
              action: data.action,
              data: { type: data.info.type, url },
            }
            break
          case 'lyric':
            sendData.result = {
              source: data.source,
              action: data.action,
              data: verifyLyricInfo(response),
            }
            break
          case 'pic':
            if (typeof response != 'string' || response.length > 2048 || !/^https?:/.test(response)) throw new Error('failed')
            sendData.result = {
              source: data.source,
              action: data.action,
              data: response,
            }
            break
        }
        sendMessage(EVT.response, sendData, true)
      })
      .catch((err) => {
        sendMessage(EVT.response, { requestKey }, false, `[脚本错误][${data.source}][${data.action}] ${err.message}`)
      })
  } catch (err) {
    sendMessage(EVT.response, { requestKey }, false, `[脚本错误][${data.source}][${data.action}] ${err.message}`)
  }
}

const handleInit = (context, info) => {
  if (!info) {
    sendMessage(EVT.init, null, false, 'Missing required parameter init info')
    return
  }
  if (info.openDevTools === true) {
    sendMessage(EVT.openDevTools)
  }
  const sourceInfo = { sources: {} }
  try {
    for (const source of allSources) {
      const userSource = info.sources[source]
      if (!userSource || userSource.type !== 'music') continue
      const qualitys = supportQualitys[source]
      const actions = supportActions[source]
      sourceInfo.sources[source] = {
        type: 'music',
        actions: actions.filter((a) => userSource.actions.includes(a)),
        qualitys: qualitys.filter((q) => userSource.qualitys.includes(q)),
      }
    }
  } catch (error) {
    sendMessage(EVT.init, null, false, error.message)
    return
  }
  sendMessage(EVT.init, sourceInfo, true)

  ipcRenderer.on(EVT.request, (_event, data) => {
    handleResponse(context, data)
  })
}

const handleShowUpdateAlert = (data, resolve, reject) => {
  if (!data || typeof data != 'object') return reject(new Error('parameter format error.'))
  if (!data.log || typeof data.log != 'string') return reject(new Error('log is required.'))
  if (data.updateUrl && !/^https?:\/\/[^\s$.?#].[^\s]*$/.test(data.updateUrl) && data.updateUrl.length > 1024) delete data.updateUrl
  if (data.log.length > 1024) data.log = data.log.substring(0, 1024) + '...'
  sendMessage(EVT.showUpdateAlert, { log: data.log, updateUrl: data.updateUrl })
  resolve()
}

const onError = (errorMessage) => {
  if (isInitedApi) return
  isInitedApi = true
  if (errorMessage.length > 1024) errorMessage = errorMessage.substring(0, 1024) + '...'
  sendMessage(EVT.init, null, false, errorMessage)
}

const initEnv = (userApi) => {
  proxy.host = userApi.proxy.host
  proxy.port = userApi.proxy.port

  contextBridge.exposeInMainWorld('lx', {
    EVENT_NAMES,
    request(url, { method = 'get', timeout, headers, body, form, formData } = {}, callback) {
      const options = {
        headers,
        agent: getRequestAgent(url),
      }
      // SSRF 防护：检查目标主机是否为私有 IP
      try {
        const parsedUrl = new URL(url)
        if (isPrivateHost(parsedUrl.hostname)) {
          const err = new Error('拒绝访问内网地址: ' + parsedUrl.hostname)
          callback.call(this, err, null, null)
          return () => {}
        }
      } catch (e) {
        const err = new Error('无效的 URL: ' + url)
        callback.call(this, err, null, null)
        return () => {}
      }
      let data
      if (body) {
        data = body
      } else if (form) {
        data = form
        options.json = false
      } else if (formData) {
        data = formData
        options.json = false
      }
      options.response_timeout = typeof timeout == 'number' && timeout > 0 ? Math.min(timeout, 60000) : 60000

      let request = needle.request(method, url, data, options, (err, resp, body) => {
        try {
          if (err) {
            callback.call(this, err, null, null)
          } else {
            body = resp.body = resp.raw.toString()
            try { resp.body = JSON.parse(resp.body) } catch (_) { /* ignore */ }
            body = resp.body
            callback.call(this, null, {
              statusCode: resp.statusCode,
              statusMessage: resp.statusMessage,
              headers: resp.headers,
              bytes: resp.bytes,
              raw: resp.raw,
              body,
            }, body)
          }
        } catch (err) {
          onError(err.message)
        }
      }).request

      return () => {
        if (!request.aborted) request.abort()
        request = null
      }
    },
    send(eventName, data) {
      return new Promise((resolve, reject) => {
        if (!eventNames.includes(eventName)) return reject(new Error('The event is not supported: ' + eventName))
        switch (eventName) {
          case EVENT_NAMES.inited:
            if (isInitedApi) return reject(new Error('Script is inited'))
            isInitedApi = true
            handleInit(this, data)
            resolve()
            break
          case EVENT_NAMES.updateAlert:
            if (isShowedUpdateAlert) return reject(new Error('The update alert can only be called once.'))
            isShowedUpdateAlert = true
            handleShowUpdateAlert(data, resolve, reject)
            break
          default:
            reject(new Error('Unknown event name: ' + eventName))
        }
      })
    },
    on(eventName, handler) {
      if (!eventNames.includes(eventName)) return Promise.reject(new Error('The event is not supported: ' + eventName))
      switch (eventName) {
        case EVENT_NAMES.request:
          events.request = handler
          break
        default:
          return Promise.reject(new Error('The event is not supported: ' + eventName))
      }
      return Promise.resolve()
    },
    utils: {
      crypto: {
        aesEncrypt(buffer, mode, key, iv) {
          const cipher = createCipheriv(mode, key, iv)
          return Buffer.concat([cipher.update(buffer), cipher.final()])
        },
        rsaEncrypt(buffer, key) {
          buffer = Buffer.concat([Buffer.alloc(128 - buffer.length), buffer])
          return publicEncrypt({ key, padding: constants.RSA_NO_PADDING }, buffer)
        },
        randomBytes(size) { return randomBytes(size) },
        md5(str) { return createHash('md5').update(str).digest('hex') },
      },
      buffer: {
        from(...args) { return Buffer.from(...args) },
        bufToString(buf, format) { return Buffer.from(buf, 'binary').toString(format) },
      },
      zlib: {
        inflate(buf) {
          return new Promise((resolve, reject) => {
            zlib.inflate(buf, (err, data) => {
              if (err) reject(new Error(err.message))
              else resolve(data)
            })
          })
        },
        deflate(data) {
          return new Promise((resolve, reject) => {
            zlib.deflate(data, (err, buf) => {
              if (err) reject(new Error(err.message))
              else resolve(buf)
            })
          })
        },
      },
    },
    currentScriptInfo: {
      name: userApi.name,
      description: userApi.description,
      version: userApi.version,
      author: userApi.author,
      homepage: userApi.homepage,
      rawScript: userApi.script,
    },
    version: '2.0.0',
    env: 'desktop',
  })

  contextBridge.exposeInMainWorld('__lx_init_error_handler__', {
    sendError(errorMessage) { onError(errorMessage) },
  })

  // 注入错误监听 + 执行用户脚本
  require('electron').webFrame.executeJavaScript(`(() => {
window.addEventListener('error', (event) => {
  if (event.isTrusted) globalThis.__lx_init_error_handler__.sendError(event.message.replace(/^Uncaught\\sError:\\s/, ''))
})
window.addEventListener('unhandledrejection', (event) => {
  if (!event.isTrusted) return
  const message = typeof event.reason === 'string' ? event.reason : event.reason?.message ?? String(event.reason)
  globalThis.__lx_init_error_handler__.sendError(message.replace(/^Error:\\s/, ''))
})
})()`)

  require('electron').webFrame.executeJavaScript(userApi.script).catch((_) => _)
}

// ── 启动：收到 initEnv 后开始初始化 ──
ipcRenderer.on(EVT.initEnv, (_event, data) => {
  initEnv(data)
})

ipcRenderer.on(EVT.proxyUpdate, (_event, data) => {
  proxy.host = data.host
  proxy.port = data.port
})
