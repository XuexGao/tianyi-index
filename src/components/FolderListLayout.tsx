import type { OdFolderChildren } from '../types'

import Link from 'next/link'
import { FC } from 'react'
import { useClipboard } from 'use-clipboard-copy'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useTranslation } from 'next-i18next'

import { getBaseUrl } from '../utils/getBaseUrl'
import { formatModifiedDateTime, formatModifiedDateTimeCompact, humanFileSize } from '../utils/fileDetails'

import { Downloading, Checkbox, ChildIcon, ChildName } from './FileListing'
import { getStoredToken } from '../utils/protectedRouteHandler'
import { VIRTUAL_ADMIN_FOLDER_ID, VIRTUAL_ONEDRIVE_FOLDER_ID, VIRTUAL_TIANYI_FOLDER_ID } from '../utils/driveResolver'

const FileListItem: FC<{ fileContent: OdFolderChildren; showSize?: boolean }> = ({ fileContent: c, showSize }) => {
  return (
    <div className="grid cursor-pointer grid-cols-10 items-center px-3 py-2.5">
      {/* 名字列：OneDrive 5 列 / 天翼云 6 列（与表头前 10 列分配一致） */}
      <div className={`${showSize ? 'col-span-5' : 'col-span-6'} flex items-center space-x-2 truncate pr-2`} title={c.name}>
        <div className="w-5 flex-shrink-0 text-center">
          <ChildIcon child={c} />
        </div>
        <ChildName name={c.name} folder={Boolean(c.folder)} />
      </div>
      {/* 时间列：OneDrive 手机端隐藏、桌面端 3 列；天翼云手机端 4 列右对齐、桌面端 4 列左对齐 */}
      <div className={`${showSize ? 'hidden md:block md:col-span-3' : 'col-span-4 md:col-span-4'} flex-shrink-0 truncate px-2 text-right font-mono text-sm text-gray-700 dark:text-gray-500 md:text-left`}>
        <span className="md:hidden">{formatModifiedDateTimeCompact(c.lastModifiedDateTime)}</span>
        <span className="hidden md:inline">{formatModifiedDateTime(c.lastModifiedDateTime)}</span>
      </div>
      {/* OneDrive 大小列：手机端 5 列右对齐、桌面端 2 列左对齐（与表头一致） */}
      {showSize && (
        <div className="col-span-5 flex-shrink-0 truncate px-2 text-right font-mono text-sm text-gray-700 dark:text-gray-500 md:col-span-2 md:text-left">
          {humanFileSize(c.size)}
        </div>
      )}
    </div>
  )
}

const FolderListLayout = ({
  path,
  backendPath,
  apiBase,
  drive,
  folderChildren,
  selected,
  toggleItemSelected,
  totalSelected,
  toggleTotalSelected,
  totalGenerating,
  handleSelectedDownload,
  folderGenerating,
  handleSelectedPermalink,
  handleFolderDownload,
  toast,
}) => {
  const clipboard = useClipboard()
  // getStoredToken 用后端路径 + drive 查私密目录 token
  const hashedToken = getStoredToken(backendPath, drive)

  const { t } = useTranslation()

  // Get item path from item name（带挂载前缀，用于导航 Link 和复制浏览器 permalink）
  const getItemPath = (name: string) => `${path === '/' ? '' : path}/${encodeURIComponent(name)}`
  // 后端路径版本（不带挂载前缀，用于 raw URL / handleFolderDownload）
  const getBackendItemPath = (name: string) => `${backendPath === '/' ? '' : backendPath}/${encodeURIComponent(name)}`

  // OneDrive 显示文件大小列；天翼云不显示
  const showSize = drive === 'od'

  return (
    <div className="od-files-container rounded bg-white shadow-sm dark:bg-gray-900 dark:text-gray-100">
      <div className="grid grid-cols-12 items-center border-b border-gray-900/10 px-3 dark:border-gray-500/30">
        <div className={`${showSize ? 'col-span-9 md:col-span-5' : 'col-span-7 md:col-span-6'} py-2 pr-2 text-xs font-bold uppercase tracking-widest text-gray-600 dark:text-gray-300`}>
          {t('Name')}
        </div>
        {/* 手机端右对齐、桌面端左对齐，与数据行 Last Modified 列对齐 */}
        {/* OneDrive 手机端隐藏时间列，只显示大小 */}
        <div className={`${showSize ? 'hidden md:block md:col-span-3' : 'col-span-5 md:col-span-4'} px-2 text-right text-xs font-bold uppercase tracking-widest text-gray-600 dark:text-gray-300 md:text-left`}>
          {t('Last Modified')}
        </div>
        {showSize && (
          <div className="col-span-3 px-2 text-right text-xs font-bold uppercase tracking-widest text-gray-600 dark:text-gray-300 md:col-span-2 md:text-left">
            {t('Size')}
          </div>
        )}
        <div className="hidden col-span-1 px-2 text-xs font-bold uppercase tracking-widest text-gray-600 dark:text-gray-300 md:block">
          {t('Actions')}
        </div>
        <div className="hidden col-span-1 px-2 text-xs font-bold uppercase tracking-widest text-gray-600 dark:text-gray-300 md:block">
          <div className="hidden p-1.5 text-gray-700 dark:text-gray-400 md:flex">
            <Checkbox
              checked={totalSelected}
              onChange={toggleTotalSelected}
              indeterminate={true}
              title={t('Select files')}
            />
            <button
              title={t('Copy selected files permalink')}
              className="cursor-pointer rounded p-1.5 hover:bg-gray-300 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-white dark:hover:bg-gray-600 disabled:dark:text-gray-600 disabled:hover:dark:bg-gray-900"
              disabled={totalSelected === 0}
              onClick={() => {
                clipboard.copy(handleSelectedPermalink(getBaseUrl()))
                toast.success(t('Copied selected files permalink.'))
              }}
            >
              <FontAwesomeIcon icon={['far', 'copy']} size="lg" />
            </button>
            {totalGenerating ? (
              <Downloading title={t('Downloading selected files, refresh page to cancel')} style="p-1.5" />
            ) : (
              <button
                title={t('Download selected files')}
                className="cursor-pointer rounded p-1.5 hover:bg-gray-300 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-white dark:hover:bg-gray-600 disabled:dark:text-gray-600 disabled:hover:dark:bg-gray-900"
                disabled={totalSelected === 0}
                onClick={handleSelectedDownload}
              >
                <FontAwesomeIcon icon={['far', 'arrow-alt-circle-down']} size="lg" />
              </button>
            )}
          </div>
        </div>
      </div>

      {folderChildren.map((c: OdFolderChildren) => (
        <div
          className="od-file-entry grid grid-cols-12 transition-all duration-100 hover:bg-gray-100 dark:hover:bg-gray-850"
          key={c.id}
        >
          <Link
            href={`${path === '/' ? '' : path}/${encodeURIComponent(c.name)}`}
            passHref
            className="col-span-12 md:col-span-10"
          >
            <FileListItem fileContent={c} showSize={showSize} />
          </Link>

          {c.folder ? (
            c.id === VIRTUAL_ONEDRIVE_FOLDER_ID || c.id === VIRTUAL_TIANYI_FOLDER_ID || c.id === VIRTUAL_ADMIN_FOLDER_ID ? (
              <div className="hidden col-span-1 md:block" />
            ) : (
              <div className="hidden col-span-1 items-center justify-center py-1.5 text-gray-700 dark:text-gray-400 md:flex">
                <span
                  title={t('Copy folder permalink')}
                  className="cursor-pointer rounded px-1.5 py-1 hover:bg-gray-300 dark:hover:bg-gray-600"
                  onClick={() => {
                    clipboard.copy(`${getBaseUrl()}${`${path === '/' ? '' : path}/${encodeURIComponent(c.name)}`}`)
                    toast(t('Copied folder permalink.'), { icon: '👌' })
                  }}
                >
                  <FontAwesomeIcon icon={['far', 'copy']} />
                </span>
                {folderGenerating[c.id] ? (
                  <Downloading title={t('Downloading folder, refresh page to cancel')} style="px-1.5 py-1" />
                ) : (
                  <span
                    title={t('Download folder')}
                    className="cursor-pointer rounded px-1.5 py-1 hover:bg-gray-300 dark:hover:bg-gray-600"
                    onClick={() => {
                      const p = getBackendItemPath(c.name)
                      handleFolderDownload(p, c.id, c.name)()
                    }}
                  >
                    <FontAwesomeIcon icon={['far', 'arrow-alt-circle-down']} />
                  </span>
                )}
              </div>
            )
          ) : (
            <div className="hidden col-span-1 items-center justify-center py-1.5 text-gray-700 dark:text-gray-400 md:flex">
              <span
                title={t('Copy raw file permalink')}
                className="cursor-pointer rounded px-1.5 py-1 hover:bg-gray-300 dark:hover:bg-gray-600"
                onClick={() => {
                  clipboard.copy(
                    `${getBaseUrl()}${apiBase}/raw/?path=${getBackendItemPath(c.name)}${hashedToken ? `&odpt=${hashedToken}` : ''}`
                  )
                  toast.success(t('Copied raw file permalink.'))
                }}
              >
                <FontAwesomeIcon icon={['far', 'copy']} />
              </span>
              <a
                title={t('Download file')}
                className="cursor-pointer rounded px-1.5 py-1 hover:bg-gray-300 dark:hover:bg-gray-600"
                href={`${apiBase}/raw/?path=${getBackendItemPath(c.name)}${hashedToken ? `&odpt=${hashedToken}` : ''}`}
              >
                <FontAwesomeIcon icon={['far', 'arrow-alt-circle-down']} />
              </a>
            </div>
          )}
          <div className="hidden col-span-1 items-center justify-center py-1.5 text-gray-700 dark:text-gray-400 md:flex">
            {!c.folder && !(c.name === '.password') && (
              <Checkbox
                checked={selected[c.id] ? 2 : 0}
                onChange={() => toggleItemSelected(c.id)}
                title={t('Select file')}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default FolderListLayout
