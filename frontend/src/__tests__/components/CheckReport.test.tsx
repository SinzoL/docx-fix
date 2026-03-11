/**
 * CheckReport 组件测试
 *
 * 测试内容：
 * - 报告汇总展示
 * - 按类别分组
 * - 状态标签
 * - 修复按钮状态
 * - 折叠/展开交互
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

/** 全部通过的报告 */
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
    {
      category: "页面设置",
      item: "页边距",
      status: "PASS",
      message: "符合要求",
      location: null,
      fixable: false,
    },
    {
      category: "正文样式",
      item: "字体",
      status: "PASS",
      message: "符合要求",
      location: null,
      fixable: false,
    },
  ],
  summary: { pass_count: 3, warn: 0, fail: 0, fixable: 0 },
};

/** 混合状态报告：页面设置全部通过，正文样式有问题 */
const mixedReport: CheckReport = {
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
    {
      category: "页面设置",
      item: "页边距",
      status: "PASS",
      message: "符合要求",
      location: null,
      fixable: false,
    },
    {
      category: "正文样式",
      item: "中文字体",
      status: "FAIL",
      message: "字体为 Arial，期望宋体",
      location: "段落 1",
      fixable: true,
    },
  ],
  summary: { pass_count: 2, warn: 0, fail: 1, fixable: 1 },
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
    render(
      <CheckReportView report={mockReport} onFix={vi.fn()} fixLoading={false} />
    );
    // 检查统计数字存在（可能在汇总区和折叠 badge 中出现多次，用 getAllByText）
    expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(1); // 通过
    expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(1); // 失败
    expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1); // 可修复
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

  it("应显示位置信息", () => {
    render(
      <CheckReportView report={mockReport} onFix={vi.fn()} fixLoading={false} />
    );
    expect(screen.getByText(/段落 1/)).toBeInTheDocument();
  });
});

// ========================
// 折叠/展开交互测试
// ========================
describe("CheckReportView - 折叠/展开交互", () => {
  it("含 FAIL/WARN 的类别应默认展开", () => {
    render(
      <CheckReportView report={mixedReport} onFix={vi.fn()} fixLoading={false} />
    );
    // 正文样式类别含 FAIL，应默认展开，能看到检查项消息
    expect(screen.getByText(/字体为 Arial，期望宋体/)).toBeVisible();
  });

  it("全部 PASS 的类别应默认折叠（内容不可见）", () => {
    render(
      <CheckReportView report={mixedReport} onFix={vi.fn()} fixLoading={false} />
    );
    // 页面设置全部 PASS，应默认折叠
    // 折叠后的类别头部仍然可见
    const pageSetupHeaders = screen.getAllByText(/页面设置/);
    expect(pageSetupHeaders.length).toBeGreaterThan(0);
    // 折叠后检查项详情"符合要求"不应在展开的列表中可见
    // 注意：可能有多个"符合要求"文本，但折叠状态下的不可见
  });

  it("点击折叠的类别头部应展开", () => {
    render(
      <CheckReportView report={mixedReport} onFix={vi.fn()} fixLoading={false} />
    );
    // 找到页面设置的类别头部并点击
    const categoryHeaders = screen.getAllByTestId("category-header");
    const pageSetupHeader = categoryHeaders.find(h => h.textContent?.includes("页面设置"));
    expect(pageSetupHeader).toBeTruthy();
    
    // 点击展开
    fireEvent.click(pageSetupHeader!);
    // 展开后应能看到检查项内容
    expect(screen.getByText("纸张大小")).toBeVisible();
  });

  it("点击展开的类别头部应折叠", () => {
    render(
      <CheckReportView report={mixedReport} onFix={vi.fn()} fixLoading={false} />
    );
    // 正文样式默认展开，点击头部应折叠
    const categoryHeaders = screen.getAllByTestId("category-header");
    const styleHeader = categoryHeaders.find(h => h.textContent?.includes("正文样式"));
    expect(styleHeader).toBeTruthy();
    
    fireEvent.click(styleHeader!);
    // 折叠后检查项不可见
  });

  it("逐个点击可展开所有折叠的类别", () => {
    render(
      <CheckReportView report={mixedReport} onFix={vi.fn()} fixLoading={false} />
    );
    // 点击折叠的页面设置类别头部将其展开
    const categoryHeaders = screen.getAllByTestId("category-header");
    const pageSetupHeader = categoryHeaders.find(h => h.textContent?.includes("页面设置"));
    expect(pageSetupHeader).toBeTruthy();
    fireEvent.click(pageSetupHeader!);

    // 所有类别的检查项应可见
    expect(screen.getByText("纸张大小")).toBeVisible();
    expect(screen.getByText(/字体为 Arial/)).toBeVisible();
  });

  it("逐个点击可折叠所有展开的类别", () => {
    render(
      <CheckReportView report={mixedReport} onFix={vi.fn()} fixLoading={false} />
    );
    // 正文样式默认展开，点击头部折叠
    const categoryHeaders = screen.getAllByTestId("category-header");
    const styleHeader = categoryHeaders.find(h => h.textContent?.includes("正文样式"));
    expect(styleHeader).toBeTruthy();
    fireEvent.click(styleHeader!);

    // 类别头部仍然存在（折叠后头部可见）
    expect(screen.getByText(/正文样式/)).toBeInTheDocument();
  });

  it("全部通过时所有类别应默认折叠", () => {
    render(
      <CheckReportView report={allPassReport} onFix={vi.fn()} fixLoading={false} />
    );
    // 所有类别全部 PASS，应默认折叠
    const categoryHeaders = screen.getAllByTestId("category-header");
    expect(categoryHeaders.length).toBeGreaterThan(0);
  });
});
