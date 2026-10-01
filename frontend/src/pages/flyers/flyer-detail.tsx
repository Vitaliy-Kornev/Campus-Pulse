import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { DownloadIcon, InfoIcon, PrinterIcon, RepeatIcon } from "lucide-react"
import { Link, useParams, useSearchParams } from "react-router"
import { toast } from "sonner"

import { ChartSkeleton, DailyScansChart, HourlyScansChart } from "@/components/charts"
import { PageHeader } from "@/components/page-header"
import { ErrorState, PageSkeleton } from "@/components/query-state"
import { StatCard } from "@/components/stat-card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { api, post } from "@/lib/api"
import { formatDate, formatDateTime, formatNumber, plural } from "@/lib/format"
import type { DayPoint, FlyerDetail, HourPoint } from "@/lib/types"

export const flyerQuery = (slug: string) => ({ queryKey: ["flyer", slug], queryFn: () => api<FlyerDetail>(`flyers/${slug}/`) })

export function FlyerDetailPage() {
  const { slug = "" } = useParams()
  const [params] = useSearchParams()
  const flyer = useQuery(flyerQuery(slug))
  const daily = useQuery({ queryKey: ["flyer", slug, "timeseries"], queryFn: () => api<DayPoint[]>(`flyers/${slug}/timeseries`) })
  const hourly = useQuery({ queryKey: ["flyer", slug, "hourly"], queryFn: () => api<HourPoint[]>(`flyers/${slug}/hourly`) })

  if (flyer.isPending) return <PageSkeleton />
  if (flyer.isError) return <ErrorState error={flyer.error} onRetry={() => flyer.refetch()} />
  const f = flyer.data

  return (
    <>
      <PageHeader
        back={{ to: `/campaigns/${f.campaign.id}`, label: f.campaign.name }}
        title={
          <>
            {f.board.name}
            {f.label && <span className="font-normal text-muted-foreground"> · {f.label}</span>}
          </>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {f.board.building}
              {f.board.floor && ` · Floor ${f.board.floor}`} · {f.board.area}
            </span>
            <span>· Posted {formatDateTime(f.posted_at)}</span>
            {f.removed_at ? (
              <Badge variant="secondary">Removed {formatDate(f.removed_at)}</Badge>
            ) : (
              <Badge className="bg-success/10 text-success">Active</Badge>
            )}
          </span>
        }
        actions={
          <>
            {f.is_active && <MarkRemovedButton slug={f.slug} />}
            <Button variant="outline" asChild>
              <Link to={`/flyers/${f.slug}/repost`}>
                <RepeatIcon data-icon="inline-start" />
                Repost
              </Link>
            </Button>
          </>
        }
      />

      {params.get("new") === "1" && (
        <Alert className="mb-4 border-primary/30 bg-accent text-accent-foreground">
          <InfoIcon />
          <AlertDescription className="text-accent-foreground">
            <span>
              Next: print this QR code and post it on <b>{f.board.name}</b>. Use <b>Print a 2-inch label</b> for a code with a fallback link.
            </span>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <QrCard flyer={f} />

        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Total scans" value={formatNumber(f.counts.total)} />
            <StatCard label="Unique scans" value={formatNumber(f.counts.unique)} />
            <StatCard label="Scans / day" value={f.scans_per_day} hint={`over ${plural(f.days_posted, "day")}`} />
            {f.removed_at ? (
              <StatCard label="After removal" value={formatNumber(f.counts.after_removal)} valueClassName="text-highlight-foreground" />
            ) : (
              f.counts.bots !== undefined && <StatCard label="Bot scans (admin)" value={formatNumber(f.counts.bots)} valueClassName="text-muted-foreground" />
            )}
          </div>
          {f.removed_at && f.counts.bots !== undefined && (
            <p className="text-xs text-muted-foreground">
              Bot scans (admin only, excluded from all counts): <b>{f.counts.bots}</b>
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Scans per day</CardTitle>
            </CardHeader>
            <CardContent>{daily.data ? <DailyScansChart data={daily.data} /> : <ChartSkeleton />}</CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Scans by hour of day</CardTitle>
                <CardDescription>When this spot gets traffic (campus time).</CardDescription>
              </CardHeader>
              <CardContent>{hourly.data ? <HourlyScansChart data={hourly.data} /> : <ChartSkeleton className="h-48" />}</CardContent>
            </Card>
            <DevicesCard flyer={f} />
          </div>
        </div>
      </div>
    </>
  )
}

function MarkRemovedButton({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () => post<FlyerDetail>(`flyers/${slug}/remove/`),
    onSuccess: (data) => {
      queryClient.setQueryData(["flyer", slug], data)
      queryClient.invalidateQueries({ queryKey: ["campaign", String(data.campaign.id)] })
      queryClient.invalidateQueries({ queryKey: ["campaigns"] })
      queryClient.invalidateQueries({ queryKey: ["geojson"] })
      toast.success("Flyer marked removed. Later scans still redirect and are counted as “after removal”.")
    },
    onError: () => toast.error("Couldn't mark the flyer removed. Try again."),
  })
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Mark removed</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark this flyer as removed?</AlertDialogTitle>
          <AlertDialogDescription>
            Use this when the flyer comes down. Scans will still redirect students, and they'll be counted as “after removal”, since people photograph
            flyers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>
            Mark removed
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function QrCard({ flyer }: { flyer: FlyerDetail }) {
  const qr = `/api/flyers/${encodeURIComponent(flyer.slug)}/qr`
  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle>QR code</CardTitle>
        <CardDescription>For your flyer design · transparent background</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <div className="checkerboard w-full max-w-64 rounded-md" title="The checkerboard shows the transparent background">
          <img src={`${qr}.svg`} alt={`QR code for flyer ${flyer.slug}`} className="aspect-square w-full" />
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" asChild>
            <a href={`${qr}.png?download=1`}>
              <DownloadIcon data-icon="inline-start" />
              PNG
            </a>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={`${qr}.svg?download=1`}>
              <DownloadIcon data-icon="inline-start" />
              SVG
            </a>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to={`/flyers/${flyer.slug}/print`} target="_blank">
              <PrinterIcon data-icon="inline-start" />
              Print a 2-inch label
            </Link>
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Place it on a light part of the flyer, with a clear margin around it. For dark designs, use a white background:{" "}
          <a className="text-primary underline-offset-4 hover:underline" href={`${qr}.png?download=1&background=white`}>
            PNG
          </a>{" "}
          ·{" "}
          <a className="text-primary underline-offset-4 hover:underline" href={`${qr}.svg?download=1&background=white`}>
            SVG
          </a>
        </p>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3 pb-4 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-muted-foreground">Scan URL</span>
          <span className="font-mono text-xs break-all">{flyer.scan_url}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-muted-foreground">Destination{flyer.destination_override && " (override)"}</span>
          <a href={flyer.destination} target="_blank" rel="noopener" className="break-all text-primary underline-offset-4 hover:underline">
            {flyer.destination}
          </a>
        </div>
      </CardFooter>
    </Card>
  )
}

function DevicesCard({ flyer }: { flyer: FlyerDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Devices</CardTitle>
      </CardHeader>
      <CardContent>
        {flyer.devices.length ? (
          <ul className="flex flex-col gap-3 text-sm">
            {flyer.devices.map((d) => (
              <li key={d.device_type} className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="capitalize">{d.device_type}</span>
                  <span className="font-mono text-muted-foreground tabular-nums">{formatNumber(d.total)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted" role="presentation">
                  <div className="h-1.5 rounded-full bg-chart-1" style={{ width: `${flyer.counts.total ? (d.total / flyer.counts.total) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No scans yet.</p>
        )}
      </CardContent>
    </Card>
  )
}
