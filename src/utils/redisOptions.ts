import type { RedisOptions } from 'ioredis'

/**
 * 全项目统一的 Redis 连接参数。
 *
 * 背景（线上实测 + Vercel 日志）：
 * 此前 9 个模块各自 `new Redis(...)`，参数却不一致，且多数使用
 * `enableOfflineQueue: false` + `retryStrategy: times => (times > 2 ? null : ...)`。
 * 冷启动时该组合会连环失败：
 *
 *   1. 实例启动即并发发起多个 TLS 握手（每个模块一个连接）；
 *   2. 握手偶发失败（`Client network socket disconnected before secure TLS
 *      connection was established`）；
 *   3. `retryStrategy` 返回 null 后 ioredis 永久停止重连，客户端进入
 *      `end` 状态，此后该实例所有命令立即抛
 *      `Stream isn't writeable and enableOfflineQueue options is false`；
 *   4. 于是"刷新好几次"才碰巧落到一个握手成功的实例上。
 *
 * 因此这里统一为：
 * - `enableOfflineQueue: true`：连接未就绪时命令排队等待，而不是立即失败
 *   （onedrive 的 token store 早已这么改过，本次把该经验推广到全部模块）；
 * - `retryStrategy` 永不返回 null：持续按上限退避重连，避免实例"永久性损坏"；
 * - `connectTimeout` / `keepAlive`：握手有上限、空闲连接保活。
 *
 * 注意：所有模块共用同一套参数，但仍是各自独立的连接。若后续要进一步降低
 * 冷启动握手数量，可改为共享单例连接。
 */
export function redisConnectionOptions(): RedisOptions {
  return {
    // 按上限退避，永不返回 null（返回 null 会让客户端永久停止重连）
    retryStrategy: (times: number) => Math.min(times * 200, 2000),
    maxRetriesPerRequest: 3,
    // 连接未就绪时排队而非立即报错
    enableOfflineQueue: true,
    lazyConnect: false,
    connectTimeout: 8000,
    // 空闲连接保活，避免中间设备静默断开后客户端仍以为连接可用
    keepAlive: 10000,
  }
}

/**
 * 统一的 Redis 错误监听器。
 *
 * ioredis 的 `error` 事件若无人监听，会作为未处理异常冒泡
 * （日志中可见 `[ioredis] Unhandled error event`），在 serverless 下可能中断请求处理。
 * 所有客户端都应挂上监听，只记录不抛出。
 */
export function logRedisError(label: string) {
  return (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[${label}] Redis error: ${msg}`)
  }
}

/**
 * 纯缓存场景的连接参数：在统一参数基础上**关闭离线队列**。
 *
 * 理由与 redisConnectionOptions 相反：缓存只是加速手段，Redis 不可用时
 * 应当立刻放弃并回源（返回 null → 走上游原路径），而不是让每个请求都
 * 排队等待重试耗尽，把一次 Redis 抖动放大成全站变慢。
 *
 * 注意：这里同样使用"永不返回 null"的 retryStrategy，客户端会持续在后台重连，
 * 恢复后自动重新可用；只是**当前这次命令**不等待连接就绪。
 */
export function redisCacheOptions(): RedisOptions {
  return {
    ...redisConnectionOptions(),
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  }
}
