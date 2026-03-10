/**
 * RuleDetail 组件测试
 *
 * 测试内容：
 * - 加载状态
 * - 规则详情展示
 * - 错误状态
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import RuleDetail from "../../components/RuleDetail";

// Mock API
const mockFetchRuleDetail = vi.fn();
vi.mock("../../services/api", () => ({
  fetchRuleDetail: (...args: unknown[]) => mockFetchRuleDetail(...args),
}));

beforeEach(() => {
  mockFetchRuleDetail.mockReset();
});

describe("RuleDetail", () => {
  it("应调用 API 获取规则详情", async () => {
    mockFetchRuleDetail.mockResolvedValue({
      id: "default",
      name: "通用默认检查",
      description: "基础格式检查",
      sections: [
        {
          name: "页面设置",
          rules: [{ item: "纸张大小", value: "A4 (21.0 × 29.7 cm)" }],
        },
      ],
    });

    render(<RuleDetail ruleId="default" />);

    await waitFor(() => {
      expect(mockFetchRuleDetail).toHaveBeenCalledWith("default");
    });
  });

  it("应显示规则名称", async () => {
    mockFetchRuleDetail.mockResolvedValue({
      id: "default",
      name: "通用默认检查",
      description: "基础格式检查",
      sections: [],
    });

    render(<RuleDetail ruleId="default" />);

    await waitFor(() => {
      expect(screen.getByText("通用默认检查")).toBeInTheDocument();
    });
  });

  it("应显示规则描述", async () => {
    mockFetchRuleDetail.mockResolvedValue({
      id: "default",
      name: "通用默认检查",
      description: "基础格式检查",
      sections: [],
    });

    render(<RuleDetail ruleId="default" />);

    await waitFor(() => {
      expect(screen.getByText("基础格式检查")).toBeInTheDocument();
    });
  });

  it("应显示 section 和规则项", async () => {
    mockFetchRuleDetail.mockResolvedValue({
      id: "default",
      name: "通用默认检查",
      description: "",
      sections: [
        {
          name: "页面设置",
          rules: [
            { item: "纸张大小", value: "A4" },
            { item: "上边距", value: "2.54 cm" },
          ],
        },
      ],
    });

    render(<RuleDetail ruleId="default" />);

    await waitFor(() => {
      expect(screen.getByText("页面设置")).toBeInTheDocument();
      expect(screen.getByText("纸张大小")).toBeInTheDocument();
      expect(screen.getByText("A4")).toBeInTheDocument();
    });
  });

  it("API 失败应显示错误信息", async () => {
    mockFetchRuleDetail.mockRejectedValue(new Error("网络错误"));

    render(<RuleDetail ruleId="default" />);

    await waitFor(() => {
      expect(screen.getByText("加载失败")).toBeInTheDocument();
    });
  });

  it("无 sections 时应显示提示", async () => {
    mockFetchRuleDetail.mockResolvedValue({
      id: "default",
      name: "通用默认检查",
      description: "",
      sections: [],
    });

    render(<RuleDetail ruleId="default" />);

    await waitFor(() => {
      expect(screen.getByText("暂无详细规则信息")).toBeInTheDocument();
    });
  });
});
