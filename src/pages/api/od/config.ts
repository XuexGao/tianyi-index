import type { NextApiRequest, NextApiResponse } from 'next'

// OneDrive OAuth 客户端配置接口，供 oAuthHandler.getConfig() 调用
// 与天翼云的 /api/config（运维诊断）职责不同，分开维护
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    clientId: process.env.CLIENT_ID || '',
    clientSecret: process.env.CLIENT_SECRET || '',
    userPrincipalName: process.env.USER_PRINCIPAL_NAME || '',
    baseDirectory: process.env.BASE_DIRECTORY || '/',
  })
}
