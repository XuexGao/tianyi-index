/**
 * 双云盘 - API 配置
 * OneDrive: Microsoft Graph API 端点和 OAuth 配置
 * 天翼云: API 端点在 tianyiAuth.ts / tianyiClient.ts 中硬编码
 */
module.exports = {
  // OneDrive OAuth 配置
  redirectUri: 'http://localhost',
  authApi: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  driveApi: 'https://graph.microsoft.com/v1.0/me/drive',
  scope: 'user.read files.read.all offline_access',

  // 缓存控制
  cacheControlHeader: 'max-age=0, s-maxage=60, stale-while-revalidate',
}
