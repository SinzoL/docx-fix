/**
 * RuleManager 组件测试
 *
 * 测试内容：
 * - 空状态显示提示
 * - 规则列表正确渲染（名称、来源标签、过期天数）
 * - 展开/折叠 YAML 预览
 * - 删除按钮弹出确认对话框
 * - 重命名对话框
 * - 下载功能
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RuleManager from "../../components/RuleManager";
import type { CustomRule } from "../../types";

// Mock ruleStorage
const mockGetAll = vi.fn<() => CustomRule[]>();
const mockRemove = vi.fn<(id: string) => boolean>();
const mockRename = vi.fn<(id: string, newName: string) => boolean>();
const mockDownloadAsYaml = vi.fn();

vi.mock("../../services/ruleStorage", () => ({
  getAll: (...args: unknown[]) => mockGetAll(...(args as [])),
  remove: (...args: unknown[]) => mockRemove(...(args as [string])),
  rename: (...args: unknown[]) => mockRename(...(args as [string, string])),
  downloadAsYaml: (...args: unknown[]) => mockDownloadAsYaml(...args),
}));

// Mock yamlHighlight
vi.mock("../../utils/yamlHighlight", () => ({
  highlightYaml: (yaml: string) => yaml,
  YAML_HIGHLIGHT_STYLES: "",
}));

// Mock tdesign-react（Dialog、Input、MessagePlugin）
const mockMessageSuccess = vi.fn();
const mockMessageWarning = vi.fn();
const mockMessageError = vi.fn();

vi.mock("tdesign-react", () => ({
  Dialog: ({
    visible,
    header,
    children,
    onClose,
    onConfirm,
  }: {
    visible: boolean;
    header: string;
    children: React.ReactNode;
    onClose: () => void;
    onConfirm: () => void;
    confirmBtn?: unknown;
    cancelBtn?: unknown;
  }) =>
    visible ? (
      <div data-testid={`dialog-${header}`}>
        <div data-testid="dialog-header">{header}</div>
        <div data-testid="dialog-body">{children}</div>
        <button data-testid="dialog-confirm" onClick={onConfirm}>
          确认
        </button>
        <button data-testid="dialog-cancel" onClick={onClose}>
          取消
        </button>
      </div>
    ) : null,
  Input: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    maxlength?: number;
  }) => (
    <input
      data-testid="rename-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
  MessagePlugin: {
    success: (...args: unknown[]) => mockMessageSuccess(...args),
    warning: (...args: unknown[]) => mockMessageWarning(...args),
    error: (...args: unknown[]) => mockMessageError(...args),
  },
}));

// ========================================
// 测试数据
// ========================================

const now = new Date();
const future15Days = new Date(
  now.getTime() + 15 * 24 * 60 * 60 * 1000
).toISOString();
const future3Days = new Date(
  now.getTime() + 3 * 24 * 60 * 60 * 1000
).toISOString();

const mockRuleExtract: CustomRule = {
  id: "rule-001",
  name: "毕业论文模板",
  source: "template-extract",
  yaml_content: "meta:\n  name: 毕业论文模板\nstyles:\n  - name: heading1",
  source_filename: "thesis_template.docx",
  created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  expires_at: future15Days,
};

const mockRuleLLM: CustomRule = {
  id: "rule-002",
  name: "AI 生成规则",
  source: "llm-generate",
  yaml_content: "meta:\n  name: AI 生成规则\nstyles:\n  - name: body",
  created_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  expires_at: future3Days,
};

// ========================================
// 测试用例
// ========================================

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAll.mockReturnValue([]);
  mockRemove.mockReturnValue(true);
  mockRename.mockReturnValue(true);
});

describe("RuleManager", () => {
  describe("空状态", () => {
    it("无规则时应显示空状态提示", async () => {
      mockGetAll.mockReturnValue([]);
      render(<RuleManager />);

      await waitFor(() => {
        expect(screen.getByText("暂无保存的规则")).toBeInTheDocument();
      });
    });

    it("空状态应显示引导文案", async () => {
      mockGetAll.mockReturnValue([]);
      render(<RuleManager />);

      await waitFor(() => {
        expect(
          screen.getByText(/提取模板或使用 AI 生成规则后/)
        ).toBeInTheDocument();
      });
    });
  });

  describe("规则列表渲染", () => {
    it("应渲染规则名称", async () => {
      mockGetAll.mockReturnValue([mockRuleExtract, mockRuleLLM]);
      render(<RuleManager />);

      await waitFor(() => {
        expect(screen.getByText("毕业论文模板")).toBeInTheDocument();
        expect(screen.getByText("AI 生成规则")).toBeInTheDocument();
      });
    });

    it("应渲染来源标签", async () => {
      mockGetAll.mockReturnValue([mockRuleExtract, mockRuleLLM]);
      render(<RuleManager />);

      await waitFor(() => {
        expect(screen.getByText("模板提取")).toBeInTheDocument();
        expect(screen.getByText("AI 生成")).toBeInTheDocument();
      });
    });

    it("应显示规则数量", async () => {
      mockGetAll.mockReturnValue([mockRuleExtract, mockRuleLLM]);
      render(<RuleManager />);

      await waitFor(() => {
        expect(screen.getByText("(2)")).toBeInTheDocument();
      });
    });

    it("应显示来源文件名", async () => {
      mockGetAll.mockReturnValue([mockRuleExtract]);
      render(<RuleManager />);

      await waitFor(() => {
        expect(
          screen.getByText(/thesis_template\.docx/)
        ).toBeInTheDocument();
      });
    });

    it("应显示过期天数", async () => {
      mockGetAll.mockReturnValue([mockRuleExtract]);
      render(<RuleManager />);

      await waitFor(() => {
        // 15天后过期（±1天误差因为计算方式）
        expect(screen.getByText(/1[45]天后过期|16天后过期/)).toBeInTheDocument();
      });
    });

    it("接近过期的规则应有特殊样式（≤7天）", async () => {
      mockGetAll.mockReturnValue([mockRuleLLM]); // 3天后过期
      render(<RuleManager />);

      await waitFor(() => {
        const expiryEl = screen.getByText(/[34]天后过期/);
        expect(expiryEl).toBeInTheDocument();
        // 接近过期应有 text-orange-500 样式
        expect(expiryEl.className).toContain("text-orange-500");
      });
    });
  });

  describe("展开/折叠", () => {
    it("默认不显示 YAML 预览", async () => {
      mockGetAll.mockReturnValue([mockRuleExtract]);
      render(<RuleManager />);

      await waitFor(() => {
        expect(screen.getByText("毕业论文模板")).toBeInTheDocument();
      });

      // YAML 内容不应可见
      expect(screen.queryByText(/heading1/)).not.toBeInTheDocument();
    });

    it("点击规则行应展开 YAML 预览", async () => {
      mockGetAll.mockReturnValue([mockRuleExtract]);
      render(<RuleManager />);

      await waitFor(() => {
        expect(screen.getByText("毕业论文模板")).toBeInTheDocument();
      });

      // 点击规则行展开
      fireEvent.click(screen.getByText("毕业论文模板"));

      await waitFor(() => {
        expect(screen.getByText(/heading1/)).toBeInTheDocument();
      });
    });

    it("再次点击应折叠 YAML 预览", async () => {
      mockGetAll.mockReturnValue([mockRuleExtract]);
      render(<RuleManager />);

      await waitFor(() => {
        expect(screen.getByText("毕业论文模板")).toBeInTheDocument();
      });

      // 展开
      fireEvent.click(screen.getByText("毕业论文模板"));
      await waitFor(() => {
        expect(screen.getByText(/heading1/)).toBeInTheDocument();
      });

      // 折叠
      fireEvent.click(screen.getByText("毕业论文模板"));
      await waitFor(() => {
        expect(screen.queryByText(/heading1/)).not.toBeInTheDocument();
      });
    });
  });

  describe("删除功能", () => {
    it("点击删除按钮应弹出确认对话框", async () => {
      mockGetAll.mockReturnValue([mockRuleExtract]);
      render(<RuleManager />);

      await waitFor(() => {
        expect(screen.getByText("毕业论文模板")).toBeInTheDocument();
      });

      // 点击删除按钮（🗑️）
      const deleteBtn = screen.getByTitle("删除");
      fireEvent.click(deleteBtn);

      // 应弹出确认对话框
      await waitFor(() => {
        expect(screen.getByTestId("dialog-确认删除")).toBeInTheDocument();
        // 对话框内应包含规则名称（通过 dialog-body 内查找避免多元素冲突）
        const dialogBody = screen.getByTestId("dialog-body");
        expect(dialogBody.textContent).toContain("毕业论文模板");
      });
    });

    it("确认删除应调用 remove 并刷新列表", async () => {
      mockGetAll
        .mockReturnValueOnce([mockRuleExtract]) // 初始加载
        .mockReturnValueOnce([mockRuleExtract]) // 点击删除前
        .mockReturnValue([]); // 删除后

      const onRulesChange = vi.fn();
      render(<RuleManager onRulesChange={onRulesChange} />);

      await waitFor(() => {
        expect(screen.getByText("毕业论文模板")).toBeInTheDocument();
      });

      // 点击删除
      fireEvent.click(screen.getByTitle("删除"));

      await waitFor(() => {
        expect(screen.getByTestId("dialog-确认删除")).toBeInTheDocument();
      });

      // 确认删除
      fireEvent.click(screen.getByTestId("dialog-confirm"));

      await waitFor(() => {
        expect(mockRemove).toHaveBeenCalledWith("rule-001");
        expect(mockMessageSuccess).toHaveBeenCalledWith("规则已删除");
        expect(onRulesChange).toHaveBeenCalled();
      });
    });

    it("取消删除不应调用 remove", async () => {
      mockGetAll.mockReturnValue([mockRuleExtract]);
      render(<RuleManager />);

      await waitFor(() => {
        expect(screen.getByText("毕业论文模板")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle("删除"));

      await waitFor(() => {
        expect(screen.getByTestId("dialog-确认删除")).toBeInTheDocument();
      });

      // 取消
      fireEvent.click(screen.getByTestId("dialog-cancel"));

      expect(mockRemove).not.toHaveBeenCalled();
    });
  });

  describe("重命名功能", () => {
    it("点击重命名按钮应弹出对话框", async () => {
      mockGetAll.mockReturnValue([mockRuleExtract]);
      render(<RuleManager />);

      await waitFor(() => {
        expect(screen.getByText("毕业论文模板")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle("重命名"));

      await waitFor(() => {
        expect(screen.getByTestId("dialog-重命名规则")).toBeInTheDocument();
        // 输入框应预填当前名称
        const input = screen.getByTestId("rename-input") as HTMLInputElement;
        expect(input.value).toBe("毕业论文模板");
      });
    });

    it("确认重命名应调用 rename 并刷新", async () => {
      const user = userEvent.setup();
      mockGetAll.mockReturnValue([mockRuleExtract]);
      const onRulesChange = vi.fn();
      render(<RuleManager onRulesChange={onRulesChange} />);

      await waitFor(() => {
        expect(screen.getByText("毕业论文模板")).toBeInTheDocument();
      });

      // 打开重命名对话框
      fireEvent.click(screen.getByTitle("重命名"));

      await waitFor(() => {
        expect(screen.getByTestId("dialog-重命名规则")).toBeInTheDocument();
      });

      // 修改名称
      const input = screen.getByTestId("rename-input");
      await user.clear(input);
      await user.type(input, "新规则名称");

      // 确认
      fireEvent.click(screen.getByTestId("dialog-confirm"));

      await waitFor(() => {
        expect(mockRename).toHaveBeenCalledWith("rule-001", "新规则名称");
        expect(mockMessageSuccess).toHaveBeenCalledWith("重命名成功");
        expect(onRulesChange).toHaveBeenCalled();
      });
    });

    it("空名称应提示警告", async () => {
      const user = userEvent.setup();
      mockGetAll.mockReturnValue([mockRuleExtract]);
      render(<RuleManager />);

      await waitFor(() => {
        expect(screen.getByText("毕业论文模板")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle("重命名"));

      await waitFor(() => {
        expect(screen.getByTestId("dialog-重命名规则")).toBeInTheDocument();
      });

      // 清空名称
      const input = screen.getByTestId("rename-input");
      await user.clear(input);

      // 确认
      fireEvent.click(screen.getByTestId("dialog-confirm"));

      expect(mockRename).not.toHaveBeenCalled();
      expect(mockMessageWarning).toHaveBeenCalledWith("请输入规则名称");
    });
  });

  describe("下载功能", () => {
    it("点击下载按钮应调用 downloadAsYaml", async () => {
      mockGetAll.mockReturnValue([mockRuleExtract]);
      render(<RuleManager />);

      await waitFor(() => {
        expect(screen.getByText("毕业论文模板")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle("下载 YAML"));

      expect(mockDownloadAsYaml).toHaveBeenCalledWith(mockRuleExtract);
      expect(mockMessageSuccess).toHaveBeenCalledWith("已开始下载");
    });
  });

  describe("多 Tab 同步", () => {
    it("应监听 storage 事件并刷新列表", async () => {
      mockGetAll
        .mockReturnValueOnce([]) // 初始加载
        .mockReturnValue([mockRuleExtract]); // storage 事件后

      render(<RuleManager />);

      await waitFor(() => {
        expect(screen.getByText("暂无保存的规则")).toBeInTheDocument();
      });

      // 模拟其他 Tab 修改了 localStorage
      fireEvent(
        window,
        new StorageEvent("storage", {
          key: "docx-fix:custom-rules",
          newValue: JSON.stringify([mockRuleExtract]),
        })
      );

      await waitFor(() => {
        expect(screen.getByText("毕业论文模板")).toBeInTheDocument();
      });
    });

    it("不相关的 storage 事件不应触发刷新", async () => {
      mockGetAll.mockReturnValue([]);
      render(<RuleManager />);

      await waitFor(() => {
        expect(screen.getByText("暂无保存的规则")).toBeInTheDocument();
      });

      const callCountBefore = mockGetAll.mock.calls.length;

      // 模拟不相关键的 storage 事件
      fireEvent(
        window,
        new StorageEvent("storage", {
          key: "some-other-key",
          newValue: "whatever",
        })
      );

      // 调用次数不应增加
      expect(mockGetAll.mock.calls.length).toBe(callCountBefore);
    });
  });
});
