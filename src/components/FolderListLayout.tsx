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
    <div className="grid cursor-pointer grid-cols-10 items-center px-1 py-1.5">
      {/* 名字列：OD 移动端 8 列/桌面 5 列，天翼云 6 列 */}
      <div className={`${showSize ? 'col-span-8 md:col-span-5' : 'col-span-6'} flex items-center space-x-2 truncate pr-2`} title={c.name}>
        <div className="w-5 flex-shrink-0 text-center">
          <ChildIcon child={c} />
        </div>
        <ChildName name={c.name} folder={Boolean(c.folder)} />
      </div>
      {/* OD 大小列：移动端靠右对齐，桌面居中 */}
      {showSize && (
        <div className="col-span-2 flex-shrink-0 truncate px-2 text-right font-mono text-sm text-gray-700 dark:text-white md:text-center">
          {humanFileSize(c.size)}
        </div>
      )}
      {/* 最后修改时间列：OD 桌面显示/移动端隐藏，天翼云始终显示 */}
      <div className={`${showSize ? 'hidden md:block md:col-span-3' : 'col-span-4'} flex-shrink-0 truncate px-2 text-right font-mono text-sm text-gray-700 dark:text-white`}>
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
        <div className={`${showSize ? 'col-span-8 md:col-span-5' : 'col-span-6'} py-2 pr-2 text-xs font-bold uppercase tracking-widest text-gray-600 dark:text-gray-300`}>
          {t('Name')}
        </div>
        {/* OD 大小列表头：移动端靠右、桌面居中 */}
        {showSize && (
          <div className="col-span-2 px-2 text-right text-xs font-bold uppercase tracking-widest text-gray-600 dark:text-gray-300 md:text-center">
            {t('Size')}
          </div>
        )}
        {/* 时间列表头：OD 桌面显示/移动端隐藏，天翼云始终显示 */}
        <div className={`${showSize ? 'hidden md:block md:col-span-3' : 'col-span-4'} px-2 text-right text-xs font-bold uppercase tracking-widest text-gray-600 dark:text-gray-300`}>
          {t('Last Modified')}
        </div>
      </div>

      {folderChildren.map((c: OdFolderChildren) => (
        <div
          className="od-file-entry mx-2 my-1 rounded-lg transition-all duration-100 hover:bg-gray-100 dark:hover:bg-gray-850"
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
