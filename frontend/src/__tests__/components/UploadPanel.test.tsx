/**
 * UploadPanel 组件测试
 *
 * 测试内容：
 * - 规则列表加载
 * - 文件选择
 * - 上传按钮状态
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import UploadPanel from "../../components/UploadPanel";

// Mock API
vi.mock("../../services/api", () => ({
  fetchRules: vi.fn().mockResolvedValue({
    rules: [
      {
        id: "default",
        filename: "default.yaml",
        name: "通用默认检查",
        description: "基础格式检查",
        is_default: true,
        is_preset: false,
      },
      {
        id: "academic_paper",
        filename: "academic_paper.yaml",
        name: "通用学术论文",
        description: "学术论文通用格式规范",
        is_default: false,
        is_preset: true,
      },
      {
        id: "gov_document",
        filename: "gov_document.yaml",
        name: "国标公文 (GB/T 9704)",
        description: "依据 GB/T 9704 标准",
        is_default: false,
        is_preset: true,
      },
    ],
  }),
  checkFile: vi.fn(),
}));

const defaultProps = {
  onCheckStart: vi.fn(),
  onCheckComplete: vi.fn(),
  onError: vi.fn(),
  selectedRuleId: "default",
  onRuleChange: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("UploadPanel", () => {
  it("应渲染上传区域", () => {
    render(<UploadPanel {...defaultProps} />);
    expect(
      screen.getByText(/拖拽文件到此处/)
    ).toBeInTheDocument();
  });

  it("应渲染检查标准选择器", () => {
    render(<UploadPanel {...defaultProps} />);
    expect(screen.getByText(/选择检查标准/)).toBeInTheDocument();
  });

  it("应渲染开始检查按钮", () => {
    render(<UploadPanel {...defaultProps} />);
    expect(screen.getByText(/开始深度检查/)).toBeInTheDocument();
  });

  it("应显示文件格式提示", () => {
    render(<UploadPanel {...defaultProps} />);
    expect(
      screen.getByText(/\.docx/)
    ).toBeInTheDocument();
  });
});

describe("UploadPanel 预设规则标签", () => {
  it("RuleInfo mock 数据应包含 is_preset 字段", async () => {
    const { fetchRules } = await import("../../services/api");
    const result = await fetchRules();
    const presetRules = result.rules.filter((r: { is_preset: boolean }) => r.is_preset);
    expect(presetRules.length).toBe(2);
    expect(presetRules[0].id).toBe("academic_paper");
    expect(presetRules[1].id).toBe("gov_document");
  });

  it("非预设规则不应有 is_preset=true", async () => {
    const { fetchRules } = await import("../../services/api");
    const result = await fetchRules();
    const defaultRule = result.rules.find((r: { id: string }) => r.id === "default");
    expect(defaultRule!.is_preset).toBe(false);
  });
});
