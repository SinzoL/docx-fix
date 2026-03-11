/**
 * IndexedDB 缓存管理
 *
 * 使用 idb 库管理浏览器本地缓存，存储检查历史记录。
 * 有效期 30 天，过期自动清理。
 */

import { openDB, type IDBPDatabase } from "idb";
import type { HistoryRecord, CheckReport, FixReport, PolishHistoryRecord, PolishSuggestion, PolishSummary } from "../types";

const DB_NAME = "docx-fix-cache";
const DB_VERSION = 2;
const STORE_NAME = "history";
const POLISH_STORE_NAME = "polish-history";
const EXPIRY_DAYS = 30;
/** 润色缓存有效期（7天，比历史记录更短以节省空间） */
const POLISH_EXPIRY_DAYS = 7;

type DocxFixDB = IDBPDatabase;

let dbInstance: DocxFixDB | null = null;

/**
 * 获取数据库实例（单例）
 */
async function getDB(): Promise<DocxFixDB> {
  if (dbInstance) return dbInstance;

  try {
    dbInstance = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // v1: 检查历史记录
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
            store.createIndex("filename", "filename", { unique: false });
            store.createIndex("created_at", "created_at", { unique: false });
            store.createIndex("expires_at", "expires_at", { unique: false });
          }
        }
        // v2: 润色结果缓存
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(POLISH_STORE_NAME)) {
            const polishStore = db.createObjectStore(POLISH_STORE_NAME, { keyPath: "id" });
            polishStore.createIndex("created_at", "created_at", { unique: false });
            polishStore.createIndex("expires_at", "expires_at", { unique: false });
          }
        }
      },
    });
    return dbInstance;
  } catch (error) {
    console.warn("IndexedDB 不可用，缓存功能降级:", error);
    throw error;
  }
}

/**
 * 检查 IndexedDB 是否可用
 */
export async function isAvailable(): Promise<boolean> {
  try {
    await getDB();
    return true;
  } catch {
    return false;
  }
}

/**
 * 保存检查记录
 */
export async function saveHistory(
  id: string,
  filename: string,
  ruleId: string,
  ruleName: string,
  checkReport: CheckReport
): Promise<void> {
  try {
    const db = await getDB();
    const now = Date.now();
    const record: HistoryRecord = {
      id,
      filename,
      rule_id: ruleId,
      rule_name: ruleName,
      check_report: checkReport,
      created_at: now,
      expires_at: now + EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    };
    await db.put(STORE_NAME, record);
  } catch (error) {
    console.warn("保存缓存失败:", error);
  }
}

/**
 * 更新修复报告
 */
export async function updateFixReport(
  id: string,
  fixReport: FixReport
): Promise<void> {
  try {
    const db = await getDB();
    const record = await db.get(STORE_NAME, id);
    if (record) {
      record.fix_report = fixReport;
      await db.put(STORE_NAME, record);
    }
  } catch (error) {
    console.warn("更新缓存失败:", error);
  }
}

/**
 * 获取所有历史记录（按创建时间降序）
 */
export async function getHistoryList(): Promise<HistoryRecord[]> {
  try {
    const db = await getDB();
    const records = await db.getAll(STORE_NAME);
    // 按创建时间降序排列
    records.sort((a, b) => b.created_at - a.created_at);
    return records;
  } catch {
    return [];
  }
}

/**
 * 获取单条历史记录
 */
export async function getHistory(
  id: string
): Promise<HistoryRecord | undefined> {
  try {
    const db = await getDB();
    return db.get(STORE_NAME, id);
  } catch {
    return undefined;
  }
}

/**
 * 删除单条历史记录
 */
export async function deleteHistory(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(STORE_NAME, id);
  } catch (error) {
    console.warn("删除缓存失败:", error);
  }
}

/**
 * 清理过期记录
 */
export async function cleanExpired(): Promise<number> {
  try {
    const db = await getDB();
    const now = Date.now();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("expires_at");

    let deletedCount = 0;
    let cursor = await index.openCursor();
    while (cursor) {
      if (cursor.value.expires_at < now) {
        await cursor.delete();
        deletedCount++;
      } else {
        // expires_at 索引是有序的，后面的都未过期
        break;
      }
      cursor = await cursor.continue();
    }

    await tx.done;
    return deletedCount;
  } catch {
    return 0;
  }
}

/**
 * 清理最旧的记录（空间不足时使用）
 */
export async function cleanOldest(count: number = 5): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("created_at");

    let deleted = 0;
    let cursor = await index.openCursor();
    while (cursor && deleted < count) {
      await cursor.delete();
      deleted++;
      cursor = await cursor.continue();
    }

    await tx.done;
  } catch (error) {
    console.warn("清理旧缓存失败:", error);
  }
}

/**
 * 清除所有缓存
 */
export async function clearAll(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear(STORE_NAME);
    await db.clear(POLISH_STORE_NAME);
  } catch (error) {
    console.warn("清除缓存失败:", error);
  }
}

// ========================================
// 润色结果缓存
// ========================================

/**
 * 保存润色结果到 IndexedDB
 */
export async function savePolishResult(
  sessionId: string,
  filename: string,
  suggestions: PolishSuggestion[],
  summary: PolishSummary | null,
): Promise<void> {
  try {
    const db = await getDB();
    const now = Date.now();
    // 默认全部接受
    const decisions: Record<number, boolean> = {};
    suggestions.forEach((_, i) => { decisions[i] = true; });

    const record: PolishHistoryRecord = {
      id: sessionId,
      filename,
      suggestions,
      summary,
      decisions,
      created_at: now,
      expires_at: now + POLISH_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
      applied: false,
    };
    await db.put(POLISH_STORE_NAME, record);
  } catch (error) {
    console.warn("保存润色缓存失败:", error);
  }
}

/**
 * 获取最近一条未过期的润色结果缓存
 */
export async function getLatestPolishResult(): Promise<PolishHistoryRecord | null> {
  try {
    const db = await getDB();
    const all = await db.getAll(POLISH_STORE_NAME);
    if (all.length === 0) return null;

    const now = Date.now();
    // 过滤未过期 + 未应用的记录，按创建时间降序
    const valid = all
      .filter((r: PolishHistoryRecord) => r.expires_at > now && !r.applied)
      .sort((a: PolishHistoryRecord, b: PolishHistoryRecord) => b.created_at - a.created_at);

    return valid.length > 0 ? valid[0] : null;
  } catch {
    return null;
  }
}

/**
 * 根据 sessionId 获取润色结果
 */
export async function getPolishResult(sessionId: string): Promise<PolishHistoryRecord | null> {
  try {
    const db = await getDB();
    const record = await db.get(POLISH_STORE_NAME, sessionId);
    if (!record) return null;

    // 检查过期
    if (record.expires_at < Date.now()) {
      await db.delete(POLISH_STORE_NAME, sessionId);
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

/**
 * 更新润色建议的接受/拒绝决策
 */
export async function updatePolishDecisions(
  sessionId: string,
  decisions: Record<number, boolean>,
): Promise<void> {
  try {
    const db = await getDB();
    const record = await db.get(POLISH_STORE_NAME, sessionId);
    if (record) {
      record.decisions = decisions;
      await db.put(POLISH_STORE_NAME, record);
    }
  } catch (error) {
    console.warn("更新润色决策缓存失败:", error);
  }
}

/**
 * 标记润色结果为已应用
 */
export async function markPolishApplied(sessionId: string): Promise<void> {
  try {
    const db = await getDB();
    const record = await db.get(POLISH_STORE_NAME, sessionId);
    if (record) {
      record.applied = true;
      await db.put(POLISH_STORE_NAME, record);
    }
  } catch (error) {
    console.warn("标记润色已应用失败:", error);
  }
}

/**
 * 获取所有润色历史记录（按创建时间降序，包括已应用和未应用的）
 */
export async function getPolishHistoryList(): Promise<PolishHistoryRecord[]> {
  try {
    const db = await getDB();
    const all = await db.getAll(POLISH_STORE_NAME);
    const now = Date.now();
    // 过滤未过期的记录，按创建时间降序
    return all
      .filter((r: PolishHistoryRecord) => r.expires_at > now)
      .sort((a: PolishHistoryRecord, b: PolishHistoryRecord) => b.created_at - a.created_at);
  } catch {
    return [];
  }
}

/**
 * 删除单条润色历史记录
 */
export async function deletePolishHistory(sessionId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(POLISH_STORE_NAME, sessionId);
  } catch (error) {
    console.warn("删除润色历史失败:", error);
  }
}

/**
 * 清理过期的润色缓存
 */
export async function cleanExpiredPolish(): Promise<number> {
  try {
    const db = await getDB();
    const now = Date.now();
    const tx = db.transaction(POLISH_STORE_NAME, "readwrite");
    const store = tx.objectStore(POLISH_STORE_NAME);
    const index = store.index("expires_at");

    let deletedCount = 0;
    let cursor = await index.openCursor();
    while (cursor) {
      if (cursor.value.expires_at < now) {
        await cursor.delete();
        deletedCount++;
      } else {
        break;
      }
      cursor = await cursor.continue();
    }

    await tx.done;
    return deletedCount;
  } catch {
    return 0;
  }
}
