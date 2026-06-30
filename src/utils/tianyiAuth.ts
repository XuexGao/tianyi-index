import crypto from 'crypto'
import axios, { AxiosInstance } from 'axios'

/**
 * 天翼云登录认证模块
 * 从 Python 版移植到 TypeScript
 */

// 简单 Cookie Jar — 直接存 name=value 字典（与已验证的 Node.js 测试逻辑一致）
class CookieJar {
  store: Record<string, string> = {}

  setFromHeaders(headers: Record<string, any>) {
    const setCookie = headers['set-cookie']
    if (!setCookie) return
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie]
    for (const c of cookies) {
      const semi = c.indexOf(';')
      const kv = semi >= 0 ? c.substring(0, semi) : c
      const eqIdx = kv.indexOf('=')
      if (eqIdx >= 0) {
        const name = kv.substring(0, eqIdx).trim()
        const value = kv.substring(eqIdx + 1).trim()
        if (name) this.store[name] = value
      }
    }
  }

  getDict(): Record<string, string> {
    return { ...this.store }
  }

  loadFromDict(dict: Record<string, string>) {
    Object.assign(this.store, dict)
  }
}

// 创建带 cookie 管理的 axios 实例
function createSession(): { client: AxiosInstance; jar: CookieJar } {
  const jar = new CookieJar()
  const client = axios.create({
    timeout: 30000,
    maxRedirects: 0,
    validateStatus: (status) => status < 400,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://cloud.189.cn/',
    },
  })

  // 请求拦截器：注入所有 Cookie
  client.interceptors.request.use((config) => {
    const cs = Object.entries(jar.store).map(([k, v]) => `${k}=${v}`).join('; ')
    if (cs) config.headers.Cookie = cs
    return config
  })

  // 响应拦截器：保存所有 Set-Cookie
  client.interceptors.response.use((response) => {
    jar.setFromHeaders(response.headers as Record<string, any>)
    return response
  })

  return { client, jar }
}

/**
 * 自定义 base64 转 hex（匹配天翼云前端算法）
 */
function b64ToHex(b64Str: string): string {
  const b64map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const biRm = '0123456789abcdefghijklmnopqrstuvwxyz'

  let result = ''
  let e = 0
  let c = 0

  for (const char of b64Str) {
    if (char === '=') continue
    const v = b64map.indexOf(char)
    if (v < 0) continue
    if (e === 0) {
      e = 1
      result += biRm[v >> 2]
      c = 3 & v
    } else if (e === 1) {
      e = 2
      result += biRm[(c << 2) | (v >> 4)]
      c = 15 & v
    } else if (e === 2) {
      e = 3
      result += biRm[c]
      result += biRm[v >> 2]
      c = 3 & v
    } else {
      e = 0
      result += biRm[(c << 2) | (v >> 4)]
      result += biRm[15 & v]
    }
  }

  if (e === 1) {
    result += biRm[c << 2]
  }

  return result
}

/**
 * RSA 加密（PKCS1_v1_5）
 * 对应 Python pycryptodome 的 PKCS1_v1_5.encrypt
 */
function rsaEncode(data: Buffer, publicKey: string, useHex: boolean = true): string {
  const pemKey = `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`
  const encrypted = crypto.publicEncrypt(
    {
      key: pemKey,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    data,
  )
  const b64Str = encrypted.toString('base64')
  if (useHex) {
    return b64ToHex(b64Str)
  }
  return b64Str
}

function randomStr(): string {
  return '0.' + Math.floor(Math.random() * 9007199254740991).toString()
}

/**
 * 手动跟踪重定向，获取最终 URL
 */
async function followRedirects(client: AxiosInstance, url: string, maxSteps = 5): Promise<{ url: string; status: number }> {
  let currentUrl = url
  let steps = 0
  while (steps < maxSteps) {
    const resp = await client.get(currentUrl, { maxRedirects: 0, validateStatus: (s) => s < 400 })
    if (resp.status >= 300 && resp.status < 400 && resp.headers.location) {
      currentUrl = resp.headers.location
      // 如果重定向到根目录 /main 说明已登录
      if (currentUrl.includes('/web/main')) {
        return { url: currentUrl, status: 200 }
      }
      steps++
    } else {
      return { url: resp.request?.res?.responseUrl || currentUrl, status: resp.status }
    }
  }
  return { url: currentUrl, status: 200 }
}

/**
 * 天翼云登录
 */
export async function cloud189Login(
  username: string,
  password: string,
  validateCode: string = '',
): Promise<LoginResult> {
  if (!username || !password) {
    return { status: 'error', message: '用户名或密码为空' }
  }

  const { client, jar } = createSession()

  // 1. 访问登录 URL，跟踪重定向获取 lt/reqId/appId
  try {
    const firstResp = await client.get(
      'https://cloud.189.cn/api/portal/loginUrl.action?redirectURL=https%3A%2F%2Fcloud.189.cn%2Fmain.action',
      { maxRedirects: 0 },
    )

    let lt = ''
    let reqId = ''
    let appId = ''
    let redirectUrl = ''

    // 处理已登录情况
    if (firstResp.status >= 300 && firstResp.status < 400) {
      const loc = firstResp.headers.location || ''
      if (loc === 'https://cloud.189.cn/web/main' || loc.includes('/web/main')) {
        return { status: 'success', message: '已登录', data: { cookies: jar.getDict() } }
      }
      // 跟踪剩余重定向链到最终页面
      const final = await followRedirects(client, loc)
      redirectUrl = final.url
      const urlParams = new URL(redirectUrl)
      lt = urlParams.searchParams.get('lt') || ''
      reqId = urlParams.searchParams.get('reqId') || ''
      appId = urlParams.searchParams.get('appId') || ''
    } else {
      // 可能直接返回页面
      redirectUrl = firstResp.request?.res?.responseUrl || firstResp.config.url || ''
      const urlParams = new URL(redirectUrl)
      lt = urlParams.searchParams.get('lt') || ''
      reqId = urlParams.searchParams.get('reqId') || ''
      appId = urlParams.searchParams.get('appId') || ''
    }

    if (!lt || !appId) {
      // 可能是 token 已过时或接口变了
      return { status: 'error', message: `获取登录参数失败 (lt=${!!lt}, appId=${!!appId})` }
    }

    const headers = {
      lt,
      reqid: reqId,
      referer: redirectUrl,
      origin: 'https://open.e.189.cn',
    }

    // 2. 检查是否需要验证码
    let needCaptcha = false
    let captchaToken = ''
    try {
      const checkRes = await client.post(
        'https://open.e.189.cn/api/logbox/oauth2/needcaptcha.do',
        new URLSearchParams({ accountType: '01', userName: username }).toString(),
        { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } },
      )
      const checkData = checkRes.data
      if (typeof checkData === 'object' && checkData !== null) {
        needCaptcha = Boolean(checkData.needCaptcha)
      } else {
        needCaptcha = Boolean(checkData)
      }

      if (needCaptcha) {
        // 获取验证码页面，提取 captchaToken
        const htmlRes = await client.get(redirectUrl, { headers })
        const html = typeof htmlRes.data === 'string' ? htmlRes.data : String(htmlRes.data)

        const tokenMatch = html.match(/captchaToken' value='(.+?)'/)
        if (tokenMatch) captchaToken = tokenMatch[1]

        // 如果没提供验证码，返回验证码图片
        if (!validateCode) {
          const vcodeMatch = html.match(/picCaptcha\.do\?token=([A-Za-z0-9&=]+)/)
          if (vcodeMatch) {
            const vcodeId = vcodeMatch[1]
            const captchaImgRes = await client.get(
              `https://open.e.189.cn/api/logbox/oauth2/picCaptcha.do?token=${vcodeId}${Date.now()}`,
              {
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  Referer: 'https://open.e.189.cn/api/logbox/oauth2/unifyAccountLogin.do',
                },
                responseType: 'arraybuffer',
              },
            )
            const captchaBase64 = Buffer.from(captchaImgRes.data).toString('base64')
            return {
              status: 'need_captcha',
              message: '需要验证码',
              data: { captcha_token: captchaToken, captcha_image: captchaBase64, lt, req_id: reqId, app_id: appId },
            }
          }
        }
      }
    } catch {
      // 继续尝试登录
    }

    // 3. 获取应用配置
    const appConfRes = await client.post(
      'https://open.e.189.cn/api/logbox/oauth2/appConf.do',
      new URLSearchParams({ version: '2.0', appKey: appId }).toString(),
      { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } },
    )

    if (appConfRes.data?.result !== '0') {
      return { status: 'error', message: appConfRes.data?.msg || '获取应用配置失败' }
    }

    // 4. 获取加密配置
    const encryptConfRes = await client.post(
      'https://open.e.189.cn/api/logbox/config/encryptConf.do',
      new URLSearchParams({ appId }).toString(),
      { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } },
    )

    if (encryptConfRes.data?.result !== 0) {
      return { status: 'error', message: '获取加密配置失败' }
    }

    const pre = encryptConfRes.data.data.pre
    const pubKey = encryptConfRes.data.data.pubKey

    // 5. RSA 加密用户名和密码
    const usernameEncrypted = pre + rsaEncode(Buffer.from(username, 'utf-8'), pubKey, true)
    const passwordEncrypted = pre + rsaEncode(Buffer.from(password, 'utf-8'), pubKey, true)

    // 6. 提交登录
    const loginData = new URLSearchParams({
      version: 'v2.0',
      apToken: '',
      appKey: appId,
      accountType: appConfRes.data.data.accountType,
      userName: usernameEncrypted,
      epd: passwordEncrypted,
      captchaType: needCaptcha ? '1' : '',
      validateCode: validateCode,
      smsValidateCode: '',
      captchaToken: captchaToken,
      returnUrl: appConfRes.data.data.returnUrl,
      mailSuffix: appConfRes.data.data.mailSuffix,
      dynamicCheck: 'FALSE',
      clientType: String(appConfRes.data.data.clientType),
      cb_SaveName: '3',
      isOauth2: String(appConfRes.data.data.isOauth2).toLowerCase(),
      state: '',
      paramId: appConfRes.data.data.paramId,
    })

    const loginRes = await client.post(
      'https://open.e.189.cn/api/logbox/oauth2/loginSubmit.do',
      loginData.toString(),
      { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } },
    )

    if (loginRes.data?.result !== 0) {
      const errorMsg = loginRes.data?.msg || '登录失败'

      // 验证码错误时重新获取
      if (errorMsg.includes('验证码')) {
        try {
          const captchaImgRes2 = await client.get(
            `https://open.e.189.cn/api/logbox/oauth2/picCaptcha.do?token=${lt}${Date.now()}`,
            { headers, responseType: 'arraybuffer' },
          )
          const captchaBase64 = Buffer.from(captchaImgRes2.data).toString('base64')
          return {
            status: 'need_captcha',
            message: errorMsg,
            data: { captcha_token: captchaToken, captcha_image: captchaBase64, lt, req_id: reqId, app_id: appId },
          }
        } catch {
          return {
            status: 'need_captcha',
            message: errorMsg,
            data: { captcha_token: captchaToken, lt, req_id: reqId, app_id: appId },
          }
        }
      }

      return { status: 'error', message: errorMsg }
    }

    // 7. 跟随 toUrl 完成登录（必须手动跟随以获取 Set-Cookie）
    const toUrl = loginRes.data?.toUrl
    if (toUrl) {
      try {
        await client.get(toUrl, { maxRedirects: 0 })
      } catch {
        // 忽略跟随 toUrl 时的错误
      }
    }

    return {
      status: 'success',
      message: '登录成功',
      data: { cookies: jar.getDict() },
    }
  } catch (error: any) {
    return { status: 'error', message: `登录失败: ${error?.message || '未知错误'}` }
  }
}

export interface LoginResult {
  status: 'success' | 'error' | 'need_captcha' | 'need_refresh'
  message: string
  data?: {
    cookies?: Record<string, string>
    captcha_token?: string
    captcha_image?: string
    lt?: string
    req_id?: string
    app_id?: string
    userId?: string
  }
}
