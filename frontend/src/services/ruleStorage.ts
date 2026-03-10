/**
 * localStorage 规则管理服务
 *
 * 管理用户自定义规则（模板提取/LLM 生成）的 CRUD 操作。
 * 规则保存在浏览器 localStorage 中，30天后过期自动删除。
 *
 * 存储键名: docx-fix:custom-rules
 * 值格式: JSON string (CustomRule[])
 */

import type { CustomRule } from "../types";

const STORAGE_KEY = "docx-fix:custom-rules";
const EXPIRY_DAYS = 30;
const MAX_STORAGE_BYTES = 4 * 1024 * 1024; // 4MB 警告阈值
const MAX_SINGLE_RULE_BYTES = 4 * 1024 * 1024; // 单条规则 YAML 上限 4MB

// 存储变更订阅者列表（用于多 Tab 同步）
type StorageChangeListener = (rules: CustomRule[]) => void;
const _listeners: Set<StorageChangeListener> = new Set();

// ========================================
// 内部工具函数
// ========================================

/** 从 localStorage 读取规则列表（原始，含过期） */
function _readRaw(): CustomRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CustomRule[];
  } catch {
    return [];
  }
}

/** 写入规则列表到 localStorage，捕获配额超限错误 */
function _write(rules: CustomRule[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch (e: unknown) {
    // QuotaExceededError — 存储空间不足
    if (
      e instanceof DOMException &&
      (e.name === "QuotaExceededError" || e.code === 22)
    ) {
      throw new Error(
        "浏览器存储空间不足，无法保存规则。请删除部分旧规则后重试。"
      );
    }
    throw e;
  }
}

/** 通知所有订阅者规则列表已变更 */
function _notifyListeners(): void {
  const rules = getAll();
  _listeners.forEach((fn) => {
    try {
      fn(rules);
    } catch {
      // 订阅者回调出错不影响其他订阅者
    }
  });
}

/** 过滤掉过期的规则 */
function _filterExpired(rules: CustomRule[]): CustomRule[] {
  const now = new Date().toISOString();
  return rules.filter((r) => r.expires_at > now);
}

/** 生成 UUID v4 */
function _uuid(): string {
  return crypto.randomUUID();
}

// ========================================
// 公共 API
// ========================================

/**
 * 初始化：清理过期规则。
 * 应在应用启动时调用。
 */
export function init(): void {
  const raw = _readRaw();
  const valid = _filterExpired(raw);
  if (valid.length !== raw.length) {
    _write(valid);
    console.log(
      `[ruleStorage] 已清理 ${raw.length - valid.length} 条过期规则`
    );
  }
}

/**
 * 获取所有未过期的自定义规则。
 * 惰性清理：读取时也会过滤过期项。
 */
export function getAll(): CustomRule[] {
  const raw = _readRaw();
  const valid = _filterExpired(raw);
  // 惰性清理
  if (valid.length !== raw.length) {
    _write(valid);
  }
  return valid;
}

/**
 * 根据 ID 获取单条规则。
 */
export function getById(id: string): CustomRule | null {
  const rules = getAll();
  return rules.find((r) => r.id === id) ?? null;
}

/**
 * 保存新规则，返回生成的 ID。
 * @throws 存储空间不足或 YAML 过大时抛出带友好消息的 Error。
 */
export function save(
  rule: Omit<CustomRule, "id" | "created_at" | "expires_at">
): string {
  // T022: YAML 过大检查
  const yamlBytes = new Blob([rule.yaml_content]).size;
  if (yamlBytes > MAX_SINGLE_RULE_BYTES) {
    throw new Error(
      `规则 YAML 内容过大（${(yamlBytes / 1024 / 1024).toFixed(1)}MB），超过单条规则上限 4MB。请精简规则内容后重试。`
    );
  }

  // T022: 存储接近上限预警
  if (isNearLimit()) {
    console.warn(
      "[ruleStorage] 存储使用量已接近上限，建议删除不需要的旧规则"
    );
  }

  const rules = getAll();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const newRule: CustomRule = {
    ...rule,
    id: _uuid(),
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };

  rules.push(newRule);
  _write(rules); // 可能抛出 QuotaExceededError
  _notifyListeners();
  return newRule.id;
}

/**
 * 重命名规则（同步更新 yaml_content 中的 meta.name）。
 */
export function rename(id: string, newName: string): boolean {
  const rules = getAll();
  const idx = rules.findIndex((r) => r.id === id);
  if (idx === -1) return false;

  rules[idx].name = newName;

  // 同步更新 YAML 中的 meta.name
  rules[idx].yaml_content = rules[idx].yaml_content.replace(
    /^(\s*name:\s*).+$/m,
    `$1${newName}`
  );

  _write(rules);
  _notifyListeners();
  return true;
}

/**
 * 删除规则。
 */
export function remove(id: string): boolean {
  const rules = getAll();
  const filtered = rules.filter((r) => r.id !== id);
  if (filtered.length === rules.length) return false;
  _write(filtered);
  _notifyListeners();
  return true;
}

/**
 * 获取存储使用量（字节）。
 */
export function getStorageSize(): number {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return 0;
  // UTF-16 编码，每个字符 2 字节
  return raw.length * 2;
}

/**
 * 检查存储是否接近上限。
 */
export function isNearLimit(): boolean {
  return getStorageSize() > MAX_STORAGE_BYTES;
}

/**
 * 检查 localStorage 是否可用。
 * 在隐私模式或 localStorage 被禁用时返回 false。
 */
export function isAvailable(): boolean {
  try {
    const testKey = "__docx_fix_storage_test__";
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * 将规则导出为 YAML 文件下载。
 */
export function downloadAsYaml(rule: CustomRule): void {
  const blob = new Blob([rule.yaml_content], { type: "text/yaml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${rule.name}.yaml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ========================================
// T022: 隐私模式降级提示
// ========================================

/**
 * 获取存储不可用时的降级提示信息。
 * 调用方可在 UI 层展示此提示。
 */
export function getUnavailableMessage(): string {
  return "浏览器存储不可用（可能处于隐私/无痕模式），自定义规则将无法持久保存。关闭隐私模式后可正常使用。";
}

/**
 * 获取当前存储使用量的人类可读描述。
 */
export function getStorageSizeLabel(): string {
  const bytes = getStorageSize();
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ========================================
// T023: 多 Tab 数据一致性
// ========================================

/**
 * 订阅规则变更通知。
 * 包括本 Tab 内的变更和其他 Tab 通过 storage 事件同步的变更。
 * @returns 取消订阅函数
 */
export function subscribe(listener: StorageChangeListener): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

/**
 * 启动跨 Tab storage 事件监听。
 * 当其他 Tab 修改了 localStorage 中的规则时，自动通知本 Tab 的订阅者。
 * 应在应用启动时调用一次。
 * @returns 清理函数，用于移除事件监听器
 */
export function startCrossTabSync(): () => void {
  const handler = (event: StorageEvent) => {
    // 只关心本服务的存储键
    if (event.key !== STORAGE_KEY) return;
    console.log("[ruleStorage] 检测到其他标签页修改了规则，正在同步...");
    _notifyListeners();
  };

  window.addEventListener("storage", handler);

  return () => {
    window.removeEventListener("storage", handler);
  };
}
