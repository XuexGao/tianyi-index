import type { OdFileObject, OdFolderChildren, OdFolderObject } from '../types'
import { ParsedUrlQuery } from 'querystring'
import { FC, MouseEventHandler, SetStateAction, useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import toast, { Toaster } from 'react-hot-toast'
import emojiRegex from 'emoji-regex'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { useTranslation } from 'next-i18next'

import useLocalStorage from '../utils/useLocalStorage'
import { getPreviewType, preview } from '../utils/getPreviewType'
import { useProtectedSWRInfinite } from '../utils/fetchWithSWR'
import { useExpandTransition } from '../utils/useExpandTransition'
import { getExtension, getRawExtension, getFileIcon } from '../utils/getFileIcon'
import { getStoredToken, Drive } from '../utils/protectedRouteHandler'
import { resolveDrive, ONEDRIVE_ENABLED, VIRTUAL_ADMIN_FOLDER_ID, VIRTUAL_TIANYI_FOLDER_ID, VIRTUAL_ONEDRIVE_FOLDER_ID, ADMIN_TY_FOLDER_NAME, ADMIN_OD_FOLDER_NAME } from '../utils/driveResolver'
import siteConfig from '../../config/site.config'
import { useIsAdmin } from '../utils/useIsAdmin'
import {
  DownloadingToast,
  downloadMultipleFiles,
  downloadTreelikeMultipleFiles,
  traverseFolder,
} from './MultiFileDownloader'

import { layouts } from './SwitchLayout'
import { LoadingIcon } from './Loading'
import FourOhFour from './FourOhFour'
import Auth from './Auth'
import TextPreview from './previews/TextPreview'
import MarkdownPreview from './previews/MarkdownPreview'
import CodePreview from './previews/CodePreview'
import OfficePreview from './previews/OfficePreview'
import AudioPreview from './previews/AudioPreview'
import PDFPreview from './previews/PDFPreview'
import URLPreview from './previews/URLPreview'
import ImagePreview from './previews/ImagePreview'
import DefaultPreview from './previews/DefaultPreview'
import { PreviewContainer } from './previews/Containers'

import FolderListLayout from './FolderListLayout'
import FolderGridLayout from './FolderGridLayout'

// Disabling SSR for some previews
const EPUBPreview = dynamic(() => import('./previews/EPUBPreview'), {
  ssr: false,
})
const VideoPreview = dynamic(() => import('./previews/VideoPreview'), {
  ssr: false,
})

/**
 * Convert url query into path string
 *
 * @param query Url query property
 * @returns Path string
 */
const queryToPath = (query?: ParsedUrlQuery) => {
  if (query) {
    const { path } = query
    if (!path) return '/'
    if (typeof path === 'string') return `/${encodeURIComponent(path)}`
    return `/${path.map(p => encodeURIComponent(p)).join('/')}`
  }
  return '/'
}

/**
 * 构造 /Admin 虚拟目录数据（显示天翼云盘和 OneDrive 两个入口文件夹）
 *
 * 返回结构与云盘 API 返回的 folder 结构一致，让 FileListing 正常渲染。
 * 虚拟文件夹的 name 决定点击后跳转的路径：
 * - 天翼云盘：跳到 /Admin/天翼云盘（显示天翼云根目录）
 * - OneDrive：跳到 /Admin/OneDrive（显示 OneDrive 根目录）
 */
function virtualAdminData(): any[] {
  const children: OdFolderChildren[] = []

  children.push({
    id: VIRTUAL_TIANYI_FOLDER_ID,
    name: ADMIN_TY_FOLDER_NAME,
    size: 0,
    lastModifiedDateTime: new Date().toISOString(),
    folder: { childCount: 0, view: { sortBy: 'name', sortOrder: 'ascending', viewType: 'thumbnails' } },
  })

  if (ONEDRIVE_ENABLED) {
    children.push({
      id: VIRTUAL_ONEDRIVE_FOLDER_ID,
      name: ADMIN_OD_FOLDER_NAME,
      size: 0,
      lastModifiedDateTime: new Date().toISOString(),
      folder: { childCount: 0, view: { sortBy: 'name', sortOrder: 'ascending', viewType: 'thumbnails' } },
    })
  }

  return [{ folder: { value: children } }]
}

// Render the icon of a folder child (may be a file or a folder), use emoji if the name of the child contains emoji
const renderEmoji = (name: string) => {
  const emoji = emojiRegex().exec(name)
  return { render: emoji && !emoji.index, emoji }
}
const formatChildName = (name: string) => {
  const { render, emoji } = renderEmoji(name)
  return render ? name.replace(emoji ? emoji[0] : '', '').trim() : name
}
export const ChildName: FC<{ name: string; folder?: boolean }> = ({ name, folder }) => {
  const original = formatChildName(name)
  const extension = folder ? '' : getRawExtension(original)
  const prename = folder ? original : original.substring(0, original.length - extension.length)
  return (
    <span className="truncate before:float-right before:content-[attr(data-tail)]" data-tail={extension}>
      {prename}
    </span>
  )
}
export const ChildIcon: FC<{ child: OdFolderChildren }> = ({ child }) => {
  const { render, emoji } = renderEmoji(child.name)
  return render ? (
    <span>{emoji ? emoji[0] : '📁'}</span>
  ) : (
    <FontAwesomeIcon icon={child.file ? getFileIcon(child.name, { video: Boolean(child.video) }) : ['far', 'folder']} />
  )
}

export const Checkbox: FC<{
  checked: 0 | 1 | 2
  onChange: () => void
  title: string
  indeterminate?: boolean
}> = ({ checked, onChange, title, indeterminate }) => {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.checked = Boolean(checked)
      if (indeterminate) {
        ref.current.indeterminate = checked == 1
      }
    }
  }, [ref, checked, indeterminate])

  const handleClick: MouseEventHandler = e => {
    if (ref.current) {
      if (e.target === ref.current) {
        e.stopPropagation()
      } else {
        ref.current.click()
      }
    }
  }

  return (
    <span
      title={title}
      className="inline-flex cursor-pointer items-center rounded p-1.5 hover:bg-gray-300 dark:hover:bg-gray-600"
      onClick={handleClick}
    >
      <input
        className="form-check-input cursor-pointer"
        type="checkbox"
        value={checked ? '1' : ''}
        ref={ref}
        aria-label={title}
        onChange={onChange}
      />
    </span>
  )
}

export const Downloading: FC<{ title: string; style: string }> = ({ title, style }) => {
  return (
    <span title={title} className={`${style} rounded`} role="status">
      <LoadingIcon
        // Use fontawesome far theme via class `svg-inline--fa` to get style `vertical-align` only
        // for consistent icon alignment, as class `align-*` cannot satisfy it
        className="svg-inline--fa inline-block h-4 w-4 animate-spin"
      />
    </span>
  )
}

const FileListing: FC<{ query?: ParsedUrlQuery; ssrIsAdmin?: boolean }> = ({ query, ssrIsAdmin }) => {
  const [selected, setSelected] = useState<{ [key: string]: boolean }>({})
  const [totalSelected, setTotalSelected] = useState<0 | 1 | 2>(0)
  const [totalGenerating, setTotalGenerating] = useState<boolean>(false)
  const [folderGenerating, setFolderGenerating] = useState<{
    [key: string]: boolean
  }>({})

  const router = useRouter()
  const [layout, _] = useLocalStorage('preferredLayout', layouts[0])

  const { t } = useTranslation()
  // 管理员登录状态：登录后根目录 '/' 变成虚拟根，显示两个云盘入口文件夹
  // 传入 SSR 初始值避免首次渲染闪现未登录内容
  const isAdmin = useIsAdmin(ssrIsAdmin)
  // 根据当前浏览器 URL 路径解析所在云盘，得到 apiBase 和剥离挂载前缀的相对路径
  const { apiBase, relPath, drive } = resolveDrive(router.asPath)
  // 虚拟根目录的 apiBase 是 '/api/ty'（虚拟根不实际请求，但用真实 API base 防竞态）
  const apiBaseTyped = apiBase as '/api/ty' | '/api/od'
  // 虚拟根目录不会触发认证/下载，统一转成 'ty' 兼容 Drive 类型
  const normalizedDrive: Drive = drive === 'virtual' ? 'ty' : drive

  // /Admin 虚拟目录：不调用云盘 API，直接显示两个云盘入口文件夹
  // 注意：用 drive === 'virtual' 判断（resolveDrive 读 window.__isAdmin 同步可用）
  const isVirtualAdmin = drive === 'virtual'

  const path = queryToPath(query)
  // 后端 API 使用剥离挂载前缀的相对路径；前端展示用原始 path
  const backendPath = relPath === '' ? '/' : relPath
  // hashedToken 用 backendPath+drive 查私密目录 token
  // 虚拟根目录没有私密目录，传 'ty' 兼容类型即可（不会命中）
  const hashedToken = getStoredToken(backendPath, normalizedDrive)

  const { data: swrData, error, size, setSize } = useProtectedSWRInfinite(
    isVirtualAdmin ? '' : backendPath,
    apiBaseTyped
  )

  // /Admin 虚拟目录：构造两个云盘入口文件夹数据，不依赖云盘 API
  const data = isVirtualAdmin ? virtualAdminData() : swrData

  // === 文件列表展开动画（loading → measuring → expanding → done）===
  const isLoading = !data && !error
  const { ref: fileListRef, phase: filePhase, maxH: fileListMaxH } = useExpandTransition(isLoading)

  // 天翼云根目录出错时，登录用户仍保留 Admin 入口文件夹
  const tyErrorWithAdmin =
    error &&
    error.status !== 401 &&
    isAdmin &&
    drive === 'ty' &&
    backendPath === '/' &&
    siteConfig.tianyiMountPath === '/'

  if (error && !tyErrorWithAdmin) {
    return (
      <PreviewContainer>
        {error.status === 401 ? (
          <Auth redirect={backendPath} drive={normalizedDrive} />
        ) : (
          <FourOhFour errorMsg={JSON.stringify(error.message)} />
        )}
      </PreviewContainer>
    )
  }

  const responses: any[] = data ? [].concat(...data) : []

  // === 文件预览（非文件夹），不走列表动画 ===
  if (data && responses.length > 0 && 'file' in responses[0] && responses.length === 1) {
    const file = responses[0].file as OdFileObject
    const previewType = getPreviewType(getExtension(file.name), { video: Boolean(file.video) })

    if (previewType) {
      switch (previewType) {
        case preview.image:
          return <ImagePreview file={file} />

        case preview.text:
          return <TextPreview file={file} />

        case preview.code:
          return <CodePreview file={file} />

        case preview.markdown:
          return <MarkdownPreview file={file} path={backendPath} />

        case preview.video:
          return <VideoPreview file={file} />

        case preview.audio:
          return <AudioPreview file={file} />

        case preview.pdf:
          return <PDFPreview file={file} />

        case preview.office:
          return <OfficePreview file={file} />

        case preview.epub:
          return <EPUBPreview file={file} />

        case preview.url:
          return <URLPreview file={file} />

        default:
          return <DefaultPreview file={file} />
      }
    } else {
      return <DefaultPreview file={file} />
    }
  }

  // data 到了但既不是 folder 也不是 file
  if (data && responses.length > 0 && !('folder' in responses[0])) {
    return (
      <PreviewContainer>
        <FourOhFour errorMsg={t('Cannot preview {{path}}', { path })} />
      </PreviewContainer>
    )
  }

  // === 文件夹列表（含 loading 态，统一在一个容器里做展开动画）===
  // folder 相关计算（data 到了才执行，loading 时用默认空值）
  let folderChildren: OdFolderObject['value'] = []
  let readmeFiles: OdFolderChildren[] = []

  // 天翼云根目录出错时，登录用户构造只含 Admin 入口的列表
  if (tyErrorWithAdmin) {
    const virtualAdminFolder: OdFolderChildren = {
      id: VIRTUAL_ADMIN_FOLDER_ID,
      name: 'Admin',
      size: 0,
      lastModifiedDateTime: new Date().toISOString(),
      folder: { childCount: 0, view: { sortBy: 'name', sortOrder: 'ascending', viewType: 'thumbnails' } },
    }
    folderChildren = [virtualAdminFolder]
  } else if (data && responses.length > 0 && 'folder' in responses[0]) {
    folderChildren = [].concat(...responses.map(r => r.folder.value)) as OdFolderObject['value']

    // 登录后在天翼云根目录注入 Admin 虚拟文件夹入口
    if (
      isAdmin &&
      drive === 'ty' &&
      backendPath === '/' &&
      siteConfig.tianyiMountPath === '/'
    ) {
      const hasConflict = folderChildren.some(c => c.name === 'Admin')
      if (!hasConflict) {
        const virtualAdminFolder: OdFolderChildren = {
          id: VIRTUAL_ADMIN_FOLDER_ID,
          name: 'Admin',
          size: 0,
          lastModifiedDateTime: new Date().toISOString(),
          folder: { childCount: 0, view: { sortBy: 'name', sortOrder: 'ascending', viewType: 'thumbnails' } },
        }
        folderChildren = [virtualAdminFolder, ...folderChildren]
      }
    }

    // Find README.md / READ.md files to render
    readmeFiles = folderChildren.filter(
      c => c.name.toLowerCase() === 'readme.md' || c.name.toLowerCase() === 'read.md'
    )
  }

  // Filtered file list helper
  const getFiles = () => folderChildren.filter(c => !c.folder && c.name !== '.password')

  // File selection
  const genTotalSelected = (selected: { [key: string]: boolean }) => {
    const selectInfo = getFiles().map(c => Boolean(selected[c.id]))
    const [hasT, hasF] = [selectInfo.some(i => i), selectInfo.some(i => !i)]
    return hasT && hasF ? 1 : !hasF ? 2 : 0
  }

  const toggleItemSelected = (id: string) => {
    let val: SetStateAction<{ [key: string]: boolean }>
    if (selected[id]) {
      val = { ...selected }
      delete val[id]
    } else {
      val = { ...selected, [id]: true }
    }
    setSelected(val)
    setTotalSelected(genTotalSelected(val))
  }

  const toggleTotalSelected = () => {
    if (genTotalSelected(selected) == 2) {
      setSelected({})
      setTotalSelected(0)
    } else {
      setSelected(Object.fromEntries(getFiles().map(c => [c.id, true])))
      setTotalSelected(2)
    }
  }

  // Selected file download
  const handleSelectedDownload = () => {
    const folderName = backendPath.substring(backendPath.lastIndexOf('/') + 1)
    const folder = folderName ? decodeURIComponent(folderName) : undefined
    const files = getFiles()
      .filter(c => selected[c.id])
      .map(c => ({
        name: c.name,
        url: `${apiBaseTyped}/raw/?path=${backendPath}/${encodeURIComponent(c.name)}${hashedToken ? `&odpt=${hashedToken}` : ''}`,
      }))

    if (files.length == 1) {
      const el = document.createElement('a')
      el.style.display = 'none'
      document.body.appendChild(el)
      el.href = files[0].url
      el.click()
      el.remove()
    } else if (files.length > 1) {
      setTotalGenerating(true)

      const toastId = toast.loading(<DownloadingToast router={router} />)
      downloadMultipleFiles({ toastId, router, files, folder })
        .then(() => {
          setTotalGenerating(false)
          toast.success(t('Finished downloading selected files.'), {
            id: toastId,
          })
        })
        .catch(() => {
          setTotalGenerating(false)
          toast.error(t('Failed to download selected files.'), { id: toastId })
        })
    }
  }

  // Get selected file permalink
  const handleSelectedPermalink = (baseUrl: string) => {
    return getFiles()
      .filter(c => selected[c.id])
      .map(
        c =>
          `${baseUrl}${apiBaseTyped}/raw/?path=${backendPath}/${encodeURIComponent(c.name)}${hashedToken ? `&odpt=${hashedToken}` : ''}`
      )
      .join('\n')
  }

  // Folder recursive download
  const handleFolderDownload = (folderPath: string, id: string, name?: string) => () => {
    const files = (async function* () {
      for await (const { meta: c, path: p, isFolder, error } of traverseFolder(folderPath, apiBaseTyped)) {
        if (error) {
          toast.error(
            t('Failed to download folder {{path}}: {{status}} {{message}} Skipped it to continue.', {
              path: p,
              status: error.status,
              message: error.message,
            })
          )
          continue
        }
        const hashedTokenForPath = getStoredToken(p, normalizedDrive)
        yield {
          name: c?.name,
          url: `${apiBaseTyped}/raw/?path=${p}${hashedTokenForPath ? `&odpt=${hashedTokenForPath}` : ''}`,
          path: p,
          isFolder,
        }
      }
    })()

    setFolderGenerating({ ...folderGenerating, [id]: true })
    const toastId = toast.loading(<DownloadingToast router={router} />)

    downloadTreelikeMultipleFiles({
      toastId,
      router,
      files,
      basePath: folderPath,
      folder: name,
    })
      .then(() => {
        setFolderGenerating({ ...folderGenerating, [id]: false })
        toast.success(t('Finished downloading folder.'), { id: toastId })
      })
      .catch(() => {
        setFolderGenerating({ ...folderGenerating, [id]: false })
        toast.error(t('Failed to download folder.'), { id: toastId })
      })
  }

  // 分页状态
  const isLoadingMore = isLoading || (size > 0 && data && typeof data[size - 1] === 'undefined')
  const isEmpty = data?.[0]?.length === 0
  const isReachingEnd = isEmpty || (data && typeof data[data.length - 1]?.next === 'undefined')
  const onlyOnePage = data && typeof data[0].next === 'undefined'

  // Folder layout component props
  const folderProps = {
    toast,
    path,
    backendPath,
    apiBase: apiBaseTyped,
    drive: normalizedDrive,
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
  }

  return (
    <>
      <Toaster />

      {/* 文件列表容器：带展开动画（和 MarkdownPreview 一样的状态机）
          - loading：显示 Loading 文字（py-16，自带毛玻璃）
          - measuring/expanding：max-height 平滑过渡，Loading 淡出，内容淡入
          - done：正常显示
          注意：readme 不在这个容器里，因为 readme 是独立异步加载，measuring 时
          高度还测不到，放进来会被 maxHeight+overflow:hidden 裁掉点不到 */}
      <div
        ref={fileListRef}
        className="relative overflow-hidden rounded-2xl"
        style={{
          maxHeight: `${fileListMaxH}px`,
          transition: 'max-height 0.9s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Loading 层：loading 时撑开容器；measuring/expanding 时绝对定位淡出
            自带毛玻璃背景（和 od-files-container 一致），文字颜色与文件列表一致。
            不设自己的 rounded，继承外层容器的圆角 */}
        {filePhase !== 'done' && (
          <div
            className={`flex items-center justify-center py-16 text-sm text-gray-700 dark:text-gray-200 ${
              filePhase === 'measuring' || filePhase === 'expanding' ? 'absolute inset-0' : ''
            }`}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.45)',
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              opacity: filePhase === 'loading' ? 1 : 0,
              transition: 'opacity 0.4s ease',
            }}
          >
            <LoadingIcon className="mr-3 h-5 w-5 animate-spin" />
            <span>{t('Loading ...')}</span>
          </div>
        )}

        {/* 内容层：measuring 开始渲染（测高度），expanding 淡入，done 正常显示
            FolderListLayout/FolderGridLayout 自带 od-files-container 毛玻璃 */}
        {(data || tyErrorWithAdmin) && filePhase !== 'loading' && (
          <>
            {layout.name === 'Grid' ? <FolderGridLayout {...folderProps} /> : <FolderListLayout {...folderProps} />}

            {!onlyOnePage && (
              <div className="rounded-b dark:text-gray-100" style={{ backgroundColor: "rgba(255,255,255,0.35)", backdropFilter: "var(--glass-blur)", WebkitBackdropFilter: "var(--glass-blur)" }}>
                <div className="border-b border-gray-200 p-3 text-center font-mono text-sm text-gray-400 dark:border-gray-700">
                  {t('- showing {{count}} page(s) ', {
                    count: size,
                    totalFileNum: isLoadingMore ? '...' : folderChildren.length,
                  }) +
                    (isLoadingMore
                      ? t('of {{count}} file(s) -', { count: folderChildren.length, context: 'loading' })
                      : t('of {{count}} file(s) -', { count: folderChildren.length, context: 'loaded' }))}
                </div>
                <button
                  className={`flex w-full items-center justify-center space-x-2 p-3 disabled:cursor-not-allowed ${
                    isLoadingMore || isReachingEnd ? 'opacity-60' : 'hover:bg-gray-100 dark:hover:bg-gray-850'
                  }`}
                  onClick={() => setSize(size + 1)}
                  disabled={isLoadingMore || isReachingEnd}
                >
                  {isLoadingMore ? (
                    <>
                      <LoadingIcon className="inline-block h-4 w-4 animate-spin" />
                      <span>{t('Loading ...')}</span>{' '}
                    </>
                  ) : isReachingEnd ? (
                    <span>{t('No more files')}</span>
                  ) : (
                    <>
                      <span>{t('Load more')}</span>
                      <FontAwesomeIcon icon="chevron-circle-down" />
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* readme 独立渲染在动画容器外，不受 maxHeight/overflow 限制，避免内容被裁 */}
      {data && readmeFiles.map(f => (
        <div className="mt-4" key={f.id}>
          <MarkdownPreview file={f} path={backendPath} standalone={false} />
        </div>
      ))}

      {/* 天翼云超时/出错时，错误信息卡片放在 README 位置 */}
      {tyErrorWithAdmin && (
        <div className="mt-4">
          <PreviewContainer>
            <div className="mb-2 text-sm font-bold text-gray-600 dark:text-gray-300">
              {t('TianYi cloud connection failed')}
            </div>
            <div className="overflow-hidden break-all rounded border border-gray-400/20 bg-gray-50 p-2 font-mono text-xs dark:bg-gray-800">
              {JSON.stringify(error.message)}
            </div>
          </PreviewContainer>
        </div>
      )}
    </>
  )
}
export default FileListing
