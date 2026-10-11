import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CircleAlertIcon, DownloadIcon, EllipsisIcon, LockIcon, MapPinnedIcon, PrinterIcon, RepeatIcon } from "lucide-react"
import { useState } from "react"
import { Link, useParams, useSearchParams } from "react-router"
import { toast } from "sonner"

import { BoardTag } from "@/components/board-tag"
import { ChartSkeleton, DailyScansChart, HourlyScansChart } from "@/components/charts"
import { PageHeader } from "@/components/page-header"
import { ErrorState, PageSkeleton } from "@/components/query-state"
import { RangeChip } from "@/components/range-chip"
import { StatStrip, type Stat } from "@/components/stat-strip"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { api, post } from "@/lib/api"
import { formatDate, formatDateTime, formatNumber, formatRate, plural } from "@/lib/format"
import type { DayPoint, FlyerDetail, HourPoint } from "@/lib/types"

export const flyerQuery = (slug: string) => ({ queryKey: ["flyer", slug], queryFn: () => api<FlyerDetail>(`flyers/${slug}/`) })

/** A scan URL a phone off this computer could never reach: localhost or a private network address. */
export function isUnreachableUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === "localhost" || host.endsWith(".local") || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host === "0.0.0.0"
  } catch {
    return false
  }
}

export function UnreachableUrlAlert({ url }: { url: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertTitle>Don't print this code yet</AlertTitle>
      <AlertDescription>
        It points to {url}, which only works on this computer. Phones that scan it will get an error. Set SITE_URL to your real domain on the server, then
        print.
      </AlertDescription>
    </Alert>
  )
}

export function FlyerDetailPage() {
  const { slug = "" } = useParams()
  const [params] = useSearchParams()
  const [confirmTakeDown, setConfirmTakeDown] = useState(false)
  const flyer = useQuery(flyerQuery(slug))
  const daily = useQuery({ queryKey: ["flyer", slug, "timeseries"], queryFn: () => api<DayPoint[]>(`flyers/${slug}/timeseries`) })
  const hourly = useQuery({ queryKey: ["flyer", slug, "hourly"], queryFn: () => api<HourPoint[]>(`flyers/${slug}/hourly`) })

  if (flyer.isPending) return <PageSkeleton />
  if (flyer.isError) return <ErrorState error={flyer.error} onRetry={() => flyer.refetch()} />
  const f = flyer.data
  const isNew = params.get("new") === "1"
  const unreachable = isUnreachableUrl(f.scan_url)

  const stats: Stat[] = [
    { label: "Scans", value: formatNumber(f.counts.total), hint: "Bot scans excluded" },
    { label: "Unique people", value: formatNumber(f.counts.unique), hint: "Each person counts once per day" },
    { label: "Scans per day", value: formatRate(f.scans_per_day), hint: `Over ${plural(f.days_posted, "day")} up` },
  ]
  if (f.removed_at) stats.push({ label: "After taking down", value: formatNumber(f.counts.after_removal), hint: "From photos of the flyer" })
  else if (f.counts.bots !== undefined) stats.push({ label: "Bot scans", value: formatNumber(f.counts.bots), hint: "Admins only; not counted", valueClassName: "text-muted-foreground" })

  return (
    <>
      <PageHeader
        back={{ to: `/events/${f.event.id}`, label: f.event.name }}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <BoardTag code={f.board.tag} state={f.is_active ? "idle" : "retired"} className="h-7 text-sm" />
            {f.board.name}
            {f.label && <span className="font-normal text-muted-foreground">· {f.label}</span>}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {f.board.building}
              {f.board.floor && ` · Floor ${f.board.floor}`} · {f.board.area}
            </span>
            <span>· Posted {formatDateTime(f.posted_at)}</span>
            {f.removed_at ? (
              <Badge variant="secondary">Taken down {formatDate(f.removed_at)}</Badge>
            ) : (
              <Badge className="bg-success/10 text-success">Up</Badge>
            )}
          </span>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`/flyers/${f.slug}/repost`}>
                <RepeatIcon data-icon="inline-start" />
                Repost elsewhere
              </Link>
            </Button>
            {f.is_active && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="More actions">
                    <EllipsisIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuItem onSelect={() => setConfirmTakeDown(true)}>Mark as taken down…</DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />
      <TakeDownDialog slug={f.slug} open={confirmTakeDown} onOpenChange={setConfirmTakeDown} />

      {unreachable && (
        <div className="mb-4">
          <UnreachableUrlAlert url={f.scan_url} />
        </div>
      )}
      {f.move_it && (
        <Alert className="mb-4 border-highlight bg-highlight/15">
          <MapPinnedIcon />
          <AlertTitle>No scans here in {f.days_posted} days</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>Your event is still ahead, so there's time to move this poster somewhere students will see it.</span>
            <Button asChild size="sm" className="no-underline! hover:text-primary-foreground!">
              <Link to={`/flyers/${f.slug}/repost?move=1`}>Move it to a recommended board</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {isNew && <NextSteps flyer={f} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <QrCard flyer={f} />

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <StatStrip title="This flyer" range="Since posted" stats={stats} />

          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Scans per day</CardTitle>
              <CardAction>
                <RangeChip label="Since posted" />
              </CardAction>
            </CardHeader>
            <CardContent>{daily.data ? <DailyScansChart data={daily.data} /> : <ChartSkeleton />}</CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="gap-3 md:col-span-2">
              <CardHeader>
                <CardTitle>Scans by hour of day</CardTitle>
                <CardDescription>When this spot gets traffic, in campus time.</CardDescription>
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

/** Shown once, right after posting: the three things to do next, in order. */
function NextSteps({ flyer }: { flyer: FlyerDetail }) {
  return (
    <section aria-label="Next steps" className="mb-4 overflow-hidden rounded-xl bg-panel text-panel-foreground shadow-[0_10px_28px_rgb(60_0_10/0.22)]">
      <h2 className="px-5 pt-4 text-lg font-extrabold">Your flyer is ready to print</h2>
      <ol className="grid gap-px md:grid-cols-3">
        <li className="flex flex-col gap-3 px-5 py-4">
          <span className="text-sm font-semibold text-white/80">1 · Print the label</span>
          <Button asChild className="w-fit bg-white text-primary hover:bg-white/90">
            <Link to={`/flyers/${flyer.slug}/print`} target="_blank">
              <PrinterIcon data-icon="inline-start" />
              Print 2-inch label
            </Link>
          </Button>
        </li>
        <li className="flex flex-col gap-3 px-5 py-4 md:border-l md:border-white/15">
          <span className="text-sm font-semibold text-white/80">2 · Put it up on</span>
          <span className="flex items-center gap-2.5 font-semibold">
            <BoardTag code={flyer.board.tag} state="top" />
            {flyer.board.name}
          </span>
        </li>
        <li className="flex flex-col gap-3 px-5 py-4 md:border-l md:border-white/15">
          <span className="text-sm font-semibold text-white/80">3 · Watch the scans</span>
          <span className="text-sm text-white/90">They show up on this page and the map as students scan.</span>
        </li>
      </ol>
      <p className="flex items-start gap-2 border-t border-white/15 px-5 py-3 text-sm text-white/90">
        <LockIcon className="mt-0.5 size-4 shrink-0 text-highlight" aria-hidden />
        {flyer.destination_override
          ? "This QR code never changes once printed. It sends students to this flyer's own link."
          : "This QR code never changes once printed. You can still change where it sends students by editing the event's link."}
      </p>
    </section>
  )
}

function TakeDownDialog({ slug, open, onOpenChange }: { slug: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient()
  const takeDown = useMutation({
    mutationFn: () => post<FlyerDetail>(`flyers/${slug}/remove/`),
    onSuccess: (data) => {
      queryClient.setQueryData(["flyer", slug], data)
      queryClient.invalidateQueries({ queryKey: ["event", String(data.event.id)] })
      queryClient.invalidateQueries({ queryKey: ["events"] })
      queryClient.invalidateQueries({ queryKey: ["geojson"] })
      toast.success("Marked as taken down. Later scans still work and are counted separately.")
    },
    onError: () => toast.error("Couldn't update the flyer. Try again."),
  })
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark this flyer as taken down?</AlertDialogTitle>
          <AlertDialogDescription>
            Do this when the flyer comes off the board. Its QR code keeps working, and any later scans are counted separately as "after taking down",
            since people photograph flyers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it up</AlertDialogCancel>
          <AlertDialogAction onClick={() => takeDown.mutate()}>Mark as taken down</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function QrCard({ flyer }: { flyer: FlyerDetail }) {
  const [white, setWhite] = useState(false)
  const qr = `/api/flyers/${encodeURIComponent(flyer.slug)}/qr`
  const suffix = white ? "&background=white" : ""
  return (
    <Card className="gap-4 self-start">
      <CardHeader>
        <CardTitle>QR code</CardTitle>
        <CardDescription>Leave a clear margin around it on your flyer.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <div className={white ? "w-full max-w-64 rounded-md bg-white p-3 ring-1 ring-border" : "checkerboard w-full max-w-64 rounded-md p-3"}>
          <img src={`${qr}.svg${white ? "?background=white" : ""}`} alt={`QR code for flyer ${flyer.slug}`} className="aspect-square w-full" />
        </div>
        <Button asChild className="w-full">
          <Link to={`/flyers/${flyer.slug}/print`} target="_blank">
            <PrinterIcon data-icon="inline-start" />
            Print 2-inch label
          </Link>
        </Button>
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`${qr}.png?download=1${suffix}`}>
              <DownloadIcon data-icon="inline-start" />
              PNG
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`${qr}.svg?download=1${suffix}`}>
              <DownloadIcon data-icon="inline-start" />
              SVG
            </a>
          </Button>
        </div>
        <Field orientation="horizontal" className="w-full">
          <Switch id="qr-white" checked={white} onCheckedChange={setWhite} />
          <FieldLabel htmlFor="qr-white" className="font-normal">
            White background, for dark flyer designs
          </FieldLabel>
        </Field>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3 pb-4 text-sm">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <LockIcon className="size-3.5" aria-hidden />
            The code opens (never changes)
          </span>
          <span className="font-mono text-xs break-all">{flyer.scan_url}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted-foreground">
            Then sends students to{flyer.destination_override ? " (this flyer's own link)" : " (the event's link)"}
          </span>
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
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>Devices</CardTitle>
      </CardHeader>
      <CardContent>
        {flyer.devices.length ? (
          <ul className="flex flex-col gap-3 text-sm">
            {flyer.devices.map((d) => {
              const share = flyer.counts.total ? Math.round((d.total / flyer.counts.total) * 100) : 0
              return (
                <li key={d.device_type} className="flex flex-col gap-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="capitalize">{d.device_type}</span>
                    <span className="font-semibold">
                      {formatNumber(d.total)} <span className="font-normal text-muted-foreground">({share}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted" aria-hidden>
                    <div className="h-1.5 rounded-full bg-chart-1" style={{ width: `${share}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No scans yet.</p>
        )}
      </CardContent>
    </Card>
  )
}
