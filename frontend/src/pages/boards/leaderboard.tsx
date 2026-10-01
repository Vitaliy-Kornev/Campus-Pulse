import { useQuery } from "@tanstack/react-query"

import { columnHelper, DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { ErrorState, PageSkeleton } from "@/components/query-state"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { useUser } from "@/hooks/use-session"
import { api } from "@/lib/api"
import { formatNumber } from "@/lib/format"
import type { LeaderboardRow } from "@/lib/types"

type RankedRow = LeaderboardRow & { rank: number }

const col = columnHelper<RankedRow>()
const columns = col.columns([
  col.accessor("rank", { header: "#", meta: { numeric: true, className: "w-12 text-muted-foreground" } }),
  col.accessor("name", {
    header: "Board",
    cell: ({ row }) => (
      <span className="flex items-center gap-2 font-medium">
        {row.original.name}
        {!row.original.is_active && <Badge variant="secondary">Retired</Badge>}
      </span>
    ),
  }),
  col.accessor("area", { header: "Area" }),
  col.accessor("building", {
    header: "Building",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.building}
        {row.original.floor && ` · Fl ${row.original.floor}`}
      </span>
    ),
    meta: { className: "hidden md:table-cell" },
  }),
  col.accessor("lifetime_scans", {
    header: "Lifetime scans",
    meta: { numeric: true },
    cell: ({ getValue }) => <span className="font-medium">{formatNumber(getValue())}</span>,
  }),
  col.accessor("flyer_count", { header: "Flyers hosted", meta: { numeric: true } }),
  col.accessor("avg_scans_per_flyer_day", { header: "Avg scans / flyer / day", meta: { numeric: true } }),
])

export function LeaderboardPage() {
  const user = useUser()
  const rows = useQuery({ queryKey: ["leaderboard"], queryFn: () => api<LeaderboardRow[]>("boards/leaderboard/") })

  return (
    <>
      <PageHeader
        title="Board leaderboard"
        description={
          <>
            {user.is_staff
              ? "Lifetime scans across all campaigns."
              : "Lifetime scans of your flyers on each board. Every board starts at 0 and counts up as students scan your QR codes."}{" "}
            Bot scans are excluded.
          </>
        }
      />
      {rows.isPending ? (
        <PageSkeleton />
      ) : rows.isError ? (
        <ErrorState error={rows.error} onRetry={() => rows.refetch()} />
      ) : (
        <Card className="py-0">
          <DataTable
            columns={columns}
            data={rows.data.map((row, i) => ({ ...row, rank: i + 1 }))}
            rowClassName={(row) => (row.is_active ? undefined : "text-muted-foreground")}
            empty="No boards yet."
          />
        </Card>
      )}
    </>
  )
}
