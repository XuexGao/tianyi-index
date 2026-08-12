/**
 * 安全解码 URL 组件：遇到畸形 % 序列不抛错而是原样返回。
 *
 * 原实现分别在 src/pages/api/ty/index.ts 和 src/pages/api/ty/raw.ts 各定义了一份，
 * 提取为公共模块。
 */
export function safeDecodeURIComponent(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}