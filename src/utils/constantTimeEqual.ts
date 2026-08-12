/**
 * 恒定时间字符串比较，防止通过时序差异逐字节推断内容（如密码哈希）。
 *
 * 纯 JS 实现（不依赖 node:crypto / Buffer），可同时用于服务端和客户端 bundle。
 * 长度不等时不会提前返回，而是补齐循环，避免泄露长度差异带来的时序信息。
 */

export function constantTimeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < maxLen; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}