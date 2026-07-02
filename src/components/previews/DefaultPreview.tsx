import type { OdFileObject } from '../../types'
import { FC } from 'react'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useTranslation } from 'next-i18next'

import { getFileIcon } from '../../utils/getFileIcon'
import { formatModifiedDateTime, humanFileSize } from '../../utils/fileDetails'

import DownloadButtonGroup from '../DownloadBtnGtoup'
import { DownloadBtnContainer, PreviewContainer } from './Containers'

const DefaultPreview: FC<{ file: OdFileObject }> = ({ file }) => {
  const { t } = useTranslation()

  return (
    <div>
      <PreviewContainer>
        <div className="items-center px-5 py-4 md:flex md:space-x-8">
          <div className="rounded-lg border border-gray-900/10 px-8 py-20 text-center dark:border-gray-500/30">
            <FontAwesomeIcon icon={getFileIcon(file.name, { video: Boolean(file.video) })} />
            <div className="mt-6 text-sm font-medium line-clamp-3 md:w-28">{file.name}</div>
          </div>

          <div className="flex flex-col space-y-2 py-4 md:flex-1">
            <div>
              <div className="py-2 text-xs font-medium uppercase opacity-80">{t('Last modified')}</div>
              <div>{formatModifiedDateTime(file.lastModifiedDateTime)}</div>
            </div>

            <div>
              <div className="py-2 text-xs font-medium uppercase opacity-80">{t('File size')}</div>
              <div>{humanFileSize(file.size)}</div>
            </div>

            <div>
              <div className="py-2 text-xs font-medium uppercase opacity-80">{t('MIME type')}</div>
              <div>{file.file?.mimeType ?? t('Unavailable')}</div>
            </div>
          </div>
        </div>
      </PreviewContainer>
      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>
    </div>
  )
}

export default DefaultPreview
