import { useState } from 'react'
import Image from 'next/image'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Trans, useTranslation } from 'next-i18next'

const FourOhFour: React.FC<{ errorMsg: string }> = ({ errorMsg }) => {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      // 优先用 Clipboard API（HTTPS 下可用，写入不留痕）
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(errorMsg)
      } else {
        // 降级：临时 textarea + execCommand（兼容 HTTP / 旧浏览器）
        const ta = document.createElement('textarea')
        ta.value = errorMsg
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 复制失败时静默，用户可手动选中复制
    }
  }

  return (
    <div className="my-12">
      <div className="mx-auto w-1/3">
        <Image src="/images/fabulous-rip-2.png" alt="404" width={912} height={912} priority />
      </div>
      <div className="mx-auto mt-6 max-w-xl text-gray-500">
        <div className="mb-8 text-xl font-bold">
          <Trans>
            {/* eslint-disable-next-line react/no-unescaped-entities */}
            Oops, that's a <span className="underline decoration-red-500 decoration-wavy">four-oh-four</span>.
          </Trans>
        </div>
        <div className="group relative mb-4 overflow-hidden break-all rounded border border-gray-400/20 bg-gray-50 p-2 pr-10 font-mono text-xs dark:bg-gray-800">
          {errorMsg}
          <button
            type="button"
            onClick={handleCopy}
            title={t('Copy error message') as string}
            aria-label={t('Copy error message') as string}
            className="absolute right-1.5 top-1.5 rounded p-1 text-gray-500 opacity-60 transition hover:bg-gray-200 hover:text-gray-700 hover:opacity-100 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            <FontAwesomeIcon icon={copied ? 'check' : ['far', 'copy']} />
          </button>
        </div>
        <div className="text-sm">
          <Trans>
            Press{' '}
            <kbd className="rounded border border-gray-400/20 bg-gray-100 px-1 font-mono text-xs dark:bg-gray-800">
              F12
            </kbd>{' '}
            and open devtools for more details, or seek help at{' '}
            <a
              className="text-blue-600 hover:text-blue-700 hover:underline"
              href="https://github.com/XuexGao/tianyi-index/issues"
              target="_blank"
              rel="noopener noreferrer"
            >
              tianyi-index issues
            </a>
            .
          </Trans>
        </div>
      </div>
    </div>
  )
}

export default FourOhFour
