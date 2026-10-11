import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { DownloadIcon, PencilIcon, PlusIcon } from "lucide-react"
import { Link, useParams } from "react-router"

import { BoardTag } from "@/components/board-tag"
import { ChartSkeleton, DailyScansChart } from "@/components/charts"
import { columnHelper, DataTable } from "@/components/data-table"
import { DateRangeFilter } from "@/components/date-range-filter"
import { PageHeader } from "@/components/page-header"
import { ErrorState, PageSkeleton } from "@/components/query-state"
import { RangeChip } from "@/components/range-chip"
import { StatStrip } from "@/components/stat-strip"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useUser } from "@/hooks/use-session"
import { api, withQuery } from "@/lib/api"
import { formatDate, formatDay, formatNumber, formatRate } from "@/lib/format"
import { rangeLabel, rangeParams, useUrlDateRange } from "@/lib/range"
import type { BoardCollection, BoardScans, EventSummary, DayPoint, FlyerRow } from "@/lib/types"
import { eventQuery } from "@/pages/events/event-form"
import { EventMap } from "@/pages/events/event-map"
import { EventRecapPanel } from "@/pages/events/event-recap"
import { useTaxonomy } from "@/hooks/use-taxonomy"

/** Up for days with no scans while the event is still ahead: same rule as the move-it notice. */
const isQuiet = (flyer: FlyerRow, ended: boolean) => flyer.is_active && !ended && flyer.total_scans === 0 && flyer.days_posted >= 5

function FlyerStatus({ flyer, ended }: { flyer: FlyerRow; ended: boolean }) {
  if (isQuiet(flyer, ended)) {
    return (
      <Link to={`/flyers/${flyer.slug}`} className="w-fit">
        <Badge className="bg-highlight text-highlight-foreground">Move it?</Badge>
      </Link>
    )
  }
  if (flyer.is_active) return <Badge className="bg-success/10 text-success">Up</Badge>
  return (
    <span className="flex flex-col items-start gap-0.5">
      <Badge variant="secondary">Taken down</Badge>
      {flyer.after_removal_scans > 0 && <span className="text-xs text-muted-foreground">{flyer.after_removal_scans} scans after</span>}
    </span>
  )
}

const col = columnHelper<FlyerRow>()
const flyerColumns = (ended: boolean) => col.columns([
  col.accessor("board", {
    header: "Board",
    cell: ({ row }) => (
      <Link to={`/flyers/${row.original.slug}`} className="flex items-center gap-2.5 font-semibold text-primary underline-offset-4 hover:underline">
        <BoardTag code={row.original.board_tag} state={row.original.is_active ? "idle" : "retired"} />
        {row.original.board}
      </Link>
    ),
  }),
  col.accessor("label", { header: "Design", cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() || "—"}</span> }),
  col.accessor("posted_at", { header: "Posted", cell: ({ getValue }) => <span className="whitespace-nowrap">{formatDate(getValue())}</span> }),
  col.accessor("days_posted", { header: "Days up", meta: { numeric: true } }),
  col.accessor("total_scans", { header: "Scans", meta: { numeric: true }, cell: ({ getValue }) => <span className="font-bold">{formatNumber(getValue())}</span> }),
  col.accessor("unique_scans", { header: "Unique", meta: { numeric: true }, cell: ({ getValue }) => formatNumber(getValue()) }),
  col.accessor("scans_per_day", { header: "Per day", meta: { numeric: true }, cell: ({ getValue }) => formatRate(getValue()) }),
  col.accessor((f) => (f.is_active ? "up" : "down"), { id: "status", header: "Status", cell: ({ row }) => <FlyerStatus flyer={row.original} ended={ended} /> }),
])

function FlyerMobileRow(flyer: FlyerRow) {
  return (
    <Link to={`/flyers/${flyer.slug}`} className="flex items-center gap-3">
      <BoardTag code={flyer.board_tag} state={flyer.is_active ? "idle" : "retired"} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{flyer.board}</span>
        <span className="text-xs text-muted-foreground">
          {flyer.label ? `${flyer.label} · ` : ""}
          {formatRate(flyer.scans_per_day)}/day · {flyer.is_active ? `up ${flyer.days_posted} days` : "taken down"}
          {flyer.is_active && flyer.total_scans === 0 && flyer.days_posted >= 5 && " · no scans yet"}
        </span>
      </span>
      <span className="flex flex-col items-end">
        <span className="text-xl leading-none font-extrabold">{formatNumber(flyer.total_scans)}</span>
        <span className="text-xs text-muted-foreground">scans</span>
      </span>
    </Link>
  )
}

/** Boards ranked by scans: tag, full name, and a bar scaled to the busiest board. */
function BoardScansList({ rows }: { rows: BoardScans[] }) {
  const max = Math.max(1, ...rows.map((r) => r.total))
  return (
    <ol className="flex flex-col gap-3">
      {rows.map((r, i) => (
        <li key={r.board_id} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <BoardTag code={r.tag} state={i === 0 ? "top" : "scanned"} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={r.board}>
              {r.board}
            </span>
            <span className="text-base font-extrabold">{formatNumber(r.total)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted" aria-hidden>
            <div className={i === 0 ? "h-2 rounded-full bg-highlight" : "h-2 rounded-full bg-primary"} style={{ width: `${(r.total / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  )
}

export function EventDashboardPage() {
  const { id = "" } = useParams()
  const user = useUser()
  const taxonomy = useTaxonomy()
  const [range, setRange] = useUrlDateRange("30d")
  const params = rangeParams(range)
  const label = range.range === "custom" && (range.start || range.end) ? `${formatDay(range.start || null)} – ${formatDay(range.end || null, true)}` : rangeLabel(range.range)
  const query = <T,>(path: string, extra: Record<string, string> = {}) => ({
    queryKey: ["event", id, path, params, extra],
    queryFn: () => api<T>(withQuery(path, { ...params, ...extra })),
    placeholderData: keepPreviousData,
  })

  const event = useQuery(eventQuery(id))
  const summary = useQuery(query<EventSummary>(`events/${id}/summary`))
  const timeseries = useQuery(query<DayPoint[]>(`events/${id}/timeseries`))
  const byBoard = useQuery(query<BoardScans[]>(`events/${id}/by-board`))
  const boards = useQuery(query<BoardCollection>("boards.geojson", { event: id }))
  const flyers = useQuery({ queryKey: ["event", id, "flyers"], queryFn: () => api<FlyerRow[]>(`events/${id}/flyers`) })

  if (event.isPending) return <PageSkeleton />
  if (event.isError) return <ErrorState error={event.error} onRetry={() => event.refetch()} />
  const c = event.data
  const s = summary.data
  const columns = flyerColumns(c.has_ended)

  return (
    <>
      <PageHeader
        back={{ to: "/events", label: "Events" }}
        title={c.name}
        description={
          <span className="flex flex-wrap items-center gap-x-2">
            <a href={c.destination_url} target="_blank" rel="noopener" className="max-w-md truncate underline-offset-4 hover:underline">
              {c.destination_url}
            </a>
            {(c.start_date || c.end_date) && (
              <span>
                · {formatDay(c.start_date)} – {formatDay(c.end_date, true)}
              </span>
            )}
            <span>· {taxonomy.eventTypeLabel(c.event_type)}</span>
            {user.is_staff && (
              <span>
                · <b className="font-semibold text-foreground">{c.club}</b>
              </span>
            )}
          </span>
        }
        actions={
          <>
            <Button asChild>
              <Link to={`/flyers/new?event=${c.id}`}>
                <PlusIcon data-icon="inline-start" />
                Post on more boards
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/events/${c.id}/edit`}>
                <PencilIcon data-icon="inline-start" />
                Edit
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <a href={`/api/events/${c.id}/export.csv`}>
                <DownloadIcon data-icon="inline-start" />
                Export CSV
              </a>
            </Button>
          </>
        }
      />

      {c.has_ended && <EventRecapPanel eventId={c.id} />}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <DateRangeFilter value={range} onChange={setRange} idPrefix="dashboard-range" />
      </div>

      <StatStrip
        range={label}
        stats={
          s && [
            { label: "Scans", value: formatNumber(s.total), hint: "Bot and link-preview scans excluded" },
            { label: "Unique people", value: formatNumber(s.unique), hint: "Each person counts once per day" },
            { label: "Flyers up now", value: formatNumber(s.active_flyers), hint: "Not marked taken down" },
            {
              label: "Best board",
              text: true,
              value: s.best_board ? (
                <span className="flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:gap-2" title={s.best_board.board}>
                  <BoardTag code={s.best_board.tag} state="top" />
                  <span className="leading-snug">{s.best_board.board}</span>
                </span>
              ) : (
                "No scans yet"
              ),
              hint: s.best_board ? `${formatNumber(s.best_board.total)} scans` : undefined,
            },
          ]
        }
      />

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-12">
        <Card className="gap-3 lg:col-span-7">
          <CardHeader>
            <CardTitle>Where it's posted</CardTitle>
            <CardDescription>Each tag shows that board's scans.</CardDescription>
            <CardAction>
              <RangeChip label={label} />
            </CardAction>
          </CardHeader>
          <CardContent>
            <EventMap features={boards.data?.features} className="isolate h-80 overflow-hidden rounded-lg lg:h-96" />
          </CardContent>
        </Card>
        <Card className="gap-3 lg:col-span-5">
          <CardHeader>
            <CardTitle>Scans by board</CardTitle>
            <CardAction>
              <RangeChip label={label} />
            </CardAction>
          </CardHeader>
          <CardContent className="max-h-[26rem] overflow-y-auto">
            {!byBoard.data ? (
              <ChartSkeleton />
            ) : byBoard.data.length ? (
              <BoardScansList rows={byBoard.data} />
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">No scans in this date range.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4 gap-3">
        <CardHeader>
          <CardTitle>Scans per day</CardTitle>
          <CardAction>
            <RangeChip label={label} />
          </CardAction>
        </CardHeader>
        <CardContent>{timeseries.data ? <DailyScansChart data={timeseries.data} /> : <ChartSkeleton />}</CardContent>
      </Card>

      <Card className="mt-4 gap-0 pb-0">
        <CardHeader className="pb-3">
          <CardTitle>Flyers</CardTitle>
          <CardDescription>Totals since each flyer went up, whatever the date range above.</CardDescription>
          <CardAction>
            <RangeChip label="Lifetime" />
          </CardAction>
        </CardHeader>
        {flyers.isPending ? (
          <CardContent className="pb-4">
            <Skeleton className="h-32" />
          </CardContent>
        ) : flyers.isError ? (
          <CardContent className="pb-4">
            <ErrorState error={flyers.error} onRetry={() => flyers.refetch()} />
          </CardContent>
        ) : (
          <DataTable
            label="Flyers in this event"
            columns={columns}
            data={flyers.data}
            mobileRow={FlyerMobileRow}
            empty="No flyers posted yet. Use Post flyers to put one on a board and get its QR code."
          />
        )}
      </Card>
    </>
  )
}
