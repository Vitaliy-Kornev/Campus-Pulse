import { useQuery } from "@tanstack/react-query"
import { MegaphoneIcon, PlusIcon } from "lucide-react"
import { useMemo } from "react"
import { Link } from "react-router"

import { columnHelper, DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { ErrorState, PageSkeleton } from "@/components/query-state"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { useUser } from "@/hooks/use-session"
import { api } from "@/lib/api"
import { formatDay, formatNumber } from "@/lib/format"
import type { CampaignRow } from "@/lib/types"

export const campaignsQuery = { queryKey: ["campaigns"], queryFn: () => api<CampaignRow[]>("campaigns/") }

const col = columnHelper<CampaignRow>()

function campaignColumns(isStaff: boolean) {
  return col.columns([
    col.accessor("name", {
      header: "Campaign",
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col">
          <Link to={`/campaigns/${row.original.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
            {row.original.name}
          </Link>
          <span className="max-w-xs truncate text-xs text-muted-foreground">{row.original.destination_url}</span>
        </div>
      ),
    }),
    ...(isStaff ? [col.accessor("owner", { header: "Owner" })] : []),
    col.accessor((c) => c.start_date ?? "", {
      id: "dates",
      header: "Dates",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.start_date || row.original.end_date ? `${formatDay(row.original.start_date)} – ${formatDay(row.original.end_date, true)}` : "—"}
        </span>
      ),
      meta: { className: "hidden sm:table-cell" },
    }),
    col.accessor("active_flyer_count", {
      header: "Active flyers",
      cell: ({ row }) => (
        <>
          {row.original.active_flyer_count} <span className="text-muted-foreground">/ {row.original.flyer_count}</span>
        </>
      ),
      meta: { numeric: true },
    }),
    col.accessor("total_scans", {
      header: "Scans",
      cell: ({ getValue }) => <span className="font-medium">{formatNumber(getValue())}</span>,
      meta: { numeric: true },
    }),
  ])
}

export function CampaignListPage() {
  const user = useUser()
  const campaigns = useQuery(campaignsQuery)

  const columns = useMemo(() => campaignColumns(user.is_staff), [user.is_staff])


  return (
    <>
      <PageHeader
        title={user.is_staff ? "All campaigns" : "Your campaigns"}
        description="Lifetime numbers. Bot scans are excluded."
        actions={
          <Button asChild>
            <Link to="/campaigns/new">
              <PlusIcon data-icon="inline-start" />
              New campaign
            </Link>
          </Button>
        }
      />
      {campaigns.isPending ? (
        <PageSkeleton />
      ) : campaigns.isError ? (
        <ErrorState error={campaigns.error} onRetry={() => campaigns.refetch()} />
      ) : campaigns.data.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MegaphoneIcon />
            </EmptyMedia>
            <EmptyTitle>No campaigns yet</EmptyTitle>
            <EmptyDescription>Create a campaign with the link students should land on, then post flyers on boards.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link to="/campaigns/new">Create your first campaign</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Card className="py-0">
          <DataTable columns={columns} data={campaigns.data} />
        </Card>
      )}
    </>
  )
}
