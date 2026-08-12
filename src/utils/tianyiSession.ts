/**
 * 天翼云会话获取统一入口。
 *
 * 原实现分别在以下位置各维护了一份几乎相同的逻辑：
 * - src/pages/api/ty/index.ts 的 getOrCreateSession
 * - src/pages/api/ty/raw.ts 的内联逻辑
 * - src/pages/api/dav/[[...path]].ts 的 getTySession
 * 提取为公共模块，保持"Redis 会话优先 → 自动登录兜底"的一致行为。
 */

import { cloud189Login } from './tianyiAuth'
import { getTianyiSession, saveTianyiSession } from './tianyiSessionStore'

const DEFAULT_USER_ID = 'default_user'

export interface TianyiSession {
  cookies: Record<string, string>
  username: string
  password: string
}

export type TianyiSessionResult = TianyiSession | { error: string }

/**
 * 获取或创建天翼云会话。
 *
 * 流程：
 * 1. 优先读 Redis 中已持久化的会话（Redis 失败/无会话时降级）；
 * 2. 无会话则用环境变量凭据自动登录；
 * 3. 登录成功后持久化新会话。
 *
 * 安全：密码不写入 Redis（由 tianyiSessionStore 保证），始终从环境变量读取。
 *
 * @returns 成功返回 { cookies, username, password }；失败返回 { error } 携带真实失败原因
 *          （验证码 / 密码错误 / 网络错误等），便于排查而非笼统的 "No access token"。
 */
export async function getOrCreateTianyiSession(): Promise<TianyiSessionResult> {
  const username = process.env.TIANYI_USERNAME || ''
  const password = process.env.TIANYI_PASSWORD || ''

  // 1. 从 Redis 获取已有会话（Redis 失败时 getTianyiSession 返回 null，自动降级）
  try {
    const session = await getTianyiSession(DEFAULT_USER_ID)
    if (session?.cookies && Object.keys(session.cookies).length > 0) {
      return {
        cookies: session.cookies,
        username: session.username || username,
        // 安全：密码不存入 Redis（见 tianyiSessionStore），始终从环境变量读取
        password,
      }
    }
  } catch {
    // Redis 读取失败，继续走自动登录
  }

  // 2. 自动登录
  if (!username || !password) {
    return { error: '未配置 TIANYI_USERNAME / TIANYI_PASSWORD 环境变量' }
  }

  try {
    const loginResult = await cloud189Login(username, password)
    if (loginResult.status === 'success' && loginResult.data?.cookies) {
      // 持久化会话；saveTianyiSession 内部已有 try/catch，不会抛错
      await saveTianyiSession(loginResult.data.cookies, { username, password })
      return { cookies: loginResult.data.cookies, username, password }
    }
    // 登录未成功：透传真实原因（验证码 / 密码错误 / 接口变更等）
    if (loginResult.status === 'need_captcha') {
      return { error: '天翼云登录需要验证码，请在浏览器登录 cloud.189.cn 一次后重试，或稍后再试' }
    }
    return { error: `天翼云登录失败: ${loginResult.message || loginResult.status}` }
  } catch (e: any) {
    return { error: `天翼云登录异常: ${e?.message || '未知错误'}` }
  }
}