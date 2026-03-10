/**
 * FixPreview 组件测试
 *
 * 测试内容：
 * - 修复前后对比展示
 * - 变化项列表
 * - 下载按钮
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import FixPreview from "../../components/FixPreview";
import type { FixReport } from "../../types";

// Mock API
vi.mock("../../services/api", () => ({
  downloadFixedFile: vi.fn().mockResolvedValue(new Blob(["test"])),
  triggerDownload: vi.fn(),
}));

const mockFixReport: FixReport = {
  session_id: "test-session",
  filename: "test.docx",
  rule_name: "通用默认检查",
  fix_items: [
    { category: "字体", description: "修复中文字体为宋体" },
    { category: "页面设置", description: "修复页边距" },
  ],
  before_summary: { pass: 5, warn: 1, fail: 3 },
  after_summary: { pass: 8, warn: 1, fail: 0 },
  changed_items: [
    {
      category: "字体",
      item: "中文字体",
      before_status: "FAIL",
      after_status: "PASS",
      message: "已修复为宋体",
    },
    {
      category: "页面设置",
      item: "页边距",
      before_status: "FAIL",
      after_status: "PASS",
      message: "已修复页边距",
    },
  ],
  fixed_at: "2026-01-01T00:00:00Z",
};

describe("FixPreview", () => {
  it("应显示文件名和规则名", () => {
    render(
      <FixPreview
        report={mockFixReport}
        sessionId="test-session"
        onDownloadComplete={vi.fn()}
      />
    );
    expect(screen.getByText(/test.docx/)).toBeInTheDocument();
    expect(screen.getByText(/通用默认检查/)).toBeInTheDocument();
  });

  it("应显示修复前后 summary 对比", () => {
    render(
      <FixPreview
        report={mockFixReport}
        sessionId="test-session"
        onDownloadComplete={vi.fn()}
      />
    );
    expect(screen.getByText("修复前")).toBeInTheDocument();
    expect(screen.getByText("修复后")).toBeInTheDocument();
  });

  it("应显示变化项数量", () => {
    render(
      <FixPreview
        report={mockFixReport}
        sessionId="test-session"
        onDownloadComplete={vi.fn()}
      />
    );
    expect(screen.getByText(/状态变化项 \(2\)/)).toBeInTheDocument();
  });

  it("应显示修复操作数量", () => {
    render(
      <FixPreview
        report={mockFixReport}
        sessionId="test-session"
        onDownloadComplete={vi.fn()}
      />
    );
    expect(screen.getByText(/自动修复操作记录/)).toBeInTheDocument();
  });

  it("应显示下载按钮", () => {
    render(
      <FixPreview
        report={mockFixReport}
        sessionId="test-session"
        onDownloadComplete={vi.fn()}
      />
    );
    expect(screen.getByText(/下载修复后文件/)).toBeInTheDocument();
  });

  it("应显示变化项详情", () => {
    render(
      <FixPreview
        report={mockFixReport}
        sessionId="test-session"
        onDownloadComplete={vi.fn()}
      />
    );
    // "中文字体" 出现在变化项和修复操作列表中，所以使用 getAllByText
    const matches = screen.getAllByText(/中文字体/);
    expect(matches.length).toBeGreaterThan(0);
    expect(screen.getByText(/修复中文字体为宋体/)).toBeInTheDocument();
  });
});
