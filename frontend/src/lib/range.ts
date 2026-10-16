import { useSearchParams } from "react-router"

export type RangeKey = "7d" | "30d" | "all" | "custom"

export const RANGE_CHOICES: { value: RangeKey; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" },
]

export type DateRange = { range: RangeKey; start: string; end: string }

export const rangeLabel = (key: RangeKey) => RANGE_CHOICES.find((c) => c.value === key)?.label ?? key

/** Query parameters for the API (?range=, plus start/end for custom ranges). */
export function rangeParams({ range, start, end }: DateRange): Record<string, string> {
  return range === "custom" ? { range, start, end } : { range }
}

/** A date range kept in the page URL, so filtered views can be bookmarked and shared. */
export function useUrlDateRange(defaultRange: RangeKey) {
  const [params, setParams] = useSearchParams()
  const raw = params.get("range")
  const value: DateRange = {
    range: RANGE_CHOICES.some((c) => c.value === raw) ? (raw as RangeKey) : defaultRange,
    start: params.get("start") ?? "",
    end: params.get("end") ?? "",
  }
  const setValue = (next: DateRange) => {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        updated.set("range", next.range)
        for (const key of ["start", "end"] as const) {
          if (next.range === "custom" && next[key]) updated.set(key, next[key])
          else updated.delete(key)
        }
        return updated
      },
      { replace: true },
    )
  }
  return [value, setValue] as const
}
