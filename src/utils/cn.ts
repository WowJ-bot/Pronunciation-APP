/** 轻量 className 合并工具，避免为一个小功能引入额外依赖 */
export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}
