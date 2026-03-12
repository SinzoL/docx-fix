/**
 * 格式化文件大小
 *
 * 根据大小自动选择合适的单位（B / KB / MB / GB），
 * 避免大文件显示为 "51200.0 KB" 的问题。
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/**
 * 格式化时间戳为简洁的中文日期时间
 *
 * 输出格式：MM/DD HH:mm（如 "03/12 14:30"）
 */
export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
