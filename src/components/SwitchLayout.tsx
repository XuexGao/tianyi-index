import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IconProp } from '@fortawesome/fontawesome-svg-core'
import { faList, faGrip } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Listbox, Portal, Transition } from '@headlessui/react'
import { useTranslation } from 'next-i18next'

import useLocalStorage from '../utils/useLocalStorage'

export const layouts: Array<{ id: number; name: 'Grid' | 'List'; icon: IconProp }> = [
  { id: 1, name: 'List', icon: faList },
  { id: 2, name: 'Grid', icon: faGrip },
]

// 面包屑栏本身带 backdrop-filter，会成为子元素的 backdrop root，令弹窗的毛玻璃失效。
// 因此把弹窗 portal 到 body，并用按钮的实际位置做 fixed 定位。
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

const SwitchLayout = () => {
  const [preferredLayout, setPreferredLayout] = useLocalStorage('preferredLayout', layouts[0])

  const { t } = useTranslation()

  const buttonRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState({ top: 0, right: 0 })

  const updateAnchor = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setAnchor({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) })
  }, [])

  return (
    <div className="relative w-fit flex-shrink-0 text-sm text-gray-600 dark:text-gray-300">
      <Listbox value={preferredLayout} onChange={setPreferredLayout}>
        {({ open }) => (
          <>
            <Listbox.Button
              ref={buttonRef}
              onClick={updateAnchor}
              className="relative w-full cursor-pointer rounded pr-4 text-right"
            >
              <span className="pointer-events-none flex items-center justify-end">
                <FontAwesomeIcon className="mr-2 h-3 w-3" icon={preferredLayout.icon} />
                <span>{t(preferredLayout.name)}</span>
              </span>
            </Listbox.Button>

            <AnchorTracker open={open} onUpdate={updateAnchor} />

            <Portal>
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
                  className="fixed z-30 w-28 origin-top-right overflow-auto rounded-2xl p-1 text-sm shadow-lg focus:outline-none"
                  style={{
                    top: anchor.top,
                    right: anchor.right,
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
            </Portal>
          </>
        )}
      </Listbox>
    </div>
  )
}

// 打开时同步一次位置，并在滚动/缩放时跟随按钮
const AnchorTracker = ({ open, onUpdate }: { open: boolean; onUpdate: () => void }) => {
  useIsomorphicLayoutEffect(() => {
    if (!open) return
    onUpdate()
    window.addEventListener('scroll', onUpdate, true)
    window.addEventListener('resize', onUpdate)
    return () => {
      window.removeEventListener('scroll', onUpdate, true)
      window.removeEventListener('resize', onUpdate)
    }
  }, [open, onUpdate])
  return null
}

export default SwitchLayout
