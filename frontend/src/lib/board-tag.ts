// Sign tags: the short label every board wears, like a building sign on campus. The tags
// themselves come from the API (pulse/services/tags.py), which keeps them unique.

export type TagState = "scanned" | "top" | "idle" | "empty" | "retired"

/** Short counts for tags: 1,284 → 1.3k. */
export function tagCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n)
}

const STATE_LABEL: Record<TagState, string> = {
  scanned: "scanned",
  top: "busiest board",
  idle: "flyers up, no scans yet",
  empty: "no flyers",
  retired: "retired",
}

export const tagStateLabel = (state: TagState) => STATE_LABEL[state]

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

/** The tag as an HTML string, for Leaflet icons and popups (same classes as <BoardTag>). */
export function tagHtml(
  code: string,
  count: string | number | null,
  state: TagState,
  opts: { pin?: boolean; selected?: boolean; more?: number } = {},
): string {
  const classes = opts.pin ? "cp-tag cp-pin" : "cp-tag"
  const countPart = count === null || count === "" ? "" : `<span>${escape(String(count))}</span>`
  const morePart = opts.more ? `<i>+${opts.more}</i>` : ""
  return `<div class="${classes}" data-state="${state}" data-selected="${opts.selected ? "true" : "false"}"><b>${escape(code)}</b>${countPart}${morePart}</div>`
}
