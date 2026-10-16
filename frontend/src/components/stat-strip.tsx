import type { ReactNode } from "react"

import { RangeChip } from "@/components/range-chip"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const COLS: Record<number, string> = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" }

export type Stat = {
  label: string
  value: ReactNode
  /** One plain-language line under the value: a definition, a unit, or what it compares to. */
  hint?: ReactNode
  /** A board name or other text value instead of a number. */
  text?: boolean
  valueClassName?: string
}

/**
 * One scoreboard panel for a page's headline numbers, with the period they cover named once
 * in its header. Cells divide by rules rather than sitting in separate cards.
 */
export function StatStrip({ stats, range, title = "Totals", className }: { stats: Stat[] | undefined; range: string; title?: string; className?: string }) {
  return (
    <section className={cn("rounded-xl bg-card ring-1 ring-foreground/10", className)} aria-label={`${title}, ${range}`}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <h2 className="pt-0.5 text-xs font-bold tracking-[0.1em] text-muted-foreground uppercase">{title}</h2>
        <RangeChip label={range} />
      </div>
      <dl className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-b-xl bg-border", COLS[stats?.length ?? 4])}>
        {stats
          ? stats.map((stat, i) => (
              <div
                key={stat.label}
                className={cn(
                  "flex min-w-0 flex-col gap-1 bg-card px-4 py-3.5",
                  // An odd last cell spans the row on phones so no empty tile shows.
                  stats.length % 2 === 1 && i === stats.length - 1 && "col-span-2 lg:col-span-1",
                )}
              >
                <dt className="text-sm font-medium text-muted-foreground">{stat.label}</dt>
                <dd
                  className={cn(stat.text ? "min-w-0 pt-1 text-base font-bold" : "pt-1 text-[1.75rem] leading-none font-extrabold tracking-tight", stat.valueClassName)}
                  title={stat.text && typeof stat.value === "string" ? stat.value : undefined}
                >
                  {stat.value}
                </dd>
                {stat.hint && <dd className="text-xs text-muted-foreground">{stat.hint}</dd>}
              </div>
            ))
          : [0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-2 bg-card px-4 py-3.5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-7 w-16" />
              </div>
            ))}
      </dl>
    </section>
  )
}
