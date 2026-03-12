/**
 * YAML Deep Merge 工具函数
 *
 * 将审核建议的 yaml_snippet 按 section_path 合并到原始 YAML 中。
 */

import yaml from "js-yaml";

/**
 * 将 yaml_snippet 按 section_path 深度合并到原始 YAML 中。
 *
 * @param originalYaml - 原始 YAML 字符串
 * @param sectionPath - 点分隔路径（如 "styles.Normal.paragraph"）
 * @param yamlSnippet - 要合并的 YAML 片段
 * @returns 合并后的 YAML 字符串
 * @throws Error 如果路径上存在类型冲突（如尝试在字符串上设置子属性）
 */
export function mergeYamlPatch(
  originalYaml: string,
  sectionPath: string,
  yamlSnippet: string,
): string {
  // 解析原始 YAML
  let root = yaml.load(originalYaml) as Record<string, unknown>;
  if (!root || typeof root !== "object") {
    root = {};
  }

  // 解析补丁
  const patch = yaml.load(yamlSnippet);

  // 按路径导航到目标位置
  const keys = sectionPath.split(".");
  let current: Record<string, unknown> = root;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const existing = current[key];

    if (existing === undefined || existing === null) {
      // 路径不存在，自动创建
      const newObj: Record<string, unknown> = {};
      current[key] = newObj;
      current = newObj;
    } else if (typeof existing === "object" && !Array.isArray(existing)) {
      current = existing as Record<string, unknown>;
    } else {
      throw new Error(
        `路径冲突：${keys.slice(0, i + 1).join(".")} 处的值不是对象，无法设置子属性`,
      );
    }
  }

  // 最后一段路径：执行 deep merge
  const lastKey = keys[keys.length - 1];
  const existingValue = current[lastKey];

  if (
    patch !== null &&
    typeof patch === "object" &&
    !Array.isArray(patch) &&
    existingValue !== null &&
    typeof existingValue === "object" &&
    !Array.isArray(existingValue)
  ) {
    // 两者都是对象，执行 deep merge
    current[lastKey] = deepMerge(
      existingValue as Record<string, unknown>,
      patch as Record<string, unknown>,
    );
  } else {
    // 直接覆盖（包括：原值为 undefined、patch 是基本类型、数组覆盖等）
    current[lastKey] = patch;
  }

  // 重新序列化
  return yaml.dump(root, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
}

/**
 * 将多条审核建议的补丁依次合并到原始 YAML 中。
 *
 * @param originalYaml - 原始 YAML 字符串
 * @param patches - 补丁数组，每项包含 sectionPath 和 yamlSnippet
 * @returns 合并后的 YAML 字符串；如果某条补丁失败则跳过该条
 */
export function mergeMultiplePatches(
  originalYaml: string,
  patches: Array<{ sectionPath: string; yamlSnippet: string }>,
): { yaml: string; failedPaths: string[] } {
  let currentYaml = originalYaml;
  const failedPaths: string[] = [];

  for (const { sectionPath, yamlSnippet } of patches) {
    if (!yamlSnippet || !yamlSnippet.trim()) continue;

    try {
      currentYaml = mergeYamlPatch(currentYaml, sectionPath, yamlSnippet);
    } catch {
      failedPaths.push(sectionPath);
    }
  }

  return { yaml: currentYaml, failedPaths };
}

/**
 * 递归深度合并两个对象
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = result[key];

    if (
      srcVal !== null &&
      typeof srcVal === "object" &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === "object" &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(
        tgtVal as Record<string, unknown>,
        srcVal as Record<string, unknown>,
      );
    } else {
      result[key] = srcVal;
    }
  }

  return result;
}
