import { Fragment, useCallback, useLayoutEffect, useRef, useState } from 'react'
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

// 面包屑栏带有 backdrop-filter，弹窗 portal 到 body 以保留真实毛玻璃效果。
// 使用文档坐标定位，让弹窗随页面自然滚动，不依赖滚动事件追踪。
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : () => {}

const SwitchLayout = () => {
  const [preferredLayout, setPreferredLayout] = useLocalStorage('preferredLayout', layouts[0])
  const [anchor, setAnchor] = useState({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const optionsRef = useRef<HTMLElement | null>(null)

  const { t } = useTranslation()

  const updateAnchor = useCallback(() => {
    const button = buttonRef.current
    const options = optionsRef.current
    if (!button || !options) return

    const rect = button.getBoundingClientRect()
    setAnchor({
      top: rect.bottom + window.scrollY + 6,
      left: rect.right + window.scrollX - options.offsetWidth,
    })
  }, [])

  const setOptionsNode = useCallback(
    (node: HTMLElement | null) => {
      optionsRef.current = node
      if (node) updateAnchor()
    },
    [updateAnchor]
  )

  return (
    <div className="relative w-fit flex-shrink-0 text-sm text-gray-600 dark:text-gray-300">
      <Listbox value={preferredLayout} onChange={setPreferredLayout}>
        {({ open }) => (
          <>
            <Listbox.Button ref={buttonRef} className="relative -translate-x-1 cursor-pointer rounded text-right">
              <span className="pointer-events-none flex items-center justify-end">
                <FontAwesomeIcon className="mr-2 h-3 w-3" icon={preferredLayout.icon} />
                <span>{t(preferredLayout.name)}</span>
              </span>
            </Listbox.Button>

            <PositionTracker open={open} onUpdate={updateAnchor} />

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
                  ref={setOptionsNode}
                  static
                  className="absolute z-30 max-h-[calc(100vh-1rem)] w-28 origin-top-right overflow-auto rounded-2xl p-1 text-sm shadow-lg focus:outline-none"
                  style={{
                    top: anchor.top,
                    left: anchor.left,
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

const PositionTracker = ({ open, onUpdate }: { open: boolean; onUpdate: () => void }) => {
  useIsomorphicLayoutEffect(() => {
    if (open) onUpdate()
  }, [open, onUpdate])
  return null
}

export default SwitchLayout
