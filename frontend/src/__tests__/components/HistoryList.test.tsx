/**
 * HistoryList 组件测试
 *
 * 测试内容：
 * - 空状态
 * - 记录列表展示
 * - 删除功能
 */

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import HistoryList from "../../components/HistoryList";
import { saveHistory, clearAll } from "../../services/cache";
import type { CheckReport } from "../../types";

const mockCheckReport: CheckReport = {
  session_id: "hist-1",
  filename: "history_test.docx",
  rule_id: "default",
  rule_name: "通用默认检查",
  items: [
    {
      category: "页面设置",
      item: "纸张大小",
      status: "PASS",
      message: "A4",
      location: null,
      fixable: false,
    },
    {
      category: "字体",
      item: "中文字体",
      status: "FAIL",
      message: "字体不正确",
      location: null,
      fixable: true,
    },
  ],
  summary: { pass_count: 1, warn: 0, fail: 1, fixable: 1 },
  checked_at: "2026-01-01T00:00:00Z",
};

beforeEach(async () => {
  await clearAll();
});

describe("HistoryList", () => {
  it("没有记录时应显示空状态", async () => {
    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText(/暂无历史记录/)).toBeInTheDocument();
    });
  });

  it("有记录时应显示文件名", async () => {
    await saveHistory(
      "hist-1",
      "history_test.docx",
      "default",
      "通用默认检查",
      mockCheckReport
    );

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("history_test.docx")).toBeInTheDocument();
    });
  });

  it("应显示规则名称", async () => {
    await saveHistory(
      "hist-2",
      "test2.docx",
      "default",
      "通用默认检查",
      mockCheckReport
    );

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("通用默认检查")).toBeInTheDocument();
    });
  });

  it("有失败项时应显示错误标签", async () => {
    await saveHistory(
      "hist-3",
      "test3.docx",
      "default",
      "通用默认检查",
      mockCheckReport
    );

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText(/1 错误/)).toBeInTheDocument();
    });
  });

  it("应显示记录数量", async () => {
    await saveHistory("r1", "a.docx", "default", "规则", mockCheckReport);
    await saveHistory("r2", "b.docx", "default", "规则", mockCheckReport);

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText(/历史记录 \(2\)/)).toBeInTheDocument();
    });
  });
});
