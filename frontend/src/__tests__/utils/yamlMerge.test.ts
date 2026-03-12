/**
 * YAML Deep Merge 工具函数测试
 *
 * 测试路径创建、覆盖、深层合并、类型冲突错误、无效 YAML 处理
 */

import { describe, it, expect } from "vitest";
import { mergeYamlPatch, mergeMultiplePatches } from "../../utils/yamlMerge";

describe("mergeYamlPatch", () => {
  it("应该在已有路径上合并属性", () => {
    const original = `styles:
  Normal:
    paragraph:
      alignment: both
`;
    const result = mergeYamlPatch(original, "styles.Normal.paragraph", "line_spacing: 300");
    expect(result).toContain("alignment: both");
    expect(result).toContain("line_spacing: 300");
  });

  it("应该在路径不存在时自动创建", () => {
    const original = `styles:
  Normal:
    paragraph:
      alignment: both
`;
    const result = mergeYamlPatch(original, "styles.Normal.character", "font_size_pt: 12");
    expect(result).toContain("font_size_pt: 12");
    expect(result).toContain("alignment: both");
  });

  it("应该覆盖已有的基本类型值", () => {
    const original = `styles:
  Normal:
    paragraph:
      line_spacing: 240
`;
    const result = mergeYamlPatch(original, "styles.Normal.paragraph", "line_spacing: 300");
    expect(result).toContain("line_spacing: 300");
    expect(result).not.toContain("line_spacing: 240");
  });

  it("应该深度合并嵌套对象", () => {
    const original = `styles:
  Normal:
    paragraph:
      alignment: both
      line_spacing: 240
`;
    const result = mergeYamlPatch(
      original,
      "styles.Normal.paragraph",
      "line_spacing: 300\nline_spacing_rule: auto",
    );
    expect(result).toContain("alignment: both");
    expect(result).toContain("line_spacing: 300");
    expect(result).toContain("line_spacing_rule: auto");
  });

  it("路径冲突时应该抛出错误", () => {
    const original = `styles:
  Normal: simple_value
`;
    expect(() => {
      mergeYamlPatch(original, "styles.Normal.paragraph", "line_spacing: 300");
    }).toThrow();
  });

  it("应该处理空原始 YAML", () => {
    const result = mergeYamlPatch("", "styles.Normal.paragraph", "line_spacing: 300");
    expect(result).toContain("line_spacing: 300");
  });

  it("应该处理单层路径", () => {
    const original = `meta:
  name: test
`;
    const result = mergeYamlPatch(original, "page_setup", "paper_size: A4");
    expect(result).toContain("paper_size: A4");
  });
});

describe("mergeMultiplePatches", () => {
  it("应该依次合并多条补丁", () => {
    const original = `styles:
  Normal:
    paragraph:
      alignment: both
`;
    const { yaml, failedPaths } = mergeMultiplePatches(original, [
      { sectionPath: "styles.Normal.paragraph", yamlSnippet: "line_spacing: 300" },
      { sectionPath: "styles.Normal.character", yamlSnippet: "font_size_pt: 12" },
    ]);

    expect(yaml).toContain("line_spacing: 300");
    expect(yaml).toContain("font_size_pt: 12");
    expect(failedPaths).toHaveLength(0);
  });

  it("应该跳过空的 yamlSnippet", () => {
    const original = `meta:
  name: test
`;
    const { yaml, failedPaths } = mergeMultiplePatches(original, [
      { sectionPath: "styles.Normal", yamlSnippet: "" },
    ]);

    expect(yaml).toBe(original);
    expect(failedPaths).toHaveLength(0);
  });

  it("应该记录失败的路径", () => {
    const original = `styles:
  Normal: simple_value
`;
    const { failedPaths } = mergeMultiplePatches(original, [
      { sectionPath: "styles.Normal.paragraph", yamlSnippet: "line_spacing: 300" },
    ]);

    expect(failedPaths).toContain("styles.Normal.paragraph");
  });
});
