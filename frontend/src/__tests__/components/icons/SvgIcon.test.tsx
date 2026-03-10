/**
 * SvgIcon 组件测试
 *
 * 测试内容：
 * - 已知图标名正确渲染 SVG 元素
 * - 未知图标名返回 null
 * - size 属性传递
 * - className 属性传递
 * - 多 path 图标渲染
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SvgIcon } from "../../../components/icons/SvgIcon";

describe("SvgIcon", () => {
  it("已知图标名应正确渲染 SVG 元素", () => {
    const { container } = render(<SvgIcon name="check" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
  });

  it("未知图标名应返回 null（不渲染）", () => {
    const { container } = render(<SvgIcon name="nonexistent-icon" />);
    expect(container.innerHTML).toBe("");
  });

  it("应正确传递 size 属性", () => {
    const { container } = render(<SvgIcon name="check" size={32} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("32");
    expect(svg?.getAttribute("height")).toBe("32");
  });

  it("默认 size 应为 20", () => {
    const { container } = render(<SvgIcon name="check" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("20");
    expect(svg?.getAttribute("height")).toBe("20");
  });

  it("应正确传递 className 属性", () => {
    const { container } = render(
      <SvgIcon name="check" className="text-green-600" />
    );
    const svg = container.querySelector("svg");
    expect(svg?.classList.contains("text-green-600")).toBe(true);
  });

  it("单 path 图标应渲染一个 path 元素", () => {
    const { container } = render(<SvgIcon name="check" />);
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBe(1);
  });

  it("多 path 图标应渲染多个 path 元素", () => {
    // document 图标有 5 个 path
    const { container } = render(<SvgIcon name="document" />);
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThan(1);
  });

  it("SVG 应使用 stroke-based 线条风格", () => {
    const { container } = render(<SvgIcon name="search" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("fill")).toBe("none");
    expect(svg?.getAttribute("stroke-linecap")).toBe("round");
    expect(svg?.getAttribute("stroke-linejoin")).toBe("round");
  });
});
