/**
 * CheckReport 组件测试
 *
 * 测试内容：
 * - 报告汇总展示
 * - 按类别分组
 * - 状态标签
 * - 修复按钮状态
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CheckReportView from "../../components/CheckReport";
import type { CheckReport } from "../../types";

const mockReport: CheckReport = {
  session_id: "test-session",
  filename: "test.docx",
  rule_id: "default",
  rule_name: "通用默认检查",
  items: [
    {
      category: "页面设置",
      item: "纸张大小",
      status: "PASS",
      message: "A4 纸张，符合要求",
      location: null,
      fixable: false,
    },
    {
      category: "页面设置",
      item: "页边距",
      status: "FAIL",
      message: "左边距 2.0cm，期望 3.17cm",
      location: null,
      fixable: true,
    },
    {
      category: "正文样式",
      item: "中文字体",
      status: "FAIL",
      message: "字体为 Arial，期望宋体",
      location: "段落 1",
      fixable: true,
    },
    {
      category: "正文样式",
      item: "行距",
      status: "WARN",
      message: "行距为 1.0，期望 1.5",
      location: null,
      fixable: true,
    },
  ],
  summary: {
    pass_count: 1,
    warn: 1,
    fail: 2,
    fixable: 3,
  },
  checked_at: "2026-01-01T00:00:00Z",
};

const allPassReport: CheckReport = {
  ...mockReport,
  items: [
    {
      category: "页面设置",
      item: "纸张大小",
      status: "PASS",
      message: "符合要求",
      location: null,
      fixable: false,
    },
  ],
  summary: { pass_count: 1, warn: 0, fail: 0, fixable: 0 },
};

describe("CheckReportView", () => {
  it("应显示文件名和规则名", () => {
    render(
      <CheckReportView report={mockReport} onFix={vi.fn()} fixLoading={false} />
    );
    expect(screen.getByText(/test.docx/)).toBeInTheDocument();
    expect(screen.getByText(/通用默认检查/)).toBeInTheDocument();
  });

  it("应显示汇总统计数字", () => {
    const { container } = render(
      <CheckReportView report={mockReport} onFix={vi.fn()} fixLoading={false} />
    );
    // 检查汇总卡片区域的统计数字（使用 class 选择器精确匹配）
    const statCards = container.querySelectorAll(".text-2xl.font-bold");
    expect(statCards.length).toBe(4);
    const values = Array.from(statCards).map((el) => el.textContent);
    // 顺序：通过(1)、警告(1)、错误(2)、可修复(3)
    expect(values).toContain("1");
    expect(values).toContain("2");
    expect(values).toContain("3");
  });

  it("应按类别分组展示", () => {
    render(
      <CheckReportView report={mockReport} onFix={vi.fn()} fixLoading={false} />
    );
    expect(screen.getByText(/页面设置/)).toBeInTheDocument();
    expect(screen.getByText(/正文样式/)).toBeInTheDocument();
  });

  it("应显示检查项的消息", () => {
    render(
      <CheckReportView report={mockReport} onFix={vi.fn()} fixLoading={false} />
    );
    expect(screen.getByText(/A4 纸张，符合要求/)).toBeInTheDocument();
    expect(screen.getByText(/字体为 Arial，期望宋体/)).toBeInTheDocument();
  });

  it("有可修复项时修复按钮应包含数量", () => {
    render(
      <CheckReportView report={mockReport} onFix={vi.fn()} fixLoading={false} />
    );
    expect(screen.getByText(/一键修复 \(3 项\)/)).toBeInTheDocument();
  });

  it("全部通过时应显示无需修复", () => {
    render(
      <CheckReportView
        report={allPassReport}
        onFix={vi.fn()}
        fixLoading={false}
      />
    );
    expect(screen.getByText(/全部通过，无需修复/)).toBeInTheDocument();
  });

  it("应显示位置信息", () => {
    render(
      <CheckReportView report={mockReport} onFix={vi.fn()} fixLoading={false} />
    );
    expect(screen.getByText(/段落 1/)).toBeInTheDocument();
  });
});
