import { useQuery } from "@tanstack/react-query"
import { MegaphoneIcon, PlusIcon } from "lucide-react"
import { useMemo } from "react"
import { Link } from "react-router"

import { columnHelper, DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { ErrorState, PageSkeleton } from "@/components/query-state"
import { Button } from "@/components/ui/button"
import { RangeChip } from "@/components/range-chip"
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { useUser } from "@/hooks/use-session"
import { api } from "@/lib/api"
import { formatDay, formatNumber } from "@/lib/format"
import type { EventRow } from "@/lib/types"

export const eventsQuery = { queryKey: ["events"], queryFn: () => api<EventRow[]>("events/") }

const col = columnHelper<EventRow>()

function eventColumns(isStaff: boolean) {
  return col.columns([
    col.accessor("name", {
      header: "Event",
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col">
          <Link to={`/events/${row.original.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
            {row.original.name}
          </Link>
          <span className="max-w-xs truncate text-xs text-muted-foreground">{row.original.destination_url}</span>
        </div>
      ),
    }),
    ...(isStaff ? [col.accessor("club", { header: "Club" })] : []),
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
      header: "Flyers up",
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

function EventMobileRow(c: EventRow) {
  return (
    <Link to={`/events/${c.id}`} className="flex items-center gap-3">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold text-primary">{c.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {c.active_flyer_count} of {c.flyer_count} flyers up{c.end_date ? ` · ends ${formatDay(c.end_date)}` : ""}
        </span>
      </span>
      <span className="flex flex-col items-end">
        <span className="text-xl leading-none font-extrabold">{formatNumber(c.total_scans)}</span>
        <span className="text-xs text-muted-foreground">scans</span>
      </span>
    </Link>
  )
}

export function EventListPage() {
  const user = useUser()
  const events = useQuery(eventsQuery)

  const columns = useMemo(() => eventColumns(user.is_staff), [user.is_staff])

  return (
    <>
      <PageHeader
        title={user.is_staff ? "All events" : "Your events"}
        description="Each event is one link students land on, posted on as many boards as you like."
        actions={
          <Button asChild>
            <Link to="/flyers/new?new=1">
              <PlusIcon data-icon="inline-start" />
              New event
            </Link>
          </Button>
        }
      />
      {events.isPending ? (
        <PageSkeleton />
      ) : events.isError ? (
        <ErrorState error={events.error} onRetry={() => events.refetch()} />
      ) : events.data.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MegaphoneIcon />
            </EmptyMedia>
            <EmptyTitle>No events yet</EmptyTitle>
            <EmptyDescription>Add an event and the link students should land on, then pick boards. We'll recommend boards that worked for clubs like yours.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link to="/flyers/new?new=1">Post your first event</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Card className="gap-0 pb-0">
          <CardHeader className="pb-3">
            <CardTitle>{events.data.length === 1 ? "1 event" : `${events.data.length} events`}</CardTitle>
            <CardDescription>Scans since each event started. Bot scans excluded.</CardDescription>
            <CardAction>
              <RangeChip label="Lifetime" />
            </CardAction>
          </CardHeader>
          <DataTable label="Events" columns={columns} data={events.data} mobileRow={EventMobileRow} />
        </Card>
      )}
    </>
  )
}
