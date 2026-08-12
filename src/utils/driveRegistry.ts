/**
 * WebDAV 虚拟根目录下的云盘注册表。
 *
 * 新增网盘挂载时：
 * 1. 在此注册 { name, id }（name 是 WebDAV 虚拟根下的目录名）；
 * 2. 在 src/pages/api/dav/[[...path]].ts 的 handlePropfind / handleGet 中
 *    实现对应 drive id 的目录列举与文件下载逻辑。
 * 其余（根目录入口展示、路径解析）自动生效。
 */
export const DAV_DRIVES = [
  { name: '天翼云盘', id: 'ty' },
  { name: 'OneDrive', id: 'od' },
] as const

export type DavDriveId = (typeof DAV_DRIVES)[number]['id'] | 'root'

export function getDavDriveByName(name: string): (typeof DAV_DRIVES)[number] | undefined {
  return DAV_DRIVES.find(d => d.name === name)
}