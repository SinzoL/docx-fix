/**
 * ruleStorage.ts 单元测试
 *
 * 测试 localStorage 规则管理服务的全部公共 API。
 * 使用 jsdom 环境提供的 localStorage 进行真实读写。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CustomRule, RuleSource } from "../../types";
import {
  init,
  getAll,
  getById,
  save,
  rename,
  remove,
  getStorageSize,
  isNearLimit,
  isAvailable,
  downloadAsYaml,
  getUnavailableMessage,
  getStorageSizeLabel,
  subscribe,
  startCrossTabSync,
} from "../../services/ruleStorage";

const STORAGE_KEY = "docx-fix:custom-rules";

/** 构建一条测试用的 CustomRule */
function makeRule(overrides: Partial<CustomRule> = {}): CustomRule {
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    id: "test-id-1",
    name: "测试规则",
    source: "template-extract" as RuleSource,
    yaml_content: "meta:\n  name: 测试规则\nstyles:\n  - name: 正文",
    source_filename: "template.docx",
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
    ...overrides,
  };
}

/** 构建一条已过期的 CustomRule */
function makeExpiredRule(overrides: Partial<CustomRule> = {}): CustomRule {
  const past = new Date(Date.now() - 1000); // 1 秒前过期
  return makeRule({
    id: "expired-id",
    name: "过期规则",
    expires_at: past.toISOString(),
    ...overrides,
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// ========================================
// init()
// ========================================

describe("init", () => {
  it("应清理过期的规则", () => {
    const validRule = makeRule({ id: "valid-1" });
    const expiredRule = makeExpiredRule({ id: "expired-1" });
    localStorage.setItem(STORAGE_KEY, JSON.stringify([validRule, expiredRule]));

    init();

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as CustomRule[];
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe("valid-1");
  });

  it("无过期规则时不应修改存储", () => {
    const rule = makeRule();
    const data = JSON.stringify([rule]);
    localStorage.setItem(STORAGE_KEY, data);

    init();

    expect(localStorage.getItem(STORAGE_KEY)).toBe(data);
  });

  it("空存储不应报错", () => {
    expect(() => init()).not.toThrow();
  });
});

// ========================================
// getAll()
// ========================================

describe("getAll", () => {
  it("应返回所有未过期的规则", () => {
    const rules = [makeRule({ id: "r1" }), makeRule({ id: "r2" })];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));

    const result = getAll();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("r1");
    expect(result[1].id).toBe("r2");
  });

  it("应惰性清理过期规则", () => {
    const valid = makeRule({ id: "valid" });
    const expired = makeExpiredRule({ id: "expired" });
    localStorage.setItem(STORAGE_KEY, JSON.stringify([valid, expired]));

    const result = getAll();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("valid");

    // 验证 localStorage 中也已清理
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as CustomRule[];
    expect(stored).toHaveLength(1);
  });

  it("空存储应返回空数组", () => {
    expect(getAll()).toEqual([]);
  });

  it("损坏的 JSON 应返回空数组", () => {
    localStorage.setItem(STORAGE_KEY, "{not valid json");
    expect(getAll()).toEqual([]);
  });
});

// ========================================
// getById()
// ========================================

describe("getById", () => {
  it("应根据 ID 返回对应规则", () => {
    const rule = makeRule({ id: "target-id" });
    localStorage.setItem(STORAGE_KEY, JSON.stringify([rule]));

    const result = getById("target-id");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("target-id");
    expect(result!.name).toBe("测试规则");
  });

  it("ID 不存在时应返回 null", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([makeRule()]));
    expect(getById("nonexistent")).toBeNull();
  });

  it("不应返回已过期的规则", () => {
    const expired = makeExpiredRule({ id: "expired-target" });
    localStorage.setItem(STORAGE_KEY, JSON.stringify([expired]));

    expect(getById("expired-target")).toBeNull();
  });
});

// ========================================
// save()
// ========================================

describe("save", () => {
  it("应保存规则并返回生成的 ID", () => {
    const id = save({
      name: "新规则",
      source: "template-extract",
      yaml_content: "meta:\n  name: 新规则",
      source_filename: "doc.docx",
    });

    expect(id).toBeDefined();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);

    const rules = getAll();
    expect(rules).toHaveLength(1);
    expect(rules[0].name).toBe("新规则");
    expect(rules[0].id).toBe(id);
  });

  it("应自动设置 created_at 和 expires_at", () => {
    const before = Date.now();
    save({
      name: "时间测试",
      source: "llm-generate",
      yaml_content: "meta:\n  name: 时间测试",
    });
    const after = Date.now();

    const rule = getAll()[0];
    const created = new Date(rule.created_at).getTime();
    const expires = new Date(rule.expires_at).getTime();

    expect(created).toBeGreaterThanOrEqual(before);
    expect(created).toBeLessThanOrEqual(after);
    // expires_at 应在 30 天后
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(expires - created).toBe(thirtyDays);
  });

  it("应能保存多条规则", () => {
    save({ name: "规则A", source: "template-extract", yaml_content: "a" });
    save({ name: "规则B", source: "llm-generate", yaml_content: "b" });
    save({ name: "规则C", source: "template-extract", yaml_content: "c" });

    expect(getAll()).toHaveLength(3);
  });

  it("YAML 过大时应抛出错误", () => {
    // 构造超过 4MB 的内容
    const hugeContent = "x".repeat(5 * 1024 * 1024);
    expect(() =>
      save({
        name: "超大规则",
        source: "template-extract",
        yaml_content: hugeContent,
      })
    ).toThrow(/规则 YAML 内容过大/);
  });

  it("存储空间不足时应抛出友好错误", () => {
    // Mock localStorage.setItem 抛出 QuotaExceededError
    const quotaError = new DOMException("QuotaExceededError", "QuotaExceededError");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((key: string) => {
      if (key === STORAGE_KEY) {
        throw quotaError;
      }
    });

    expect(() =>
      save({
        name: "配额测试",
        source: "template-extract",
        yaml_content: "meta:\n  name: test",
      })
    ).toThrow(/浏览器存储空间不足/);
  });
});

// ========================================
// rename()
// ========================================

describe("rename", () => {
  it("应重命名规则", () => {
    const id = save({
      name: "旧名称",
      source: "template-extract",
      yaml_content: "meta:\n  name: 旧名称\nstyles: []",
    });

    const result = rename(id, "新名称");
    expect(result).toBe(true);

    const rule = getById(id)!;
    expect(rule.name).toBe("新名称");
  });

  it("应同步更新 YAML 中的 meta.name", () => {
    const id = save({
      name: "原始名",
      source: "template-extract",
      yaml_content: "meta:\n  name: 原始名\nstyles:\n  - name: 正文",
    });

    rename(id, "更新名");

    const rule = getById(id)!;
    expect(rule.yaml_content).toContain("name: 更新名");
    expect(rule.yaml_content).not.toContain("name: 原始名");
    // styles 中的 name 不应被影响
    expect(rule.yaml_content).toContain("- name: 正文");
  });

  it("ID 不存在时应返回 false", () => {
    expect(rename("nonexistent", "新名称")).toBe(false);
  });
});

// ========================================
// remove()
// ========================================

describe("remove", () => {
  it("应删除指定规则", () => {
    const id1 = save({ name: "A", source: "template-extract", yaml_content: "a" });
    const id2 = save({ name: "B", source: "template-extract", yaml_content: "b" });

    const result = remove(id1);
    expect(result).toBe(true);

    const rules = getAll();
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe(id2);
  });

  it("ID 不存在时应返回 false", () => {
    expect(remove("nonexistent")).toBe(false);
  });

  it("删除后 getById 应返回 null", () => {
    const id = save({ name: "将被删除", source: "template-extract", yaml_content: "x" });
    remove(id);
    expect(getById(id)).toBeNull();
  });
});

// ========================================
// getStorageSize() / isNearLimit()
// ========================================

describe("getStorageSize", () => {
  it("空存储应返回 0", () => {
    expect(getStorageSize()).toBe(0);
  });

  it("有数据时应返回字节数（UTF-16 编码）", () => {
    save({ name: "test", source: "template-extract", yaml_content: "content" });
    const size = getStorageSize();
    expect(size).toBeGreaterThan(0);

    // UTF-16 编码，每个字符 2 字节
    const rawLength = localStorage.getItem(STORAGE_KEY)!.length;
    expect(size).toBe(rawLength * 2);
  });
});

describe("isNearLimit", () => {
  it("数据量小时应返回 false", () => {
    save({ name: "小规则", source: "template-extract", yaml_content: "small" });
    expect(isNearLimit()).toBe(false);
  });
});

// ========================================
// isAvailable()
// ========================================

describe("isAvailable", () => {
  it("正常环境应返回 true", () => {
    expect(isAvailable()).toBe(true);
  });

  it("localStorage 不可用时应返回 false", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(isAvailable()).toBe(false);
  });
});

// ========================================
// getUnavailableMessage() / getStorageSizeLabel()
// ========================================

describe("getUnavailableMessage", () => {
  it("应返回非空字符串", () => {
    const msg = getUnavailableMessage();
    expect(msg).toBeTruthy();
    expect(typeof msg).toBe("string");
    expect(msg).toContain("隐私");
  });
});

describe("getStorageSizeLabel", () => {
  it("空存储应返回 '0 B'", () => {
    expect(getStorageSizeLabel()).toBe("0 B");
  });

  it("有数据时应返回人类可读大小", () => {
    save({ name: "测试", source: "template-extract", yaml_content: "content" });
    const label = getStorageSizeLabel();
    // 应包含 B / KB / MB 单位
    expect(label).toMatch(/\d+(\.\d+)?\s*(B|KB|MB)/);
  });
});

// ========================================
// subscribe() 与变更通知
// ========================================

describe("subscribe", () => {
  it("save 操作应通知订阅者", () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);

    save({ name: "通知测试", source: "template-extract", yaml_content: "y" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ name: "通知测试" }),
    ]));

    unsub();
  });

  it("rename 操作应通知订阅者", () => {
    const id = save({ name: "原名", source: "template-extract", yaml_content: "z" });
    const listener = vi.fn();
    const unsub = subscribe(listener);

    rename(id, "新名");

    expect(listener).toHaveBeenCalled();
    unsub();
  });

  it("remove 操作应通知订阅者", () => {
    const id = save({ name: "删除测试", source: "template-extract", yaml_content: "w" });
    const listener = vi.fn();
    const unsub = subscribe(listener);

    remove(id);

    expect(listener).toHaveBeenCalled();
    unsub();
  });

  it("取消订阅后不应再收到通知", () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    unsub();

    save({ name: "不应通知", source: "template-extract", yaml_content: "n" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("订阅者回调出错不应影响其他订阅者", () => {
    const badListener = vi.fn(() => {
      throw new Error("回调出错");
    });
    const goodListener = vi.fn();

    const unsub1 = subscribe(badListener);
    const unsub2 = subscribe(goodListener);

    save({ name: "容错测试", source: "template-extract", yaml_content: "err" });

    expect(badListener).toHaveBeenCalled();
    expect(goodListener).toHaveBeenCalled();

    unsub1();
    unsub2();
  });
});

// ========================================
// startCrossTabSync()
// ========================================

describe("startCrossTabSync", () => {
  it("应监听 storage 事件并通知订阅者", () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    const stopSync = startCrossTabSync();

    // 模拟其他 Tab 修改 storage
    const event = new StorageEvent("storage", {
      key: STORAGE_KEY,
      newValue: JSON.stringify([makeRule()]),
    });
    window.dispatchEvent(event);

    expect(listener).toHaveBeenCalled();

    stopSync();
    unsub();
  });

  it("应忽略非本服务 key 的 storage 事件", () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    const stopSync = startCrossTabSync();

    const event = new StorageEvent("storage", {
      key: "other-key",
      newValue: "data",
    });
    window.dispatchEvent(event);

    expect(listener).not.toHaveBeenCalled();

    stopSync();
    unsub();
  });

  it("清理函数应移除事件监听", () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    const stopSync = startCrossTabSync();

    // 先停止同步
    stopSync();

    // 再触发事件
    const event = new StorageEvent("storage", {
      key: STORAGE_KEY,
      newValue: JSON.stringify([]),
    });
    window.dispatchEvent(event);

    expect(listener).not.toHaveBeenCalled();

    unsub();
  });
});

// ========================================
// downloadAsYaml()
// ========================================

describe("downloadAsYaml", () => {
  it("应创建并点击 a 标签下载 YAML 文件", () => {
    const mockCreateObjectURL = vi.fn(() => "blob:test-url");
    const mockRevokeObjectURL = vi.fn();
    globalThis.URL.createObjectURL = mockCreateObjectURL;
    globalThis.URL.revokeObjectURL = mockRevokeObjectURL;

    const mockClick = vi.fn();
    vi.spyOn(document, "createElement").mockReturnValue({
      set href(_v: string) { /* noop */ },
      set download(_v: string) { /* noop */ },
      click: mockClick,
    } as unknown as HTMLAnchorElement);
    vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
    vi.spyOn(document.body, "removeChild").mockImplementation((node) => node);

    const rule = makeRule({ name: "下载测试" });
    downloadAsYaml(rule);

    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:test-url");
  });
});
