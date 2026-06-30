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

const SwitchLayout = () => {
  const [preferredLayout, setPreferredLayout] = useLocalStorage('preferredLayout', layouts[0])

  const { t } = useTranslation()

  return (
    <div className="relative w-fit flex-shrink-0 text-sm text-gray-600 dark:text-gray-300">
      <Listbox value={preferredLayout} onChange={setPreferredLayout}>
        <Listbox.Button className="relative w-full cursor-pointer rounded pr-4 text-right">
          <span className="pointer-events-none flex items-center justify-end">
            <FontAwesomeIcon className="mr-2 h-3 w-3" icon={preferredLayout.icon} />
            <span>
              {
                // t('Grid')
                // t('List')
                t(preferredLayout.name)
              }
            </span>
          </span>
        </Listbox.Button>

        <Transition
          as={Fragment}
          enter="transition duration-100 ease-out"
          enterFrom="transform scale-95 opacity-0"
          enterTo="transform scale-100 opacity-100"
          leave="transition duration-75 ease-out"
          leaveFrom="transform scale-100 opacity-100"
          leaveTo="transform scale-95 opacity-0"
        >
          <Listbox.Options
            className="od-popup-isolate absolute right-0 z-20 mt-1 w-32 overflow-auto rounded-2xl py-1 shadow-lg focus:outline-none"
            style={{
              backgroundColor: 'rgba(255,255,255,0.55)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              border: 'none',
            }}
          >
            {layouts.map(layout => (
              <Listbox.Option
                key={layout.id}
                className={`${
                  layout.name === preferredLayout.name &&
                  'bg-blue-50 text-blue-700 dark:bg-blue-600/10 dark:text-blue-400'
                } relative flex cursor-pointer select-none items-center py-1.5 pl-3 text-gray-600 hover:opacity-80 dark:text-gray-300`}
                value={layout}
              >
                <FontAwesomeIcon className="mr-2 h-3 w-3" icon={layout.icon} />
                <span className={layout.name === preferredLayout.name ? 'font-medium' : 'font-normal'}>
                  {
                    // t('Grid')
                    // t('List')
                    t(layout.name)
                  }
                </span>
                {layout.name === preferredLayout.name && (
                  <span className="absolute inset-y-0 right-3 flex items-center">
                    <FontAwesomeIcon className="h-3 w-3" icon="check" />
                  </span>
                )}
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </Transition>
      </Listbox>
    </div>
  )
}

export default SwitchLayout
