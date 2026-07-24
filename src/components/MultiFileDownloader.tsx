import { NextRouter } from 'next/router'
import toast from 'react-hot-toast'
import JSZip from 'jszip'
import { useTranslation } from 'next-i18next'

import { fetcher } from '../utils/fetchWithSWR'
import { getStoredToken, driveFromApiBase } from '../utils/protectedRouteHandler'

/**
 * A loading toast component with file download progress support
 * @param props
 * @param props.router Next router instance, used for reloading the page
 * @param props.progress Current downloading and compression progress (returned by jszip metadata)
 */
export function DownloadingToast({ router, progress }: { router: NextRouter; progress?: string }) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center space-x-2">
      <div className="w-56">
        <span>{progress ? t('Downloading {{progress}}%', { progress }) : t('Downloading selected files...')}</span>

        <div className="relative mt-2">
          <div className="flex h-1 overflow-hidden rounded bg-gray-100">
            <div style={{ width: `${progress}%` }} className="bg-gray-500 text-white transition-all duration-100"></div>
          </div>
        </div>
      </div>
      <button
        className="rounded bg-red-500 p-2 text-white hover:bg-red-400 focus:outline-none focus:ring focus:ring-red-300"
        onClick={() => router.reload()}
      >
        {t('Cancel')}
      </button>
    </div>
  )
}

// Blob download helper
export function downloadBlob({ blob, name }: { blob: Blob; name: string }) {
  // Prepare for download
  const el = document.createElement('a')
  el.style.display = 'none'
  document.body.appendChild(el)

  // Download zip file
  const bUrl = window.URL.createObjectURL(blob)
  el.href = bUrl
  el.download = name
  el.click()
  window.URL.revokeObjectURL(bUrl)
  el.remove()
}

/**
 * Download multiple files after compressing them into a zip
 * @param toastId Toast ID to be used for toast notification
 * @param files Files to be downloaded
 * @param folder Optional folder name to hold files, otherwise flatten files in the zip
 */
export async function downloadMultipleFiles({
  toastId,
  router,
  files,
  folder,
}: {
  toastId: string
  router: NextRouter
  files: { name: string; url: string }[]
  folder?: string
}): Promise<void> {
  const zip = new JSZip()
  const dir = folder ? zip.folder(folder)! : zip

  // Add selected file blobs to zip
  files.forEach(({ name, url }) => {
    dir.file(
      name,
      fetch(url).then(r => {
        return r.blob()
      })
    )
  })

  // Create zip file and download it
  const b = await zip.generateAsync({ type: 'blob' }, metadata => {
    toast.loading(<DownloadingToast router={router} progress={metadata.percent.toFixed(0)} />, {
      id: toastId,
    })
  })
  downloadBlob({ blob: b, name: folder ? folder + '.zip' : 'download.zip' })
}

/**
 * Download hierarchical tree-like files after compressing them into a zip
 * @param toastId Toast ID to be used for toast notification
 * @param files Files to be downloaded. Array of file and folder items excluding root folder.
 * Folder items MUST be in front of its children items in the array.
 * Use async generator because generation of the array may be slow.
 * When waiting for its generation, we can meanwhile download bodies of already got items.
 * Only folder items can have url undefined.
 * @param basePath Root dir path of files to be downloaded
 * @param folder Optional folder name to hold files, otherwise flatten files in the zip
 */
export async function downloadTreelikeMultipleFiles({
  toastId,
  router,
  files,
  basePath,
  folder,
}: {
  toastId: string
  router: NextRouter
  files: AsyncGenerator<{
    name: string
    url?: string
    path: string
    isFolder: boolean
  }>
  basePath: string
  folder?: string
}): Promise<void> {
  const zip = new JSZip()
  const root = folder ? zip.folder(folder)! : zip
  const map = [{ path: basePath, dir: root }]

  // Add selected file blobs to zip according to its path
  for await (const { name, url, path, isFolder } of files) {
    // Search parent dir in map
    const i = map
      .slice()
      .reverse()
      .findIndex(
        ({ path: parent }) =>
          path.substring(0, parent.length) === parent && path.substring(parent.length + 1).indexOf('/') === -1
      )
    if (i === -1) {
      throw new Error('File array does not satisfy requirement')
    }

    // Add file or folder to zip
    const dir = map[map.length - 1 - i].dir
    if (isFolder) {
      map.push({ path, dir: dir.folder(name)! })
    } else {
      dir.file(
        name,
        fetch(url!).then(r => r.blob())
      )
    }
  }

  // Create zip file and download it
  const b = await zip.generateAsync({ type: 'blob' }, metadata => {
    toast.loading(<DownloadingToast router={router} progress={metadata.percent.toFixed(0)} />, {
      id: toastId,
    })
  })
  downloadBlob({ blob: b, name: folder ? folder + '.zip' : 'download.zip' })
}

interface TraverseItem {
  path: string
  meta: any
  isFolder: boolean
  error?: { status: number; message: string }
}

/**
 * One-shot concurrent top-down file traversing for the folder.
 * Due to react hook limit, we cannot reuse SWR utils for recursive actions.
 * We will directly fetch API and arrange responses instead.
 * In folder tree, we visit folders top-down as concurrently as possible.
 * Every time we visit a folder, we fetch and return meta of all its children.
 * If folders have pagination, partically retrieved items are not returned immediately,
 * but after all children of the folder have been successfully retrieved.
 * If an error occurred in paginated fetching, all children will be dropped.
 * @param path Folder to be traversed. The path should be cleaned in advance.
 * @returns Array of items representing folders and files of traversed folder top-down and excluding root folder.
 * Due to top-down, Folder items are ALWAYS in front of its children items.
 * Error key in the item will contain the error when there is a handleable error.
 */
export async function* traverseFolder(path: string, apiBase: string = '/api/ty'): AsyncGenerator<TraverseItem, void, undefined> {
  const hashedToken = getStoredToken(path, driveFromApiBase(apiBase))

  // Generate the task passed to Promise.race to request a folder
  // 注意：genTask 内部 catch 错误并作为 data 返回，因此 Promise.race 永不 reject。
  // 错误需在主循环中通过 data.error 字段判断并处理。
  const genTask = async (i: number, path: string, next?: string) => {
    return {
      i,
      path,
      data: await fetcher([
        next ? `${apiBase}/?path=${path}&next=${next}` : `${apiBase}/?path=${path}`,
        hashedToken ?? undefined,
      ]).catch(error => ({ error })),
    }
  }

  // Pool containing Promises of folder requests
  let pool = [genTask(0, path)]

  // Map as item buffer for folders with pagination
  const buf: { [k: string]: TraverseItem[] } = {}

  // 过滤掉已被 delete 的空槽位（delete pool[i] 后数组保留 empty slot，filter 会跳过它们）
  // 使用 Boolean 作为过滤谓词，比 filter(() => true) 语义更清晰
  const activeTasks = () => pool.filter(Boolean)
  while (activeTasks().length > 0) {
    const info: { i: number; path: string; data: any } = await Promise.race(activeTasks())
    const { i, path, data } = info

    // genTask 捕获的错误通过 data.error 传递
    if (data?.error) {
      const innerError = data.error
      const status = innerError.status ?? 500
      // 4xx errors are identified as handleable errors
      if (Math.floor(status / 100) === 4) {
        delete pool[i]
        // message 可能是 { error: '...' } 对象，也可能是字符串
        const errMsg = typeof innerError.message === 'string'
          ? innerError.message
          : innerError.message?.error || innerError.message?.message || '请求失败'
        yield {
          path,
          meta: {},
          isFolder: true,
          error: { status, message: errMsg },
        }
        continue
      } else {
        throw innerError
      }
    }

    if (!data || !data.folder) {
      throw new Error('Path is not folder')
    }
    delete pool[i]

    const items = data.folder.value.map((c: any) => {
      const p = `${path === '/' ? '' : path}/${encodeURIComponent(c.name)}`
      return { path: p, meta: c, isFolder: Boolean(c.folder) }
    }) as TraverseItem[]

    if (data.next) {
      buf[path] = (buf[path] ?? []).concat(items)

      // Append next page task to the pool at the end
      const i = pool.length
      pool[i] = genTask(i, path, data.next)
    } else {
      const allItems = (buf[path] ?? []).concat(items)
      if (buf[path]) {
        delete buf[path]
      }

      allItems
        .filter(item => item.isFolder)
        .forEach(item => {
          // Append new folder tasks to the pool at the end
          const i = pool.length
          pool[i] = genTask(i, item.path)
        })
      yield* allItems
    }
  }
}
