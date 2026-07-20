import type { NextApiRequest, NextApiResponse } from 'next'
import type { LoginResult } from '../../utils/tianyiAuth'
import { cloud189Login } from '../../utils/tianyiAuth'
import { getRedisStatus } from '../../utils/tianyiSessionStore'
import { getLoginMonitorStats } from '../../utils/tianyiLoginMonitor'
import { isAdminReq } from './auth/check'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 安全：诊断端点暴露内部基础设施信息，需管理员鉴权
  if (!(await isAdminReq(req))) {
    res.status(401).json({ error: 'Admin session required.' })
    return
  }

  const U = process.env.TIANYI_USERNAME || ''
  const P = process.env.TIANYI_PASSWORD || ''

  let loginTest: LoginResult | { status: string } = { status: 'not_tested' }
  if (U && P && req.query.test === '1') {
    loginTest = await cloud189Login(U, P)
  }

  const redisStatus = getRedisStatus()
  // 脱敏 REDIS_URL，只显示协议和主机，不暴露密码
  const redisUrlRaw = process.env.REDIS_URL || ''
  let redisUrlMasked = ''
  try {
    if (redisUrlRaw) {
      const u = new URL(redisUrlRaw)
      redisUrlMasked = `${u.protocol}//***@${u.host}`
    }
  } catch {
    redisUrlMasked = '(格式无效)'
  }

  const lt = loginTest as LoginResult

  // 登录监控统计：最近 1h 失败/成功计数 + 最近 20 条失败记录
  // 用于及时发现 cloud.189.cn 接口变更或风控触发
  const loginMonitor = await getLoginMonitorStats()

  res.status(200).json({
    status: 'success',
    data: {
      defaultFolderId: process.env.DEFAULT_FOLDER_ID || '-11',
      rootFolderId: '-11',
      usernameConfigured: Boolean(U),
      passwordConfigured: Boolean(P),
      redis: {
        initialized: redisStatus.initialized,
        error: redisStatus.error,
        urlMasked: redisUrlMasked,
        urlProtocol: redisUrlRaw ? new URL(redisUrlRaw).protocol : '',
      },
      loginTest: {
        status: lt.status,
        message: 'message' in lt ? lt.message?.substring(0, 100) : '',
        hasCookies: lt.status === 'success' ? Boolean(lt.data?.cookies) : false,
        cookieCount: lt.status === 'success' ? Object.keys(lt.data?.cookies || {}).length : 0,
      },
      loginMonitor: {
        enabled: loginMonitor.enabled,
        recentFailures: loginMonitor.recentFailures,
        recentSuccesses: loginMonitor.recentSuccesses,
        // 失败记录中可能含敏感信息（用户名/错误细节），仅管理员可见
        recentErrorRecords: loginMonitor.recentErrorRecords,
      },
    },
  })
}
