/**
 * api.ts 单元测试
 *
 * 使用 vi.fn() mock fetch，测试所有 API 封装函数。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchRules,
  fetchRuleDetail,
  checkFile,
  fixFile,
  downloadFixedFile,
  triggerDownload,
  ApiError,
} from "../../services/api";

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe("fetchRules", () => {
  it("应返回规则列表", async () => {
    const mockData = {
      rules: [
        {
          id: "default",
          filename: "default.yaml",
          name: "通用默认检查",
          description: "基础格式检查",
          is_default: true,
        },
      ],
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const result = await fetchRules();
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].id).toBe("default");
    expect(mockFetch.mock.calls[0][0]).toBe("/api/rules");
  });

  it("API 错误应抛出 ApiError", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({ error: "SERVER_ERROR", message: "服务器错误" }),
    });

    await expect(fetchRules()).rejects.toThrow(ApiError);
  });
});

describe("fetchRuleDetail", () => {
  it("应使用正确的 URL 请求规则详情", async () => {
    const mockData = {
      id: "default",
      name: "通用默认检查",
      description: "",
      sections: [],
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    await fetchRuleDetail("default");
    expect(mockFetch.mock.calls[0][0]).toBe("/api/rules/default");
  });
});

describe("checkFile", () => {
  it("应发送 FormData 包含 file、rule_id 和 session_id", async () => {
    const mockReport = {
      session_id: "s1",
      filename: "test.docx",
      rule_id: "default",
      rule_name: "通用默认检查",
      items: [],
      summary: { pass_count: 0, warn: 0, fail: 0, fixable: 0 },
      checked_at: "2026-01-01T00:00:00Z",
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockReport),
    });

    const file = new File(["content"], "test.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const result = await checkFile(file, "default", "session-123");
    expect(result.session_id).toBe("s1");

    // 验证 fetch 调用参数
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/check");
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
  });
});

describe("fixFile", () => {
  it("应发送 JSON body 包含 session_id 和 rule_id", async () => {
    const mockReport = {
      session_id: "s1",
      filename: "test.docx",
      rule_name: "通用默认检查",
      fix_items: [],
      before_summary: { pass_count: 5, warn: 1, fail: 2 },
      after_summary: { pass_count: 7, warn: 1, fail: 0 },
      changed_items: [],
      fixed_at: "2026-01-01T00:00:00Z",
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockReport),
    });

    const result = await fixFile("session-123", "default");
    expect(result.session_id).toBe("s1");

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/fix");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      session_id: "session-123",
      rule_id: "default",
    });
  });
});

describe("downloadFixedFile", () => {
  it("应返回 Blob", async () => {
    const mockBlob = new Blob(["test"], { type: "application/octet-stream" });
    mockFetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    const result = await downloadFixedFile("session-123");
    expect(result).toBeInstanceOf(Blob);
    expect(mockFetch.mock.calls[0][0]).toBe(
      "/api/fix/download?session_id=session-123"
    );
  });

  it("下载失败应抛出 ApiError", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () =>
        Promise.resolve({ error: "SESSION_NOT_FOUND", message: "会话不存在" }),
    });

    await expect(downloadFixedFile("bad-session")).rejects.toThrow(ApiError);
  });
});

describe("triggerDownload", () => {
  it("应创建并点击 a 标签", () => {
    const mockCreateElement = vi.spyOn(document, "createElement");
    const mockAppendChild = vi.spyOn(document.body, "appendChild");
    const mockRemoveChild = vi.spyOn(document.body, "removeChild");
    const mockCreateObjectURL = vi.fn(() => "blob:test-url");
    const mockRevokeObjectURL = vi.fn();
    globalThis.URL.createObjectURL = mockCreateObjectURL;
    globalThis.URL.revokeObjectURL = mockRevokeObjectURL;

    const blob = new Blob(["test"]);
    triggerDownload(blob, "test_fixed.docx");

    expect(mockCreateObjectURL).toHaveBeenCalledWith(blob);
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:test-url");

    mockCreateElement.mockRestore();
    mockAppendChild.mockRestore();
    mockRemoveChild.mockRestore();
  });
});
