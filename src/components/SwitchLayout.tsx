import { Fragment } from 'react'
import { IconProp } from '@fortawesome/fontawesome-svg-core'
import { faList, faGrip } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Listbox, Transition } from '@headlessui/react'
import { useTranslation } from 'next-i18next'

import useLocalStorage from '../utils/useLocalStorage'

export const layouts: Array<{ id: number; name: 'Grid' | 'List'; icon: IconProp }> = [
  { id: 1, name: 'List', icon: faList },
  { id: 2, name: 'Grid', icon: faGrip },
]

// 面包屑栏带有 backdrop-filter，弹窗使用明确背景避免被父级图层影响。
// 弹窗直接锚定在按钮容器内，随页面滚动同步移动，不依赖异步坐标更新。
const SwitchLayout = () => {
  const [preferredLayout, setPreferredLayout] = useLocalStorage('preferredLayout', layouts[0])

  const { t } = useTranslation()

  return (
    <div className="relative w-fit flex-shrink-0 text-sm text-gray-600 dark:text-gray-300">
      <Listbox value={preferredLayout} onChange={setPreferredLayout}>
        {({ open }) => (
          <>
            <Listbox.Button className="relative -translate-x-1 cursor-pointer rounded text-right">
              <span className="pointer-events-none flex items-center justify-end">
                <FontAwesomeIcon className="mr-2 h-3 w-3" icon={preferredLayout.icon} />
                <span>{t(preferredLayout.name)}</span>
              </span>
            </Listbox.Button>

            <Transition
              show={open}
              as={Fragment}
              enter="transition duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
              enterFrom="opacity-0 scale-95 -translate-y-1"
              enterTo="opacity-100 scale-100 translate-y-0"
              leave="transition duration-150 ease-in"
              leaveFrom="opacity-100 scale-100 translate-y-0"
              leaveTo="opacity-0 scale-95 -translate-y-1"
            >
              <Listbox.Options
                static
                className="absolute right-0 top-full z-30 mt-1 max-h-[calc(100vh-1rem)] w-28 origin-top-right overflow-auto rounded-2xl p-1 text-sm shadow-lg focus:outline-none"
                style={{
                  backgroundColor: 'var(--switch-layout-bg)',
                  backdropFilter: 'var(--glass-blur)',
                  WebkitBackdropFilter: 'var(--glass-blur)',
                  border: 'none',
                }}
              >
                {layouts.map(layout => (
                  <Listbox.Option
                    key={layout.id}
                    className={`${
                      layout.name === preferredLayout.name &&
                      'bg-blue-50 text-blue-700 dark:bg-blue-600/10 dark:text-blue-400'
                    } relative flex cursor-pointer select-none items-center rounded-xl py-1 pl-2.5 text-gray-600 transition-opacity hover:opacity-80 dark:text-gray-300`}
                    value={layout}
                  >
                    <FontAwesomeIcon className="mr-2 h-3 w-3" icon={layout.icon} />
                    <span className={layout.name === preferredLayout.name ? 'font-medium' : 'font-normal'}>
                      {t(layout.name)}
                    </span>
                    {layout.name === preferredLayout.name && (
                      <span className="absolute inset-y-0 right-2.5 flex items-center">
                        <FontAwesomeIcon className="h-3 w-3" icon="check" />
                      </span>
                    )}
                  </Listbox.Option>
                ))}
              </Listbox.Options>
            </Transition>
          </>
        )}
      </Listbox>
    </div>
  )
}

export default SwitchLayout
