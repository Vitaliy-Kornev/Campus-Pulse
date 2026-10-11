import { CalendarRangeIcon, InfinityIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Names the period a number covers ("Last 30 days", "Lifetime"), so figures from different
 * ranges on one screen never look like they disagree.
 */
export function RangeChip({ label, className }: { label: string; className?: string }) {
  const lifetime = label.toLowerCase() === "lifetime"
  const Icon = lifetime ? InfinityIcon : CalendarRangeIcon
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border bg-secondary px-2.5 pt-px text-xs font-semibold whitespace-nowrap text-secondary-foreground",
        className,
      )}
    >
      <Icon className="size-3.5 -translate-y-px text-muted-foreground" aria-hidden />
      {label}
    </span>
  )
}
