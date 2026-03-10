/**
 * AI 总结内存缓存模块
 *
 * 缓存 AI 总结结果（完整 Markdown 文本），避免从历史记录返回时重复请求 LLM。
 * 使用模块级 Map 实现单例缓存，页面刷新后自动清空。
 *
 * 缓存策略：
 * - 缓存键：session_id（字符串）
 * - 缓存值：AI 总结完整 Markdown 文本
 * - 上限：50 条
 * - 淘汰策略：FIFO（先进先出）
 */

const MAX_CACHE_SIZE = 50;

/** 模块级缓存 Map（单例） */
const cache = new Map<string, string>();

/**
 * 获取缓存的 AI 总结文本
 * @param sessionId 检查会话 ID
 * @returns 缓存的总结文本，未命中返回 undefined
 */
export function getCachedSummary(sessionId: string): string | undefined {
  return cache.get(sessionId);
}

/**
 * 缓存 AI 总结文本（仅在 SSE state=done 时调用）
 * 超过上限时，FIFO 淘汰最早条目
 * @param sessionId 检查会话 ID
 * @param content AI 总结完整 Markdown 文本
 */
export function setCachedSummary(sessionId: string, content: string): void {
  // 如果已存在则先删除（Map 保持插入顺序，重新插入更新位置）
  if (cache.has(sessionId)) {
    cache.delete(sessionId);
  }

  // FIFO 淘汰：超过上限时删除最早条目
  while (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }

  cache.set(sessionId, content);
}

/**
 * 清除指定 session 的缓存（用户点击"重新分析"时调用）
 * @param sessionId 检查会话 ID
 */
export function clearCachedSummary(sessionId: string): void {
  cache.delete(sessionId);
}

/**
 * 获取当前缓存条目数量（用于测试/调试）
 * @returns 缓存条目数
 */
export function getCacheSize(): number {
  return cache.size;
}

/**
 * 清空所有缓存（用于测试）
 */
export function clearAllCache(): void {
  cache.clear();
}
