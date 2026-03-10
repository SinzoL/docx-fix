/**
 * AI 总结缓存模块测试
 *
 * 测试内容：
 * - getCachedSummary/setCachedSummary 基本读写
 * - 缓存未命中返回 undefined
 * - clearCachedSummary 清除特定条目
 * - FIFO 淘汰（超过 50 条时删除最早条目）
 * - getCacheSize 返回正确数量
 * - 覆盖更新（同 id 重复写入）
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getCachedSummary,
  setCachedSummary,
  clearCachedSummary,
  getCacheSize,
  clearAllCache,
} from "../../services/aiCache";

describe("aiCache", () => {
  // 每个测试前清空缓存
  beforeEach(() => {
    clearAllCache();
  });

  it("缓存未命中应返回 undefined", () => {
    expect(getCachedSummary("nonexistent")).toBeUndefined();
  });

  it("setCachedSummary/getCachedSummary 基本读写", () => {
    setCachedSummary("session-1", "# 总结\n文档格式基本正确");
    expect(getCachedSummary("session-1")).toBe("# 总结\n文档格式基本正确");
  });

  it("clearCachedSummary 应清除特定条目", () => {
    setCachedSummary("session-1", "内容1");
    setCachedSummary("session-2", "内容2");
    clearCachedSummary("session-1");
    expect(getCachedSummary("session-1")).toBeUndefined();
    expect(getCachedSummary("session-2")).toBe("内容2");
  });

  it("clearCachedSummary 对不存在的条目不报错", () => {
    expect(() => clearCachedSummary("nonexistent")).not.toThrow();
  });

  it("getCacheSize 应返回正确数量", () => {
    expect(getCacheSize()).toBe(0);
    setCachedSummary("a", "1");
    setCachedSummary("b", "2");
    expect(getCacheSize()).toBe(2);
    clearCachedSummary("a");
    expect(getCacheSize()).toBe(1);
  });

  it("同 id 重复写入应覆盖更新", () => {
    setCachedSummary("session-1", "旧内容");
    setCachedSummary("session-1", "新内容");
    expect(getCachedSummary("session-1")).toBe("新内容");
    expect(getCacheSize()).toBe(1);
  });

  it("超过 50 条时应 FIFO 淘汰最早条目", () => {
    // 写入 50 条
    for (let i = 0; i < 50; i++) {
      setCachedSummary(`session-${i}`, `内容${i}`);
    }
    expect(getCacheSize()).toBe(50);

    // 写入第 51 条，应淘汰 session-0
    setCachedSummary("session-50", "内容50");
    expect(getCacheSize()).toBe(50);
    expect(getCachedSummary("session-0")).toBeUndefined();
    expect(getCachedSummary("session-1")).toBe("内容1");
    expect(getCachedSummary("session-50")).toBe("内容50");
  });

  it("clearAllCache 应清空所有缓存", () => {
    setCachedSummary("a", "1");
    setCachedSummary("b", "2");
    clearAllCache();
    expect(getCacheSize()).toBe(0);
    expect(getCachedSummary("a")).toBeUndefined();
  });
});
