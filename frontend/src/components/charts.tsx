import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDay, formatHour } from "@/lib/format"
import type { DayPoint, HourPoint } from "@/lib/types"
import { cn } from "@/lib/utils"

const dailyConfig = {
  total: { label: "Total", color: "var(--chart-1)" },
  unique: { label: "Unique", color: "var(--chart-2)" },
} satisfies ChartConfig

const scansConfig = { total: { label: "Scans", color: "var(--chart-1)" } } satisfies ChartConfig

export function ChartSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-56 w-full", className)} />
}

/** Total and unique scans per day. */
export function DailyScansChart({ data, className }: { data: DayPoint[]; className?: string }) {
  return (
    <ChartContainer config={dailyConfig} className={cn("aspect-auto h-56 w-full", className)}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={(d: string) => formatDay(d)} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" labelFormatter={(d) => formatDay(String(d), true)} />} />
        <Area dataKey="total" type="monotone" stroke="var(--color-total)" fill="var(--color-total)" fillOpacity={0.12} strokeWidth={2} />
        <Area dataKey="unique" type="monotone" stroke="var(--color-unique)" fill="transparent" strokeWidth={2} />
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  )
}

/** Scans by hour of day (campus time). */
export function HourlyScansChart({ data }: { data: HourPoint[] }) {
  return (
    <ChartContainer config={scansConfig} className="aspect-auto h-48 w-full">
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} interval={2} tickFormatter={formatHour} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator labelFormatter={(_, payload) => formatHour(Number(payload?.[0]?.payload?.hour ?? 0))} />} />
        <Bar dataKey="total" fill="var(--color-total)" radius={3} />
      </BarChart>
    </ChartContainer>
  )
}
