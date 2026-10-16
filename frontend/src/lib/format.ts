const numberFormat = new Intl.NumberFormat()

export const formatNumber = (value: number) => numberFormat.format(value)

/** "Mar 4, 2026" from an ISO datetime. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

/** "Mar 4, 2026, 10:30 AM" from an ISO datetime. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
}

/** "Mar 4" from a calendar date (YYYY-MM-DD), without shifting it through a time zone. */
export function formatDay(day: string | null, withYear = false): string {
  if (!day) return "…"
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) })
}

/** "9a", "12p" for an hour of day. */
export const formatHour = (hour: number) => `${hour % 12 || 12}${hour < 12 ? "a" : "p"}`

/** The value for a datetime-local input: local time, minute precision. */
export function localDateTimeInput(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const plural = (count: number, word: string) => `${formatNumber(count)} ${word}${count === 1 ? "" : "s"}`

/** Rates (scans per day) always with one decimal, so a column of them lines up: 3 → 3.0. */
export const formatRate = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
