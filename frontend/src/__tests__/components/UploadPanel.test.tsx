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
      },
      {
        id: "thesis",
        filename: "thesis.yaml",
        name: "毕业论文模板",
        description: "论文格式检查",
        is_default: false,
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
      screen.getByText(/拖拽文件到此处，或点击选择/)
    ).toBeInTheDocument();
  });

  it("应渲染检查模板选择器", () => {
    render(<UploadPanel {...defaultProps} />);
    expect(screen.getByText("检查模板")).toBeInTheDocument();
  });

  it("应渲染开始检查按钮", () => {
    render(<UploadPanel {...defaultProps} />);
    expect(screen.getByText("开始检查")).toBeInTheDocument();
  });

  it("应显示文件格式提示", () => {
    render(<UploadPanel {...defaultProps} />);
    expect(
      screen.getByText(/仅支持 .docx 格式，最大 50MB/)
    ).toBeInTheDocument();
  });
});
