import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

import { BoardTag } from "@/components/board-tag"
import { columnHelper, DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { ErrorState, PageSkeleton } from "@/components/query-state"
import { RangeChip } from "@/components/range-chip"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useUser } from "@/hooks/use-session"
import { api } from "@/lib/api"
import { formatNumber, formatRate } from "@/lib/format"
import type { LeaderboardRow } from "@/lib/types"

type RankedRow = LeaderboardRow & { rank: number }

const col = columnHelper<RankedRow>()
const columns = col.columns([
  col.accessor("rank", { header: "#", meta: { numeric: true, className: "w-12 text-muted-foreground" } }),
  col.accessor("name", {
    header: "Board",
    cell: ({ row }) => (
      <span className="flex items-center gap-2.5 font-semibold">
        <BoardTag code={row.original.tag} state={row.original.is_active ? (row.original.rank === 1 ? "top" : "scanned") : "retired"} />
        {row.original.name}
      </span>
    ),
  }),
  col.accessor("area", { header: "Area" }),
  col.accessor("lifetime_scans", {
    header: "Scans",
    meta: { numeric: true },
    cell: ({ getValue }) => <span className="font-bold">{formatNumber(getValue())}</span>,
  }),
  col.accessor("flyer_count", { header: "Flyers hosted", meta: { numeric: true } }),
  col.accessor("avg_scans_per_flyer_day", {
    header: "Per flyer per day",
    meta: { numeric: true },
    cell: ({ getValue }) => formatRate(getValue()),
  }),
])

function LeaderMobileRow(row: RankedRow) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-5 text-right text-sm font-bold text-muted-foreground">{row.rank}</span>
      <BoardTag code={row.tag} state={row.is_active ? (row.rank === 1 ? "top" : "scanned") : "retired"} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{row.name}</span>
        <span className="text-xs text-muted-foreground">
          {row.area} · {formatRate(row.avg_scans_per_flyer_day)} per flyer per day
        </span>
      </span>
      <span className="flex flex-col items-end">
        <span className="text-xl leading-none font-extrabold">{formatNumber(row.lifetime_scans)}</span>
        <span className="text-xs text-muted-foreground">scans</span>
      </span>
    </div>
  )
}

export function LeaderboardPage() {
  const user = useUser()
  const rows = useQuery({ queryKey: ["leaderboard"], queryFn: () => api<LeaderboardRow[]>("boards/leaderboard/") })

  // Only boards with scans get a rank; the rest are grouped instead of sharing a tie at zero.
  const { ranked, unscanned } = useMemo(() => {
    const data = rows.data ?? []
    return {
      ranked: data.filter((r) => r.lifetime_scans > 0).map((r, i) => ({ ...r, rank: i + 1 })),
      unscanned: data.filter((r) => r.lifetime_scans === 0),
    }
  }, [rows.data])

  return (
    <>
      <PageHeader
        title="Board leaderboard"
        description={
          user.is_staff
            ? "Which boards get scanned, across every event."
            : "Which boards get your flyers scanned. Every board starts at zero and counts up as students scan your QR codes."
        }
      />
      {rows.isPending ? (
        <PageSkeleton />
      ) : rows.isError ? (
        <ErrorState error={rows.error} onRetry={() => rows.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <Card className="gap-0 pb-0">
            <CardHeader className="pb-3">
              <CardTitle>Ranked by scans</CardTitle>
              <CardDescription>Bot scans excluded. Per flyer per day evens out boards that had more flyers or more time.</CardDescription>
              <CardAction>
                <RangeChip label="Lifetime" />
              </CardAction>
            </CardHeader>
            <DataTable
              label="Boards ranked by scans"
              columns={columns}
              data={ranked}
              mobileRow={LeaderMobileRow}
              rowClassName={(row) => (row.is_active ? undefined : "text-muted-foreground")}
              empty="No scans yet. Boards appear here once a student scans one of your flyers."
            />
          </Card>
          {unscanned.length > 0 && (
            <Card className="gap-3">
              <CardHeader>
                <CardTitle>No scans yet</CardTitle>
                <CardDescription>
                  {unscanned.length === 1 ? "1 board" : `${unscanned.length} boards`} with no scans {user.is_staff ? "from any event" : "of your flyers"}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {unscanned.map((b) => (
                    <li key={b.id} className="flex min-w-0 items-center gap-2.5 text-sm">
                      <BoardTag code={b.tag} state={b.is_active ? (b.flyer_count ? "idle" : "empty") : "retired"} />
                      <span className="truncate">{b.name}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  )
}
