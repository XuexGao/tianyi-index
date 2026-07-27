import { Fragment } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Menu, Transition } from '@headlessui/react'

import { useRouter } from 'next/router'
import Link from 'next/link'
import { useCookies, withCookies } from 'react-cookie'

// https://headlessui.dev/react/menu#integrating-with-next-js
const CustomLink = ({ href, children, as, locale, ...props }): JSX.Element => {
  return (
    <Link href={href} as={as} locale={locale} {...props}>
      {children}
    </Link>
  )
}

const localeText = (locale: string): string => {
  switch (locale) {
    case 'de-DE':
      return '🇩🇪 Deutsch'
    case 'en':
      return '🇬🇧 English'
    case 'es':
      return '🇪🇸 Español'
    case 'hi':
      return '🇮🇳 हिन्दी'
    case 'id':
      return '🇮🇩 Indonesia'
    case 'tr-TR':
      return '🇹🇷 Türkçe'
    case 'zh-CN':
      return '🇨🇳 简体中文'
    case 'zh-TW':
      return '🇨🇳 繁體中文'
    default:
      return '🇬🇧 English'
  }
}

const SwitchLang = () => {
  const { locales, pathname, query, asPath } = useRouter()

  const [_, setCookie] = useCookies(['NEXT_LOCALE'])

  return (
    <div className="relative">
      <Menu>
        <Menu.Button className="flex items-center space-x-1.5 hover:opacity-80 dark:text-white">
          <FontAwesomeIcon className="h-4 w-4" icon="language" />
          <FontAwesomeIcon className="h-3 w-3" icon="chevron-down" />
        </Menu.Button>

        <Transition
          as={Fragment}
          enter="transition duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
          enterFrom="opacity-0 scale-95 -translate-y-1"
          enterTo="opacity-100 scale-100 translate-y-0"
          leave="transition duration-150 ease-in"
          leaveFrom="opacity-100 scale-100 translate-y-0"
          leaveTo="opacity-0 scale-95 -translate-y-1"
        >
          {/* 文字颜色固定跟随明/暗色模式，不受 navbar 背景亮度采样（textColor）继承影响 */}
          <Menu.Items
            className="absolute top-0 right-0 z-20 mt-8 w-32 origin-top-right divide-y divide-gray-900/10 overflow-auto rounded-2xl text-gray-700 shadow-lg focus:outline-none dark:divide-gray-100/10 dark:text-gray-100"
            style={{
              backgroundColor: 'var(--dropdown-bg)',
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              border: 'none',
            }}
          >
            {locales!.map(locale => (
              <Menu.Item key={locale}>
                <CustomLink
                  key={locale}
                  href={{ pathname, query }}
                  as={asPath}
                  locale={locale}
                  onClick={() => setCookie('NEXT_LOCALE', locale, { path: '/' })}
                >
                  <div className="m-1 flex min-h-8 cursor-pointer items-center whitespace-nowrap rounded-xl px-3 py-1.5 text-left text-sm font-medium hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-600/10 dark:hover:text-blue-400">
                    {localeText(locale)}
                  </div>
                </CustomLink>
              </Menu.Item>
            ))}
          </Menu.Items>
        </Transition>
      </Menu>
    </div>
  )
}

export default withCookies(SwitchLang)
