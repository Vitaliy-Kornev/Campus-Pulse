import type { ReactNode } from "react"

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type StatCardProps = {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  /** Shorter text values (a board name) instead of a big number. */
  text?: boolean
  className?: string
  valueClassName?: string
}

/** A KPI tile: label, a large tabular number, and an optional hint underneath. */
export function StatCard({ label, value, hint, text, className, valueClassName }: StatCardProps) {
  return (
    <Card size="sm" className={cn("min-w-0", className)}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <div
          className={cn(text ? "truncate text-base font-semibold" : "font-mono text-2xl font-semibold tabular-nums", valueClassName)}
          title={text && typeof value === "string" ? value : undefined}
        >
          {value}
        </div>
      </CardHeader>
      {hint && <CardContent className="-mt-2 text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  )
}
