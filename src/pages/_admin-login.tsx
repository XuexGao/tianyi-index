import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { GetServerSidePropsContext } from 'next'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import { useTranslation } from 'next-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSignInAlt } from '@fortawesome/free-solid-svg-icons'

import Navbar from '../components/Navbar'
import { PreviewContainer } from '../components/previews/Containers'
import { verifyAdminSession } from '../utils/adminSessionStore'
import { getTokenFromReq } from '../utils/adminAuth'

/**
 * 管理员登录页
 * 路由：/@login（通过 next.config.js rewrites 映射到 /_admin-login）
 *
 * 已登录用户访问会被 middleware 重定向到 /@manage。
 */
export default function AdminLoginPage() {
  const router = useRouter()
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 安全：校验 redirect 必须是站内路径，防止开放重定向至外部恶意站点
  const rawRedirect = typeof router.query.redirect === 'string' ? router.query.redirect : '/@manage'
  const redirect = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/@manage'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!password) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '登录失败')
      } else {
        // 登录成功：立即写入 sessionStorage 和 window.__isAdmin，
        // 这样跳转后目标页 useIsAdmin 的 lazy initializer 能同步读到正确状态，
        // 避免首次渲染显示未登录内容（闪现）
        sessionStorage.setItem('admin_status', '1')
        if (typeof window !== 'undefined') {
          ;(window as any).__isAdmin = true
        }
        router.replace(redirect)
      }
    } catch (e: any) {
      setError(e?.message || '网络错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>登录 - {process.env.NEXT_PUBLIC_SITE_TITLE || 'TianYi-Index'}</title>
      </Head>
      <Navbar />
      <div className="mx-auto w-full max-w-md px-4 py-16">
        <PreviewContainer>
          <form onSubmit={handleSubmit} className="space-y-6 p-6">
            <div className="text-center">
              <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">管理员登录</h1>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                登录后可访问管理页面，并以双云盘模式浏览文件
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
                className="w-full rounded-lg border border-gray-300 bg-white/60 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800/60 dark:text-gray-100"
                placeholder="请输入管理员密码"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-600 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="flex w-full items-center justify-center space-x-2 rounded-lg bg-blue-500 px-4 py-2 text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FontAwesomeIcon icon={faSignInAlt} />
              <span>{loading ? '登录中...' : '登录'}</span>
            </button>
          </form>
        </PreviewContainer>
      </div>
    </>
  )
}

export async function getServerSideProps({ req, locale }: GetServerSidePropsContext) {
  // 已登录则重定向到管理页
  const token = getTokenFromReq(req as any)
  const session = await verifyAdminSession(token)
  if (session) {
    return {
      redirect: {
        destination: '/@manage',
        permanent: false,
      },
    }
  }

  return {
    props: {
      ...(await serverSideTranslations(locale || 'zh-CN', ['common'])),
    },
  }
}
