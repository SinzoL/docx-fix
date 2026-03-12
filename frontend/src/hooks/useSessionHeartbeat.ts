/**
 * useSessionHeartbeat — 通用心跳续命 Hook
 *
 * 在 session 存活且非只读时，定期调用 API 续命，
 * 防止用户长时间查看时后端 session 被清理。
 *
 * @param sessionId   - 会话 ID（空/undefined 时不启动心跳）
 * @param pingFn      - 心跳调用函数（如 checkCheckSessionStatus / checkPolishSessionStatus）
 * @param options.readOnly       - 只读模式时跳过心跳
 * @param options.sessionExpired - session 已过期时跳过心跳
 * @param options.intervalMs     - 心跳间隔（毫秒），默认 15 分钟
 */

import { useEffect } from "react";

const DEFAULT_HEARTBEAT_INTERVAL = 15 * 60 * 1000; // 15 分钟

interface UseSessionHeartbeatOptions {
  readOnly?: boolean;
  sessionExpired?: boolean;
  intervalMs?: number;
}

export function useSessionHeartbeat(
  sessionId: string | undefined,
  pingFn: (sessionId: string) => Promise<unknown>,
  options: UseSessionHeartbeatOptions = {},
): void {
  const {
    readOnly = false,
    sessionExpired = false,
    intervalMs = DEFAULT_HEARTBEAT_INTERVAL,
  } = options;

  useEffect(() => {
    if (!sessionId || readOnly || sessionExpired) return;

    const timer = setInterval(() => {
      pingFn(sessionId).catch(() => {
        // 心跳失败不影响用户操作，静默处理
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [sessionId, readOnly, sessionExpired, intervalMs, pingFn]);
}
