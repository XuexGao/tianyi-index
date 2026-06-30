import type { NextApiRequest, NextApiResponse } from 'next'
import type { LoginResult } from '../../utils/tianyiAuth'
import { cloud189Login } from '../../utils/tianyiAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const U = process.env.TIANYI_USERNAME || ''
  const P = process.env.TIANYI_PASSWORD || ''

  let loginTest: LoginResult | { status: string } = { status: 'not_tested' }
  if (U && P && req.query.test === '1') {
    loginTest = await cloud189Login(U, P)
  }

  const lt = loginTest as LoginResult
  res.status(200).json({
    status: 'success',
    data: {
      defaultFolderId: process.env.DEFAULT_FOLDER_ID || '-11',
      rootFolderId: '-11',
      usernameConfigured: Boolean(U),
      passwordConfigured: Boolean(P),
      loginTest: {
        status: lt.status,
        message: 'message' in lt ? lt.message?.substring(0, 100) : '',
        hasCookies: lt.status === 'success' ? Boolean(lt.data?.cookies) : false,
        cookieCount: lt.status === 'success' ? Object.keys(lt.data?.cookies || {}).length : 0,
      },
    },
  })
}
