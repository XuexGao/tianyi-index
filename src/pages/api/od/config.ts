import type { NextApiRequest, NextApiResponse } from 'next'

// OneDrive OAuth 客户端配置接口，供 oAuthHandler.getConfig() 调用
// 与天翼云的 /api/config（运维诊断）职责不同，分开维护
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // 仅返回非敏感字段：clientSecret / userPrincipalName 不得下发到客户端。
  // clientSecret 仅在服务端（oAuthHandler.requestTokenWithAuthCode）使用。
  res.status(200).json({
    clientId: process.env.CLIENT_ID || '',
    baseDirectory: process.env.BASE_DIRECTORY || '/',
  })
}
