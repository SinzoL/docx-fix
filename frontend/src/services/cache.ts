/**
 * IndexedDB 缓存管理
 *
 * 使用 idb 库管理浏览器本地缓存，存储检查历史记录。
 * 有效期 30 天，过期自动清理。
 */

import { openDB, type IDBPDatabase } from "idb";
import type { HistoryRecord, CheckReport, FixReport } from "../types";

const DB_NAME = "docx-fix-cache";
const DB_VERSION = 1;
const STORE_NAME = "history";
const EXPIRY_DAYS = 30;

type DocxFixDB = IDBPDatabase;

let dbInstance: DocxFixDB | null = null;

/**
 * 获取数据库实例（单例）
 */
async function getDB(): Promise<DocxFixDB> {
  if (dbInstance) return dbInstance;

  try {
    dbInstance = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("filename", "filename", { unique: false });
          store.createIndex("created_at", "created_at", { unique: false });
          store.createIndex("expires_at", "expires_at", { unique: false });
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
  } catch (error) {
    console.warn("清除缓存失败:", error);
  }
}
