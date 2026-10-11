import { useQuery } from "@tanstack/react-query"
import { ArrowRightIcon, CircleCheckIcon } from "lucide-react"
import { Link } from "react-router"

import { TierBadge } from "@/components/board-picker"
import { BoardTag } from "@/components/board-tag"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { formatNumber, formatRate } from "@/lib/format"
import type { EventRecap } from "@/lib/types"

/**
 * After an event ends: what its posters did, board by board, and where to post next time.
 * Posters go up once per event, so this is the lesson to carry into the next one.
 */
export function EventRecapPanel({ eventId }: { eventId: number }) {
  const recap = useQuery({ queryKey: ["event", String(eventId), "recap"], queryFn: () => api<EventRecap>(`events/${eventId}/recap`) })
  if (recap.isPending) return <Skeleton className="mb-4 h-56" />
  if (recap.isError || !recap.data) return null
  const r = recap.data
  const max = Math.max(1, ...r.boards.map((b) => b.per_day))
  const beforeShare = r.before_start !== null && r.total ? Math.round((r.before_start / r.total) * 100) : null

  return (
    <section aria-labelledby="recap-title" className="mb-4 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-panel px-5 py-4 text-panel-foreground">
        <CircleCheckIcon className="size-5 text-highlight" aria-hidden />
        <h2 id="recap-title" className="text-lg font-extrabold">
          Recap: how your posters did
        </h2>
        <p className="text-sm text-white/85 sm:ml-auto">
          <b className="text-base font-extrabold text-white">{formatNumber(r.total)}</b> scans from <b className="font-bold text-white">{formatNumber(r.unique)}</b> people
          across {r.flyers} poster{r.flyers === 1 ? "" : "s"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-px bg-border lg:grid-cols-5">
        <div className="flex flex-col gap-3 bg-card p-5 lg:col-span-3">
          <h3 className="text-sm font-bold">Every board, by scans per day while it was up</h3>
          <ol className="flex flex-col gap-2.5">
            {r.boards.map((b, i) => (
              <li key={b.slug} className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-center gap-2.5">
                  <BoardTag code={b.tag} state={i === 0 && b.scans ? "top" : b.scans ? "scanned" : "empty"} />
                  <Link to={`/flyers/${b.slug}`} className="min-w-0 flex-1 truncate text-sm font-semibold underline-offset-4 hover:underline">
                    {b.board}
                    {b.label && <span className="font-normal text-muted-foreground"> ({b.label})</span>}
                  </Link>
                  <span className="hidden text-sm text-muted-foreground sm:inline">{formatNumber(b.scans)} scans</span>
                  <span className="w-16 text-right text-sm font-extrabold">{formatRate(b.per_day)}/day</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted" aria-hidden>
                  <div className={i === 0 && b.scans ? "h-1.5 rounded-full bg-highlight" : "h-1.5 rounded-full bg-primary"} style={{ width: `${(b.per_day / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-col gap-5 bg-card p-5 lg:col-span-2">
          <div className="flex flex-col gap-2 text-sm">
            <h3 className="font-bold">What worked</h3>
            {r.best ? (
              <p>
                <b>{r.best.board}</b> did best, at {formatRate(r.best.per_day)} scans a day.
                {beforeShare !== null && ` ${beforeShare}% of all scans came before the event started.`}
              </p>
            ) : (
              <p className="text-muted-foreground">None of this event's posters were scanned.</p>
            )}
            {r.no_scans.length > 0 && (
              <p className="text-muted-foreground">
                No scans at {r.no_scans.map((b) => b.board).join(", ")}. Skip {r.no_scans.length === 1 ? "it" : "them"} next time.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2.5">
            <h3 className="text-sm font-bold">Try next time</h3>
            {r.next_time.length ? (
              <ul className="flex flex-col gap-2.5">
                {r.next_time.map((s) => (
                  <li key={s.board_id} className="flex items-center gap-2.5">
                    <BoardTag code={s.tag} state="idle" />
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="truncate text-sm font-semibold">{s.board}</span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <TierBadge tier={s.tier} />
                        {s.reason}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">You already used the boards we'd recommend. Keep the ones that worked.</p>
            )}
            <Link to="/flyers/new?new=1" className="mt-1 flex w-fit items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline">
              Plan your next event
              <ArrowRightIcon className="size-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
