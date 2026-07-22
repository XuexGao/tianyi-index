import { Dispatch, Fragment, SetStateAction, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'next-i18next'
import { Dialog, Transition } from '@headlessui/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useClipboard } from 'use-clipboard-copy'

import { getBaseUrl } from '../utils/getBaseUrl'
import { getStoredToken, Drive } from '../utils/protectedRouteHandler'
import { getReadablePath } from '../utils/getReadablePath'

async function getSignedUrl(apiBase: string, path: string, drive: Drive): Promise<string> {
  const baseUrl = getBaseUrl()
  const hashedToken = getStoredToken(path, drive)
  if (!hashedToken) return `${baseUrl}${apiBase}/raw/?path=${path}`

  try {
    const res = await fetch('/api/auth/sign-protected-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, hash: hashedToken, drive }),
    })
    if (res.ok) {
      const { token } = await res.json()
      return `${baseUrl}${apiBase}/raw/?path=${path}&odpt=${encodeURIComponent(token)}`
    }
  } catch {}

  return `${baseUrl}${apiBase}/raw/?path=${path}&odpt=${hashedToken}`
}

function LinkContainer({ title, value }: { title: string; value: string }) {
  const clipboard = useClipboard({ copiedTimeout: 1000 })
  return (
    <>
      <h4 className="py-2 text-xs font-medium uppercase tracking-wider">{title}</h4>
      <div className="group relative mb-2 max-h-24 overflow-y-scroll break-all rounded border border-gray-400/20 bg-gray-50 p-2.5 font-mono dark:bg-gray-800">
        <div className="opacity-80">{value}</div>
        <button
          onClick={() => clipboard.copy(value)}
          className="absolute top-[0.2rem] right-[0.2rem] w-8 rounded border border-gray-400/40 bg-gray-100 py-1.5 opacity-0 transition-all duration-100 hover:bg-gray-200 group-hover:opacity-100 dark:bg-gray-850 dark:hover:bg-gray-700"
        >
          {clipboard.copied ? <FontAwesomeIcon icon="check" /> : <FontAwesomeIcon icon="copy" />}
        </button>
      </div>
    </>
  )
}

export default function CustomEmbedLinkMenu({
  backendPath,
  apiBase,
  drive,
  menuOpen,
  setMenuOpen,
}: {
  backendPath: string
  apiBase: string
  drive: Drive
  menuOpen: boolean
  setMenuOpen: Dispatch<SetStateAction<boolean>>
}) {
  const { t } = useTranslation()

  const hashedToken = getStoredToken(backendPath, drive)
  const [signedUrl, setSignedUrl] = useState('')

  useEffect(() => {
    if (menuOpen && hashedToken) {
      getSignedUrl(apiBase, backendPath, drive).then(setSignedUrl)
    } else if (menuOpen && !hashedToken) {
      setSignedUrl(`${getBaseUrl()}${apiBase}/raw/?path=${backendPath}`)
    }
  }, [menuOpen, backendPath, apiBase, drive, hashedToken])

  const focusInputRef = useRef<HTMLInputElement>(null)
  const closeMenu = () => setMenuOpen(false)

  const readablePath = getReadablePath(backendPath)
  const filename = readablePath.substring(readablePath.lastIndexOf('/') + 1)
  const [name, setName] = useState(filename)

  return (
    <Transition appear show={menuOpen} as={Fragment}>
      <Dialog as="div" className="fixed inset-0 z-10 overflow-y-auto" onClose={closeMenu} initialFocus={focusInputRef}>
        <div className="min-h-screen px-4 text-center">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-100"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Dialog.Overlay className="fixed inset-0 bg-white/60 dark:bg-gray-800/60" />
          </Transition.Child>

          <span className="inline-block h-screen align-middle" aria-hidden="true">
            &#8203;
          </span>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-100"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-100"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <div className="inline-block max-h-[80vh] w-full max-w-3xl transform overflow-hidden overflow-y-scroll rounded border border-gray-400/30 bg-white p-4 text-left align-middle text-sm shadow-xl transition-all dark:bg-gray-900 dark:text-white">
              <Dialog.Title as="h3" className="py-2 text-xl font-bold">
                {t('Customise direct link')}
              </Dialog.Title>
              <Dialog.Description as="p" className="py-2 opacity-80">
                <>
                  {t('Change the raw file direct link to a URL ending with the extension of the file.')}{' '}
                  <a
                    href="https://ovi.swo.moe/docs/features/customise-direct-link"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 underline"
                  >
                    {t('What is this?')}
                  </a>
                </>
              </Dialog.Description>

              <div className="mt-4">
                <h4 className="py-2 text-xs font-medium uppercase tracking-wider">{t('Filename')}</h4>
                <input
                  className="mb-2 w-full rounded border border-gray-600/10 p-2.5 font-mono focus:outline-none focus:ring focus:ring-blue-300 dark:bg-gray-600 dark:text-white dark:focus:ring-blue-700"
                  ref={focusInputRef}
                  value={name}
                  onChange={e => setName(e.target.value)}
                />

                <LinkContainer
                  title={t('Default')}
                  value={signedUrl || `${getBaseUrl()}${apiBase}/raw/?path=${readablePath}${hashedToken ? `&odpt=${hashedToken}` : ''}`}
                />
                <LinkContainer
                  title={t('URL encoded')}
                  value={signedUrl || `${getBaseUrl()}${apiBase}/raw/?path=${backendPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`}
                />
              </div>
            </div>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  )
}
