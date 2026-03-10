/**
 * YAML 语法高亮工具（零依赖手动正则方案）
 *
 * 将 YAML 文本按行解析，对不同语法元素分别着色，返回 HTML 字符串。
 * 符合 Constitution VI"简洁优先"原则——不引入 Monaco/CodeMirror 等重量级编辑器。
 */

/**
 * 转义 HTML 特殊字符，防止 XSS
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * 对单行 YAML 进行语法高亮，返回带 <span> 标签的 HTML
 */
function highlightLine(line: string): string {
  const escaped = escapeHtml(line);

  // 纯注释行（# 开头，可有前导空格）
  if (/^\s*#/.test(line)) {
    return `<span class="yaml-comment">${escaped}</span>`;
  }

  // 空行
  if (/^\s*$/.test(line)) {
    return escaped;
  }

  // 带键值对的行：key: value
  const kvMatch = line.match(/^(\s*)([\w\-.]+)(\s*:\s*)(.*)/);
  if (kvMatch) {
    const [, indent, key, colon, value] = kvMatch;
    const escapedIndent = escapeHtml(indent);
    const escapedKey = escapeHtml(key);
    const escapedColon = escapeHtml(colon);
    const highlightedValue = highlightValue(value);
    return `${escapedIndent}<span class="yaml-key">${escapedKey}</span><span class="yaml-colon">${escapedColon}</span>${highlightedValue}`;
  }

  // 列表项：- value
  const listMatch = line.match(/^(\s*-\s+)(.*)/);
  if (listMatch) {
    const [, prefix, value] = listMatch;
    const escapedPrefix = escapeHtml(prefix);
    const highlightedValue = highlightValue(value);
    return `<span class="yaml-list">${escapedPrefix}</span>${highlightedValue}`;
  }

  return escaped;
}

/**
 * 对 YAML 值部分进行高亮
 */
function highlightValue(value: string): string {
  // 值后面可能有行内注释
  const commentIdx = findInlineComment(value);
  let mainPart = value;
  let commentPart = "";

  if (commentIdx >= 0) {
    mainPart = value.substring(0, commentIdx);
    commentPart = value.substring(commentIdx);
  }

  const escapedMain = escapeHtml(mainPart);
  const escapedComment = commentPart
    ? `<span class="yaml-comment">${escapeHtml(commentPart)}</span>`
    : "";

  const mainTrimmed = mainPart.trim();

  // 布尔值
  if (/^(true|false|yes|no|on|off)$/i.test(mainTrimmed)) {
    return `<span class="yaml-bool">${escapedMain}</span>${escapedComment}`;
  }

  // null
  if (/^(null|~)$/i.test(mainTrimmed)) {
    return `<span class="yaml-null">${escapedMain}</span>${escapedComment}`;
  }

  // 数字（整数、浮点数）
  if (/^-?\d+(\.\d+)?$/.test(mainTrimmed)) {
    return `<span class="yaml-number">${escapedMain}</span>${escapedComment}`;
  }

  // 带引号的字符串
  if (
    (mainTrimmed.startsWith('"') && mainTrimmed.endsWith('"')) ||
    (mainTrimmed.startsWith("'") && mainTrimmed.endsWith("'"))
  ) {
    return `<span class="yaml-string">${escapedMain}</span>${escapedComment}`;
  }

  // 普通字符串值
  if (mainTrimmed.length > 0) {
    return `<span class="yaml-value">${escapedMain}</span>${escapedComment}`;
  }

  return `${escapedMain}${escapedComment}`;
}

/**
 * 查找行内注释的起始位置（排除引号内的 #）
 * 返回 -1 表示没有行内注释
 */
function findInlineComment(value: string): number {
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
    if (ch === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
    if (ch === "#" && !inSingleQuote && !inDoubleQuote && i > 0 && value[i - 1] === " ") {
      return i;
    }
  }
  return -1;
}

/**
 * 将完整 YAML 文本转为带语法高亮的 HTML 字符串
 *
 * @param yaml - 原始 YAML 文本
 * @returns 带 <span> 标签的 HTML，可直接设置到 innerHTML
 */
export function highlightYaml(yaml: string): string {
  const lines = yaml.split("\n");
  return lines.map(highlightLine).join("\n");
}

/** YAML 分节（由 # ==== 注释分隔） */
export interface YamlSection {
  /** 分节标题（从注释中提取） */
  title: string;
  /** 该节的 YAML 内容 */
  content: string;
}

/**
 * 将 YAML 文本按 # ==== 分隔注释拆分为多个节
 *
 * rule_extractor.py 生成的 YAML 中使用 `# ====...` 作为分节标记，
 * 紧随其后的 `# 节标题` 注释行作为节标题。
 *
 * @param yaml - 原始 YAML 文本
 * @returns 分节数组
 */
export function parseYamlSections(yaml: string): YamlSection[] {
  const lines = yaml.split("\n");
  const sections: YamlSection[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];
  let headerLines: string[] = [];
  let inHeader = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isSeparator = /^#\s*={10,}/.test(line.trim());

    if (isSeparator) {
      // 当前是分隔线——检查下一行是否是标题
      if (inHeader) {
        // 文件头部的分隔线
        headerLines.push(line);
        continue;
      }

      // 保存之前的节
      if (currentLines.length > 0 || currentTitle) {
        sections.push({
          title: currentTitle,
          content: currentLines.join("\n").trim(),
        });
      }

      // 查找标题：分隔线之后的 # 注释行（非分隔线）
      currentTitle = "";
      currentLines = [];

      // 跳过连续的分隔线和标题注释
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine.startsWith("#") && !/^#\s*={10,}/.test(nextLine)) {
          currentTitle = nextLine.replace(/^#\s*/, "").trim();
          i++; // 跳过标题行
          // 跳过标题后的分隔线
          if (i + 1 < lines.length && /^#\s*={10,}/.test(lines[i + 1].trim())) {
            i++;
          }
        }
      }
    } else {
      if (inHeader) {
        // 检查是否还在文件头部
        if (line.trim().startsWith("#") && !line.trim().match(/^[a-zA-Z]/)) {
          headerLines.push(line);
          continue;
        }
        // 空行也算头部
        if (line.trim() === "" && headerLines.length > 0) {
          headerLines.push(line);
          continue;
        }
        // 遇到非注释/非空行，头部结束
        inHeader = false;

        // 如果有头部内容，先保存为一个"概述"节
        if (headerLines.length > 0) {
          const titleLine = headerLines.find(
            (l) => l.trim().startsWith("#") && !/^#\s*={10,}/.test(l.trim()) && l.trim() !== "#"
          );
          sections.push({
            title: titleLine ? titleLine.replace(/^#\s*/, "").trim() : "概述",
            content: headerLines.join("\n").trim(),
          });
          headerLines = [];
        }
      }
      currentLines.push(line);
    }
  }

  // 保存最后一节
  if (currentLines.length > 0 || currentTitle) {
    sections.push({
      title: currentTitle || "其他",
      content: currentLines.join("\n").trim(),
    });
  }

  // 如果整体没有分节（简单 YAML），返回单节
  if (sections.length === 0) {
    return [{ title: "规则内容", content: yaml.trim() }];
  }

  return sections;
}

/**
 * YAML 高亮所需的 CSS 样式（内联到组件中或作为全局样式）
 *
 * 使用时将此字符串插入到 <style> 标签中即可。
 */
export const YAML_HIGHLIGHT_STYLES = `
  .yaml-comment { color: #6b7280; font-style: italic; }
  .yaml-key { color: #2563eb; font-weight: 600; }
  .yaml-colon { color: #6b7280; }
  .yaml-string { color: #059669; }
  .yaml-value { color: #0f172a; }
  .yaml-number { color: #d97706; }
  .yaml-bool { color: #9333ea; font-weight: 600; }
  .yaml-null { color: #9333ea; font-style: italic; }
  .yaml-list { color: #6b7280; }
`;
