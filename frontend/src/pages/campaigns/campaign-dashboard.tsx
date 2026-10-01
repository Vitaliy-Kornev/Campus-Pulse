import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { DownloadIcon, PencilIcon, PlusIcon } from "lucide-react"
import { Link, useParams } from "react-router"

import { BoardScansChart, ChartSkeleton, DailyScansChart } from "@/components/charts"
import { columnHelper, DataTable } from "@/components/data-table"
import { DateRangeFilter } from "@/components/date-range-filter"
import { PageHeader } from "@/components/page-header"
import { ErrorState, PageSkeleton } from "@/components/query-state"
import { StatCard } from "@/components/stat-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useUser } from "@/hooks/use-session"
import { api, withQuery } from "@/lib/api"
import { formatDate, formatDay, formatNumber } from "@/lib/format"
import { rangeParams, useUrlDateRange } from "@/lib/range"
import type { BoardCollection, BoardScans, CampaignSummary, DayPoint, FlyerRow } from "@/lib/types"
import { campaignQuery } from "@/pages/campaigns/campaign-form"
import { CampaignMap } from "@/pages/campaigns/campaign-map"

const col = columnHelper<FlyerRow>()
const flyerColumns = col.columns([
  col.accessor("board", {
    header: "Board",
    cell: ({ row }) => (
      <Link to={`/flyers/${row.original.slug}`} className="font-medium text-primary underline-offset-4 hover:underline">
        {row.original.board}
      </Link>
    ),
  }),
  col.accessor("label", { header: "Label", cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() || "—"}</span> }),
  col.accessor("posted_at", { header: "Posted", cell: ({ getValue }) => <span className="whitespace-nowrap">{formatDate(getValue())}</span> }),
  col.accessor("days_posted", { header: "Days", meta: { numeric: true } }),
  col.accessor("total_scans", { header: "Total", meta: { numeric: true }, cell: ({ getValue }) => <span className="font-medium">{formatNumber(getValue())}</span> }),
  col.accessor("unique_scans", { header: "Unique", meta: { numeric: true }, cell: ({ getValue }) => formatNumber(getValue()) }),
  col.accessor("scans_per_day", { header: "Per day", meta: { numeric: true } }),
  col.accessor((f) => (f.is_active ? "active" : "removed"), {
    id: "status",
    header: "Status",
    cell: ({ row }) =>
      row.original.is_active ? (
        <Badge className="bg-success/10 text-success">Active</Badge>
      ) : (
        <div className="flex flex-col gap-0.5">
          <Badge variant="secondary">Removed</Badge>
          {row.original.after_removal_scans > 0 && (
            <span className="text-xs text-highlight-foreground">{row.original.after_removal_scans} after removal</span>
          )}
        </div>
      ),
  }),
])

export function CampaignDashboardPage() {
  const { id = "" } = useParams()
  const user = useUser()
  const [range, setRange] = useUrlDateRange("30d")
  const params = rangeParams(range)
  const query = <T,>(path: string, extra: Record<string, string> = {}) => ({
    queryKey: ["campaign", id, path, params, extra],
    queryFn: () => api<T>(withQuery(path, { ...params, ...extra })),
    placeholderData: keepPreviousData,
  })

  const campaign = useQuery(campaignQuery(id))
  const summary = useQuery(query<CampaignSummary>(`campaigns/${id}/summary`))
  const timeseries = useQuery(query<DayPoint[]>(`campaigns/${id}/timeseries`))
  const byBoard = useQuery(query<BoardScans[]>(`campaigns/${id}/by-board`))
  const boards = useQuery(query<BoardCollection>("boards.geojson", { campaign: id }))
  const flyers = useQuery({ queryKey: ["campaign", id, "flyers"], queryFn: () => api<FlyerRow[]>(`campaigns/${id}/flyers`) })

  if (campaign.isPending) return <PageSkeleton />
  if (campaign.isError) return <ErrorState error={campaign.error} onRetry={() => campaign.refetch()} />
  const c = campaign.data
  const s = summary.data

  return (
    <>
      <PageHeader
        back={{ to: "/campaigns", label: "Campaigns" }}
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
            {user.is_staff && (
              <span>
                · owner <b className="font-medium text-foreground">{c.owner}</b>
              </span>
            )}
          </span>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`/campaigns/${c.id}/edit`}>
                <PencilIcon data-icon="inline-start" />
                Edit
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <a href={`/api/campaigns/${c.id}/export.csv`}>
                <DownloadIcon data-icon="inline-start" />
                Export CSV
              </a>
            </Button>
            <Button asChild>
              <Link to={`/flyers/new?campaign=${c.id}`}>
                <PlusIcon data-icon="inline-start" />
                Post flyer
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <DateRangeFilter value={range} onChange={setRange} idPrefix="dashboard-range" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {s ? (
          <>
            <StatCard label="Total scans" value={formatNumber(s.total)} />
            <StatCard label="Unique scans" value={formatNumber(s.unique)} />
            <StatCard label="Active flyers" value={formatNumber(s.active_flyers)} />
            <StatCard
              label="Best board"
              text
              value={s.best_board?.board ?? "—"}
              hint={s.best_board ? `${formatNumber(s.best_board.total)} scans` : undefined}
            />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[88px]" />)
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Scans per day</CardTitle>
          </CardHeader>
          <CardContent>{timeseries.data ? <DailyScansChart data={timeseries.data} /> : <ChartSkeleton />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Scans by board</CardTitle>
          </CardHeader>
          <CardContent className="max-h-80 overflow-y-auto">
            {!byBoard.data ? (
              <ChartSkeleton />
            ) : byBoard.data.length ? (
              <BoardScansChart data={byBoard.data} />
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">No scans in this date range.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Where this campaign is posted</CardTitle>
          <CardDescription>Circle size and color show scans in the selected date range.</CardDescription>
        </CardHeader>
        <CardContent>
          <CampaignMap features={boards.data?.features} />
        </CardContent>
      </Card>

      <Card className="mt-4 gap-0 pb-0">
        <CardHeader className="pb-3">
          <CardTitle>Flyers</CardTitle>
          <CardDescription>Lifetime totals. Click a header to sort.</CardDescription>
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
            columns={flyerColumns}
            data={flyers.data}
            empty="No flyers posted yet. Use Post flyer to put one on a board and get its QR code."
          />
        )}
      </Card>
    </>
  )
}
