/**
 * ExtractReviewPanel 组件测试
 *
 * 测试渲染、加载状态、空结果、接受/忽略交互、全部忽略按钮
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ExtractReviewPanel from "../../components/ExtractReviewPanel";
import type { ExtractReviewItem } from "../../types";

const mockItems: ExtractReviewItem[] = [
  {
    id: "rev-001",
    category: "heading_error",
    severity: "error",
    description: "标题级别不匹配",
    section_path: "structure.heading_style_mapping",
    yaml_snippet: "level_1: Heading 3",
    source_text: "",
  },
  {
    id: "rev-002",
    category: "hidden_rule",
    severity: "warning",
    description: "红色字体包含格式要求",
    section_path: "styles.Normal.paragraph",
    yaml_snippet: "line_spacing: 300",
    source_text: "正文小四号宋体",
  },
];

describe("ExtractReviewPanel", () => {
  it("应该展示加载状态", () => {
    render(
      <ExtractReviewPanel
        reviewItems={[]}
        loading={true}
        error={null}
        acceptedIds={new Set()}
        onAccept={vi.fn()}
        onIgnore={vi.fn()}
        onIgnoreAll={vi.fn()}
      />,
    );

    expect(screen.getByText(/AI 正在审核提取结果/)).toBeTruthy();
  });

  it("错误时不展示面板", () => {
    const { container } = render(
      <ExtractReviewPanel
        reviewItems={[]}
        loading={false}
        error="审核失败"
        acceptedIds={new Set()}
        onAccept={vi.fn()}
        onIgnore={vi.fn()}
        onIgnoreAll={vi.fn()}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("空结果时展示通过提示", () => {
    render(
      <ExtractReviewPanel
        reviewItems={[]}
        loading={false}
        error={null}
        acceptedIds={new Set()}
        onAccept={vi.fn()}
        onIgnore={vi.fn()}
        onIgnoreAll={vi.fn()}
      />,
    );

    expect(screen.getByText(/审核通过，未发现问题/)).toBeTruthy();
  });

  it("应该渲染建议列表", () => {
    render(
      <ExtractReviewPanel
        reviewItems={mockItems}
        loading={false}
        error={null}
        acceptedIds={new Set()}
        onAccept={vi.fn()}
        onIgnore={vi.fn()}
        onIgnoreAll={vi.fn()}
      />,
    );

    expect(screen.getByText("标题级别不匹配")).toBeTruthy();
    expect(screen.getByText("红色字体包含格式要求")).toBeTruthy();
    expect(screen.getByText("rev-001")).toBeTruthy();
    expect(screen.getByText("rev-002")).toBeTruthy();
  });

  it("应该展示源文本（hidden_rule 类别）", () => {
    render(
      <ExtractReviewPanel
        reviewItems={mockItems}
        loading={false}
        error={null}
        acceptedIds={new Set()}
        onAccept={vi.fn()}
        onIgnore={vi.fn()}
        onIgnoreAll={vi.fn()}
      />,
    );

    expect(screen.getByText("正文小四号宋体")).toBeTruthy();
  });

  it("点击接受按钮应触发 onAccept", () => {
    const onAccept = vi.fn();
    render(
      <ExtractReviewPanel
        reviewItems={mockItems}
        loading={false}
        error={null}
        acceptedIds={new Set()}
        onAccept={onAccept}
        onIgnore={vi.fn()}
        onIgnoreAll={vi.fn()}
      />,
    );

    const buttons = screen.getAllByText("接受修改");
    fireEvent.click(buttons[0]);
    expect(onAccept).toHaveBeenCalledWith("rev-001");
  });

  it("已接受状态应显示撤销按钮", () => {
    const onIgnore = vi.fn();
    render(
      <ExtractReviewPanel
        reviewItems={mockItems}
        loading={false}
        error={null}
        acceptedIds={new Set(["rev-001"])}
        onAccept={vi.fn()}
        onIgnore={onIgnore}
        onIgnoreAll={vi.fn()}
      />,
    );

    const undoButton = screen.getByText(/已接受 · 点击撤销/);
    expect(undoButton).toBeTruthy();

    fireEvent.click(undoButton);
    expect(onIgnore).toHaveBeenCalledWith("rev-001");
  });

  it("有已接受项时应显示全部忽略按钮", () => {
    const onIgnoreAll = vi.fn();
    render(
      <ExtractReviewPanel
        reviewItems={mockItems}
        loading={false}
        error={null}
        acceptedIds={new Set(["rev-001"])}
        onAccept={vi.fn()}
        onIgnore={vi.fn()}
        onIgnoreAll={onIgnoreAll}
      />,
    );

    const ignoreAllBtn = screen.getByText("全部忽略");
    expect(ignoreAllBtn).toBeTruthy();

    fireEvent.click(ignoreAllBtn);
    expect(onIgnoreAll).toHaveBeenCalled();
  });

  it("失败的建议应显示无法应用提示", () => {
    render(
      <ExtractReviewPanel
        reviewItems={mockItems}
        loading={false}
        error={null}
        acceptedIds={new Set()}
        failedIds={new Set(["rev-001"])}
        onAccept={vi.fn()}
        onIgnore={vi.fn()}
        onIgnoreAll={vi.fn()}
      />,
    );

    expect(screen.getByText(/此建议无法应用/)).toBeTruthy();
  });
});
