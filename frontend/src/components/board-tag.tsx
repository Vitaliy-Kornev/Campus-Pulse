import { tagStateLabel, type TagState } from "@/lib/board-tag"
import { cn } from "@/lib/utils"

type BoardTagProps = {
  /** The board's sign tag from the API, e.g. "CMU" or "JON2". */
  code: string
  count?: string | number | null
  state?: TagState
  selected?: boolean
  className?: string
}

/** A board's sign tag: its short code plus an optional count. State reads by fill and border. */
export function BoardTag({ code, count = null, state = "scanned", selected, className }: BoardTagProps) {
  return (
    <span
      className={cn("cp-tag", className)}
      data-state={state}
      data-selected={selected ? "true" : "false"}
      title={state === "scanned" ? undefined : tagStateLabel(state)}
    >
      <b>{code}</b>
      {count !== null && count !== "" && <span>{count}</span>}
    </span>
  )
}
