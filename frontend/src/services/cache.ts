/**
 * IndexedDB 缓存管理
 *
 * 使用泛型 IndexedDBStore<T> 消除三套 CRUD 重复代码。
 * 对外导出的函数名保持不变，调用方无需修改。
 */

import { openDB, type IDBPDatabase } from "idb";
import type { HistoryRecord, CheckReport, FixReport, PolishHistoryRecord, PolishSuggestion, PolishSummary, ExtractHistoryRecord } from "../types";

const DB_NAME = "docx-fix-cache";
const DB_VERSION = 3;
const STORE_NAME = "history";
const POLISH_STORE_NAME = "polish-history";
const EXTRACT_STORE_NAME = "extract-history";
const EXPIRY_DAYS = 30;
/** 润色缓存有效期（7天，比历史记录更短以节省空间） */
const POLISH_EXPIRY_DAYS = 7;
/** 提取缓存有效期（30天，与检查历史一致），供外部调用方使用 */
export const EXTRACT_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

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
        // v3: 提取历史缓存
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains(EXTRACT_STORE_NAME)) {
            const extractStore = db.createObjectStore(EXTRACT_STORE_NAME, { keyPath: "id" });
            extractStore.createIndex("created_at", "created_at", { unique: false });
            extractStore.createIndex("expires_at", "expires_at", { unique: false });
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

// ========================================
// 泛型 IndexedDBStore<T>
// ========================================

/**
 * 泛型 IndexedDB Store，封装单个 object store 的 CRUD 操作。
 *
 * 要求 T 包含 `id: string`、`created_at: number`、`expires_at: number` 字段。
 */
class IndexedDBStore<T extends { id: string; created_at: number; expires_at: number }> {
  private storeName: string;
  constructor(storeName: string) {
    this.storeName = storeName;
  }

  /** 写入/更新一条记录 */
  async put(record: T): Promise<void> {
    try {
      const db = await getDB();
      await db.put(this.storeName, record);
    } catch (error) {
      console.warn(`[${this.storeName}] 保存缓存失败:`, error);
    }
  }

  /** 获取单条记录（不检查过期） */
  async get(id: string): Promise<T | undefined> {
    try {
      const db = await getDB();
      return db.get(this.storeName, id);
    } catch {
      return undefined;
    }
  }

  /** 获取单条记录，过期则删除并返回 undefined */
  async getIfValid(id: string): Promise<T | undefined> {
    try {
      const db = await getDB();
      const record = await db.get(this.storeName, id) as T | undefined;
      if (!record) return undefined;
      if (record.expires_at < Date.now()) {
        await db.delete(this.storeName, id);
        return undefined;
      }
      return record;
    } catch {
      return undefined;
    }
  }

  /** 获取所有记录（按 created_at 降序，可选过滤过期） */
  async getAll(filterExpired = false): Promise<T[]> {
    try {
      const db = await getDB();
      const records = await db.getAll(this.storeName) as T[];
      const now = Date.now();
      const filtered = filterExpired
        ? records.filter((r) => r.expires_at > now)
        : records;
      filtered.sort((a, b) => b.created_at - a.created_at);
      return filtered;
    } catch {
      return [];
    }
  }

  /** 删除单条记录 */
  async delete(id: string): Promise<void> {
    try {
      const db = await getDB();
      await db.delete(this.storeName, id);
    } catch (error) {
      console.warn(`[${this.storeName}] 删除缓存失败:`, error);
    }
  }

  /** 清除该 store 的所有记录 */
  async clear(): Promise<void> {
    try {
      const db = await getDB();
      await db.clear(this.storeName);
    } catch (error) {
      console.warn(`[${this.storeName}] 清除缓存失败:`, error);
    }
  }

  /** 清理过期记录（基于 expires_at 索引） */
  async cleanExpired(): Promise<number> {
    try {
      const db = await getDB();
      const now = Date.now();
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
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

  /** 清理最旧的记录（空间不足时使用） */
  async cleanOldest(count: number = 5): Promise<void> {
    try {
      const db = await getDB();
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
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
      console.warn(`[${this.storeName}] 清理旧缓存失败:`, error);
    }
  }

  /** 读取-修改-写回（用于局部更新字段） */
  async update(id: string, updater: (record: T) => void): Promise<void> {
    try {
      const db = await getDB();
      const record = await db.get(this.storeName, id) as T | undefined;
      if (record) {
        updater(record);
        await db.put(this.storeName, record);
      }
    } catch (error) {
      console.warn(`[${this.storeName}] 更新缓存失败:`, error);
    }
  }
}

// ========================================
// 各模块 Store 实例
// ========================================

const checkStore = new IndexedDBStore<HistoryRecord>(STORE_NAME);
const polishStore = new IndexedDBStore<PolishHistoryRecord>(POLISH_STORE_NAME);
const extractStore = new IndexedDBStore<ExtractHistoryRecord>(EXTRACT_STORE_NAME);

// ========================================
// 检查历史 — 对外导出（保持原函数签名）
// ========================================

export async function saveHistory(
  id: string,
  filename: string,
  ruleId: string,
  ruleName: string,
  checkReport: CheckReport,
  customRulesYaml?: string,
  selectedRuleId?: string,
): Promise<void> {
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
  if (customRulesYaml) record.custom_rules_yaml = customRulesYaml;
  if (selectedRuleId) record.selected_rule_id = selectedRuleId;
  await checkStore.put(record);
}

export async function updateFixReport(
  id: string,
  fixReport: FixReport
): Promise<void> {
  await checkStore.update(id, (record) => {
    record.fix_report = fixReport;
  });
}

export async function getHistoryList(): Promise<HistoryRecord[]> {
  return checkStore.getAll();
}

export async function getHistory(
  id: string
): Promise<HistoryRecord | undefined> {
  return checkStore.get(id);
}

export async function deleteHistory(id: string): Promise<void> {
  return checkStore.delete(id);
}

export async function cleanExpired(): Promise<number> {
  return checkStore.cleanExpired();
}

export async function cleanOldest(count: number = 5): Promise<void> {
  return checkStore.cleanOldest(count);
}

export async function clearAll(): Promise<void> {
  await checkStore.clear();
  await polishStore.clear();
  await extractStore.clear();
}

// ========================================
// 润色结果缓存 — 对外导出（保持原函数签名）
// ========================================

export async function savePolishResult(
  sessionId: string,
  filename: string,
  suggestions: PolishSuggestion[],
  summary: PolishSummary | null,
): Promise<void> {
  const now = Date.now();
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
  await polishStore.put(record);
}

export async function getLatestPolishResult(): Promise<PolishHistoryRecord | null> {
  const all = await polishStore.getAll(true);
  const valid = all.filter((r) => !r.applied);
  return valid.length > 0 ? valid[0] : null;
}

export async function getPolishResult(sessionId: string): Promise<PolishHistoryRecord | null> {
  const record = await polishStore.getIfValid(sessionId);
  return record ?? null;
}

export async function updatePolishDecisions(
  sessionId: string,
  decisions: Record<number, boolean>,
): Promise<void> {
  await polishStore.update(sessionId, (record) => {
    record.decisions = decisions;
  });
}

export async function markPolishApplied(sessionId: string): Promise<void> {
  await polishStore.update(sessionId, (record) => {
    record.applied = true;
  });
}

export async function getPolishHistoryList(): Promise<PolishHistoryRecord[]> {
  return polishStore.getAll(true);
}

export async function deletePolishHistory(sessionId: string): Promise<void> {
  return polishStore.delete(sessionId);
}

export async function cleanExpiredPolish(): Promise<number> {
  return polishStore.cleanExpired();
}

// ========================================
// 提取历史缓存 — 对外导出（保持原函数签名）
// ========================================

export async function saveExtractHistory(
  record: ExtractHistoryRecord,
): Promise<void> {
  await extractStore.put(record);
}

export async function getExtractHistoryList(): Promise<ExtractHistoryRecord[]> {
  return extractStore.getAll(true);
}

export async function getExtractHistory(
  id: string,
): Promise<ExtractHistoryRecord | undefined> {
  return extractStore.getIfValid(id);
}

export async function deleteExtractHistory(id: string): Promise<void> {
  return extractStore.delete(id);
}

export async function cleanExpiredExtract(): Promise<number> {
  return extractStore.cleanExpired();
}
