import { useState, useCallback } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { GetServerSidePropsContext } from 'next'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faSignOutAlt,
  faTrashAlt,
  faSyncAlt,
  faPlus,
  faTimes,
  faShieldAlt,
  faInfoCircle,
} from '@fortawesome/free-solid-svg-icons'

import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { PreviewContainer } from '../components/previews/Containers'
import { verifyAdminSession } from '../utils/adminSessionStore'
import { getTokenFromReq } from '../utils/adminAuth'
import { getProtectedRoutes, getProtectedRoutesOd } from '../utils/protectedRoutesStore'
import siteConfig from '../../config/site.config'

interface ManageProps {
  initialIsAdmin: boolean
  initialSession: { username: string; createdAt: number; lastAccessAt: number } | null
  initialProtectedRoutes: string[]
  initialProtectedRoutesOd: string[]
}

/**
 * 管理页 /@manage（通过 rewrites 映射到 /_admin-manage）
 *
 * 功能：
 * 1. 查看配置/状态（云盘挂载路径、私密目录、构建信息、Redis 状态）
 * 2. 管理私密目录（增删，存 Redis，覆盖环境变量配置）
 * 3. 清缓存/会话（清天翼云 session 和 OneDrive access_token）
 * 4. 登出
 */
export default function AdminManagePage({
  initialIsAdmin,
  initialSession,
  initialProtectedRoutes,
  initialProtectedRoutesOd,
}: ManageProps) {
  const router = useRouter()
  const [session] = useState(initialSession)
  const [tyRoutes, setTyRoutes] = useState<string[]>(initialProtectedRoutes)
  const [odRoutes, setOdRoutes] = useState<string[]>(initialProtectedRoutesOd)
  const [newTyRoute, setNewTyRoute] = useState('')
  const [newOdRoute, setNewOdRoute] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const callApi = useCallback(async (action: string, extra: any = {}) => {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/auth/manage/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '操作失败' })
        return null
      }
      if (data.messages?.length) {
        setMessage({ type: 'success', text: data.messages.join('；') })
      }
      return data
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || '网络错误' })
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  // 清缓存
  const handleClearCache = () => callApi('clear-cache')

  // 登出
  async function handleLogout() {
    setLoading(true)
    try {
      await fetch('/api/auth/logout/', { method: 'POST' })
    } catch {
      // 忽略错误，仍然跳转
    }
    // 清除客户端登录状态缓存，避免跳转后仍被识别为已登录
    sessionStorage.removeItem('admin_status')
    if (typeof window !== 'undefined') {
      ;(window as any).__isAdmin = false
    }
    router.replace('/@login')
  }

  // 私密目录增删
  function addTyRoute() {
    const r = newTyRoute.trim()
    if (!r) return
    if (tyRoutes.includes(r)) {
      setMessage({ type: 'error', text: '该路径已存在' })
      return
    }
    setTyRoutes([...tyRoutes, r])
    setNewTyRoute('')
  }
  function addOdRoute() {
    const r = newOdRoute.trim()
    if (!r) return
    if (odRoutes.includes(r)) {
      setMessage({ type: 'error', text: '该路径已存在' })
      return
    }
    setOdRoutes([...odRoutes, r])
    setNewOdRoute('')
  }
  function removeTyRoute(r: string) {
    setTyRoutes(tyRoutes.filter(x => x !== r))
  }
  function removeOdRoute(r: string) {
    setOdRoutes(odRoutes.filter(x => x !== r))
  }

  // 保存私密目录
  async function saveProtectedRoutes() {
    const data = await callApi('set-protected-routes', { ty: tyRoutes, od: odRoutes })
    if (data?.success && !message) {
      setMessage({ type: 'success', text: '私密目录已保存' })
    }
  }

  // 重置私密目录
  async function resetProtectedRoutes() {
    const data = await callApi('reset-protected-routes')
    if (data?.success) {
      // 重置为环境变量配置
      setTyRoutes(siteConfig.protectedRoutes)
      setOdRoutes(siteConfig.protectedRoutesOd)
    }
  }

  // 重新拉取私密目录
  async function refreshProtectedRoutes() {
    const data = await callApi('get-protected-routes')
    if (data?.success) {
      setTyRoutes(data.ty)
      setOdRoutes(data.od)
    }
  }

  if (!initialIsAdmin) {
    // middleware 应该已经重定向了，这里是兜底
    return null
  }

  return (
    <>
      <Head>
        <title>管理 - {process.env.NEXT_PUBLIC_SITE_TITLE || 'TianYi-Index'}</title>
      </Head>
      <Navbar />
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
        {/* 消息提示 */}
        {message && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              message.type === 'success'
                ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-300'
                : 'border-red-300 bg-red-50 text-red-600 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* 会话信息 */}
        <PreviewContainer>
          <div className="p-4">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-gray-800 dark:text-gray-100">
              <FontAwesomeIcon icon={faInfoCircle} />
              会话信息
            </h2>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-300">
              <div>用户：{session?.username || 'admin'}</div>
              <div>
                登录时间：
                {session ? new Date(session.createdAt).toLocaleString('zh-CN') : '-'}
              </div>
              <div>
                最后访问：
                {session ? new Date(session.lastAccessAt).toLocaleString('zh-CN') : '-'}
              </div>
              <div>会话有效期：7 天</div>
            </div>
            <button
              onClick={handleLogout}
              disabled={loading}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm text-white transition hover:bg-red-400 disabled:opacity-50"
            >
              <FontAwesomeIcon icon={faSignOutAlt} />
              登出
            </button>
          </div>
        </PreviewContainer>

        {/* 配置/状态 */}
        <PreviewContainer>
          <div className="p-4">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-gray-800 dark:text-gray-100">
              <FontAwesomeIcon icon={faInfoCircle} />
              配置与状态
            </h2>
            <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
              <div>网站标题：{siteConfig.title}</div>
              <div>天翼云挂载路径：{siteConfig.tianyiMountPath || '（未启用）'}</div>
              <div>OneDrive 挂载路径：{siteConfig.onedriveMountPath || '（未启用）'}</div>
              <div>每页最大文件数：{siteConfig.maxItems}</div>
              <div>
                构建版本：{process.env.NEXT_PUBLIC_GIT_COMMIT_HASH || 'unknown'} @{' '}
                {process.env.NEXT_PUBLIC_BUILD_DATE || 'unknown'}
              </div>
              <div>Redis 前缀：{siteConfig.kvPrefix || '（无）'}</div>
            </div>
          </div>
        </PreviewContainer>

        {/* 私密目录管理 */}
        <PreviewContainer>
          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-gray-800 dark:text-gray-100">
                <FontAwesomeIcon icon={faShieldAlt} />
                私密目录管理
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={refreshProtectedRoutes}
                  disabled={loading}
                  className="rounded bg-gray-200 px-3 py-1 text-xs text-gray-700 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                >
                  <FontAwesomeIcon icon={faSyncAlt} /> 刷新
                </button>
                <button
                  onClick={resetProtectedRoutes}
                  disabled={loading}
                  className="rounded bg-gray-200 px-3 py-1 text-xs text-gray-700 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                >
                  重置为环境变量
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {/* 天翼云私密目录 */}
              <div>
                <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  天翼云（相对挂载点内部路径）
                </div>
                <div className="mb-2 flex gap-2">
                  <input
                    type="text"
                    value={newTyRoute}
                    onChange={e => setNewTyRoute(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTyRoute())}
                    placeholder="/私密目录/子路径"
                    className="flex-1 rounded border border-gray-300 bg-white/60 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800/60 dark:text-gray-100"
                  />
                  <button
                    onClick={addTyRoute}
                    className="rounded bg-blue-500 px-3 py-1 text-xs text-white hover:bg-blue-400"
                  >
                    <FontAwesomeIcon icon={faPlus} /> 添加
                  </button>
                </div>
                <div className="space-y-1">
                  {tyRoutes.length === 0 && (
                    <div className="text-xs text-gray-400">（空）</div>
                  )}
                  {tyRoutes.map(r => (
                    <div
                      key={r}
                      className="flex items-center justify-between rounded bg-gray-100 px-2 py-1 text-sm dark:bg-gray-800"
                    >
                      <span className="truncate font-mono text-gray-700 dark:text-gray-200">{r}</span>
                      <button
                        onClick={() => removeTyRoute(r)}
                        className="ml-2 text-red-500 hover:text-red-700"
                      >
                        <FontAwesomeIcon icon={faTimes} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* OneDrive 私密目录 */}
              <div>
                <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  OneDrive（相对 BASE_DIRECTORY 内部路径）
                </div>
                <div className="mb-2 flex gap-2">
                  <input
                    type="text"
                    value={newOdRoute}
                    onChange={e => setNewOdRoute(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addOdRoute())}
                    placeholder="/私密目录/子路径"
                    className="flex-1 rounded border border-gray-300 bg-white/60 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800/60 dark:text-gray-100"
                  />
                  <button
                    onClick={addOdRoute}
                    className="rounded bg-blue-500 px-3 py-1 text-xs text-white hover:bg-blue-400"
                  >
                    <FontAwesomeIcon icon={faPlus} /> 添加
                  </button>
                </div>
                <div className="space-y-1">
                  {odRoutes.length === 0 && (
                    <div className="text-xs text-gray-400">（空）</div>
                  )}
                  {odRoutes.map(r => (
                    <div
                      key={r}
                      className="flex items-center justify-between rounded bg-gray-100 px-2 py-1 text-sm dark:bg-gray-800"
                    >
                      <span className="truncate font-mono text-gray-700 dark:text-gray-200">{r}</span>
                      <button
                        onClick={() => removeOdRoute(r)}
                        className="ml-2 text-red-500 hover:text-red-700"
                      >
                        <FontAwesomeIcon icon={faTimes} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={saveProtectedRoutes}
              disabled={loading}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm text-white transition hover:bg-green-400 disabled:opacity-50"
            >
              <FontAwesomeIcon icon={faSyncAlt} />
              {loading ? '保存中...' : '保存私密目录'}
            </button>
          </div>
        </PreviewContainer>

        {/* 缓存管理 */}
        <PreviewContainer>
          <div className="p-4">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-gray-800 dark:text-gray-100">
              <FontAwesomeIcon icon={faTrashAlt} />
              缓存管理
            </h2>
            <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
              清除云盘缓存的 session，下次请求会重新登录云盘。适用于云盘凭证变更后强制刷新。
            </p>
            <button
              onClick={handleClearCache}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm text-white transition hover:bg-orange-400 disabled:opacity-50"
            >
              <FontAwesomeIcon icon={faTrashAlt} />
              {loading ? '清除中...' : '清除云盘缓存'}
            </button>
          </div>
        </PreviewContainer>
      </div>
      <Footer />
    </>
  )
}

export async function getServerSideProps({ req, locale }: GetServerSidePropsContext) {
  const token = getTokenFromReq(req as any)
  const session = await verifyAdminSession(token)

  if (!session) {
    return {
      redirect: {
        destination: '/@login?redirect=/@manage',
        permanent: false,
      },
    }
  }

  const [ty, od] = await Promise.all([getProtectedRoutes(), getProtectedRoutesOd()])

  return {
    props: {
      initialIsAdmin: true,
      initialSession: {
        username: session.username,
        createdAt: session.createdAt,
        lastAccessAt: session.lastAccessAt,
      },
      initialProtectedRoutes: ty,
      initialProtectedRoutesOd: od,
      ...(await serverSideTranslations(locale || 'zh-CN', ['common'])),
    },
  }
}
