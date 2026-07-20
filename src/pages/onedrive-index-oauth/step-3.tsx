import Head from 'next/head'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useTranslation, Trans } from 'next-i18next'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'

import siteConfig from '../../../config/site.config'
import Navbar from '../../components/Navbar'
import Footer from '../../components/Footer'

import { getAuthPersonInfo, requestTokenWithAuthCode } from '../../utils/oAuthHandler'
import { LoadingIcon } from '../../components/Loading'
import { getAccessToken } from '../api/od'

export async function getServerSideProps({ query, locale }) {
  const { authCode } = query
  const clientId = process.env.CLIENT_ID || ''
  const clientSecret = process.env.CLIENT_SECRET || ''
  const userPrincipalName = process.env.USER_PRINCIPAL_NAME || ''

  // Check if OAuth authentication has been completed
  // 同 step-1/2：CRYPTO_SECRET 未配置时 getAccessToken 抛错，try/catch 让页面正常渲染
  let existingAccessToken = ''
  try {
    existingAccessToken = await getAccessToken()
  } catch {
    // 忽略，继续走 token 交换流程（错误会在 requestTokenWithAuthCode 处给出明确提示）
  }
  if (existingAccessToken) {
    // If OAuth authentication has been completed, redirect to the homepage
    return {
      redirect: {
        destination: '/',
        permanent: false,
      },
    }
  }
  // If the OAuth authentication is not completed, continue the process of OAuth authentication
  if (!authCode) {
    return {
      props: {
        error: 'No auth code present',
        description: 'Where is the auth code? Did you follow step 2 you silly donut?',
        ...(await serverSideTranslations(locale, ['common'])),
      },
    }
  }
  const config = { clientId, clientSecret, userPrincipalName }
  const response = await requestTokenWithAuthCode(authCode, config)

  // If error response, return invalid
  if ('error' in response) {
    return {
      props: {
        error: response.error,
        description: response.errorDescription,
        errorUri: response.errorUri,
        ...(await serverSideTranslations(locale, ['common'])),
      },
    }
  }

  const { expiryTime, accessToken, refreshToken } = response

  // 安全：身份校验与 token 存储全部在服务端完成，access/refresh token 不下发到客户端，
  // 避免其出现在 SSR HTML / 浏览器内存中。
  try {
    const { data, status } = await getAuthPersonInfo(accessToken)
    if (status !== 200) {
      return {
        props: {
          error: 'Error validating identify, restart',
          description: 'Microsoft Graph API returned non-200 status.',
          ...(await serverSideTranslations(locale, ['common'])),
        },
      }
    }
    if (data.userPrincipalName !== userPrincipalName) {
      return {
        props: {
          error: 'Do not pretend to be the site owner',
          description: 'The authenticated account does not match USER_PRINCIPAL_NAME.',
          ...(await serverSideTranslations(locale, ['common'])),
        },
      }
    }
    const { storeOdAuthTokens } = await import('../../utils/odAuthTokenStore')
    await storeOdAuthTokens({ accessToken, accessTokenExpiry: parseInt(expiryTime), refreshToken })
  } catch (e: any) {
    return {
      props: {
        error: 'Error storing the token',
        description: e?.message || 'Unknown error',
        ...(await serverSideTranslations(locale, ['common'])),
      },
    }
  }

  return {
    props: {
      error: null,
      stored: true,
      ...(await serverSideTranslations(locale, ['common'])),
    },
  }
}

export default function OAuthStep3({ error, description, errorUri, stored }) {
  const router = useRouter()

  const { t } = useTranslation()

  useEffect(() => {
    if (stored) {
      const timer = setTimeout(() => {
        router.push('/')
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [stored, router])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white dark:bg-gray-900">
      <Head>
        <title>{t('OAuth Step 3 - {{title}}', { title: siteConfig.title })}</title>
      </Head>

      <main className="flex w-full flex-1 flex-col bg-gray-50 dark:bg-gray-800">
        <Navbar />

        <div className="mx-auto w-full max-w-5xl p-4">
          <div className="rounded bg-white p-3 dark:bg-gray-900 dark:text-gray-100">
            <div className="mx-auto w-52">
              <Image
                src="/images/fabulous-celebration.png"
                width={912}
                height={912}
                alt="fabulous celebration"
                priority
              />
            </div>
            <h3 className="mb-4 text-center text-xl font-medium">
              {t('Welcome to your new OneDrive-Index 🎉')}
            </h3>

            <h3 className="mt-4 mb-2 text-lg font-medium">{t('Step 3/3: Get access and refresh tokens')}</h3>
            {error ? (
              <div>
                <p className="py-1 font-medium text-red-500">
                  <FontAwesomeIcon icon="exclamation-circle" className="mr-2" />
                  <span>
                    {t('Whoops, looks like we got a problem: {{error}}.', {
                      error: t(error),
                    })}
                  </span>
                </p>
                <p className="my-2 whitespace-pre-line rounded border border-gray-400/20 bg-gray-50 p-2 font-mono text-sm opacity-80 dark:bg-gray-800">
                  {t(description)}
                </p>
                {errorUri && (
                  <p>
                    <Trans>
                      Check out{' '}
                      <a
                        href={errorUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline dark:text-blue-500"
                      >
                        Microsoft&apos;s official explanation
                      </a>{' '}
                      on the error message.
                    </Trans>
                  </p>
                )}
                <div className="mb-2 mt-6 text-right">
                  <button
                    className="rounded-lg bg-gradient-to-br from-red-500 to-orange-400 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-gradient-to-bl focus:ring-4 focus:ring-red-200 disabled:cursor-not-allowed disabled:grayscale dark:focus:ring-red-800"
                    onClick={() => {
                      router.push('/onedrive-index-oauth/step-1')
                    }}
                  >
                    <FontAwesomeIcon icon="arrow-left" /> <span>{t('Restart')}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="py-1 font-medium">{t('Success! The API returned what we needed.')}</p>
                <p className="py-1">
                  <FontAwesomeIcon icon={['far', 'check-circle']} className="text-green-500" />{' '}
                  {t('Stored! Going home...')}
                </p>
                <p className="py-1 text-sm font-medium text-teal-500">
                  <FontAwesomeIcon icon="exclamation-circle" className="mr-1" />{' '}
                  {t('These tokens may take a few seconds to populate after you click the button below. ') +
                    t('If you go back home and still see the welcome page telling you to re-authenticate, ') +
                    t('revisit home and do a hard refresh.')}
                </p>
                <div className="mb-2 mt-6 text-right">
                  <button
                    className="rounded-lg bg-gradient-to-br from-green-500 to-teal-300 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-gradient-to-bl focus:ring-4 focus:ring-green-200 disabled:cursor-not-allowed disabled:grayscale dark:focus:ring-green-800"
                    onClick={() => router.push('/')}
                  >
                    <LoadingIcon className="mr-2 inline h-4 w-4 animate-spin" />
                    <span>{t('Stored! Going home...')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
