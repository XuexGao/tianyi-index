import type { OdFolderChildren } from '../types'

import Link from 'next/link'
import { FC } from 'react'
import { useClipboard } from 'use-clipboard-copy'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useTranslation } from 'next-i18next'

import { getBaseUrl } from '../utils/getBaseUrl'
import { formatModifiedDateTime, formatModifiedDateTimeCompact, humanFileSize } from '../utils/fileDetails'

import { ChildIcon, ChildName } from './FileListing'
import { getStoredToken } from '../utils/protectedRouteHandler'
import { VIRTUAL_ADMIN_FOLDER_ID, VIRTUAL_ONEDRIVE_FOLDER_ID, VIRTUAL_TIANYI_FOLDER_ID } from '../utils/driveResolver'

const FileListItem: FC<{ fileContent: OdFolderChildren; showSize?: boolean }> = ({ fileContent: c, showSize }) => {
  return (
    <div className={`grid cursor-pointer grid-cols-10 items-center transition-all duration-100 ${'folder' in c ? 'px-3 py-2.5 group-hover:px-2 group-hover:py-1.5' : 'px-3 py-2.5'}`}>
      {/* 名字列：OneDrive 5 列 / 天翼云 6 列 */}
      <div className={`${showSize ? 'col-span-7 md:col-span-5' : 'col-span-6'} flex items-center space-x-2 truncate pr-2`} title={c.name}>
        <div className="w-5 flex-shrink-0 text-center">
          <ChildIcon child={c} />
        </div>
        <ChildName name={c.name} folder={Boolean(c.folder)} />
      </div>
      {/* OneDrive 大小列居中：仅在 OD 模式下显示，位于名称和时间之间 */}
      {showSize && (
        <div className="col-span-2 hidden flex-shrink-0 truncate px-2 text-center font-mono text-sm text-gray-700 dark:text-white md:block">
          {humanFileSize(c.size)}
        </div>
      )}
      {/* 最后修改时间列：靠右对齐，深色模式白色文字 */}
      <div className={`${showSize ? 'col-span-3' : 'col-span-4'} flex-shrink-0 truncate px-2 text-right font-mono text-sm text-gray-700 dark:text-white`}>
        <span className="md:hidden">{formatModifiedDateTimeCompact(c.lastModifiedDateTime)}</span>
        <span className="hidden md:inline">{formatModifiedDateTime(c.lastModifiedDateTime)}</span>
      </div>
    </div>
  )
}

const FolderListLayout = ({
  path,
  backendPath,
  apiBase,
  drive,
  folderChildren,
  folderGenerating,
  handleFolderDownload,
  toast,
}) => {
  const clipboard = useClipboard()
  // getStoredToken 用后端路径 + drive 查私密目录 token
  const hashedToken = getStoredToken(backendPath, drive)

  const { t } = useTranslation()

  // 后端路径版本（不带挂载前缀，用于 raw URL / handleFolderDownload）
  const getBackendItemPath = (name: string) => `${backendPath === '/' ? '' : backendPath}/${encodeURIComponent(name)}`

  // OneDrive 显示文件大小列；天翼云不显示
  const showSize = drive === 'od'

  return (
    <div className="od-files-container rounded bg-white shadow-sm dark:bg-gray-900 dark:text-gray-100">
      {/* 表头 — 使用 grid-cols-10 与数据行 FileListItem 的 grid 列数保持一致 */}
      <div className="grid grid-cols-10 items-center border-b border-gray-900/10 px-3 dark:border-gray-500/30">
        <div className={`${showSize ? 'col-span-7 md:col-span-5' : 'col-span-6'} py-2 pr-2 text-xs font-bold uppercase tracking-widest text-gray-600 dark:text-gray-300`}>
          {t('Name')}
        </div>
        {/* OneDrive 大小列表头居中 */}
        {showSize && (
          <div className="col-span-2 hidden px-2 text-center text-xs font-bold uppercase tracking-widest text-gray-600 dark:text-gray-300 md:block">
            {t('Size')}
          </div>
        )}
        {/* 时间列表头靠右对齐 */}
        <div className={`${showSize ? 'col-span-3' : 'col-span-4'} whitespace-nowrap px-2 text-right text-xs font-bold uppercase tracking-widest text-gray-600 dark:text-gray-300`}>
          {t('Last Modified')}
        </div>
      </div>

      {folderChildren.map((c: OdFolderChildren) => (
        <div
          className="od-file-entry group transition-all duration-100 hover:bg-gray-100 dark:hover:bg-gray-850"
          key={c.id}
        >
          <Link
            href={`${path === '/' ? '' : path}/${encodeURIComponent(c.name)}`}
            passHref
          >
            <FileListItem fileContent={c} showSize={showSize} />
          </Link>
        </div>
      ))}
    </div>
  )
}

export default FolderListLayout