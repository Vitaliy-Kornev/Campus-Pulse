import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { BellIcon, CircleCheckIcon, MapPinnedIcon, ScanLineIcon, UserPlusIcon, XIcon, type LucideIcon } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { api, post } from "@/lib/api"
import { useUser } from "@/hooks/use-session"
import { useSwitchClub } from "@/hooks/use-switch-club"
import { formatDate } from "@/lib/format"
import type { AppNotification } from "@/lib/types"
import { cn } from "@/lib/utils"

type NoticeList = { unread: number; items: AppNotification[] }

const ICONS: Record<AppNotification["kind"], LucideIcon> = {
  first_scan: ScanLineIcon,
  move_it: MapPinnedIcon,
  recap: CircleCheckIcon,
  join_request: UserPlusIcon,
}

/**
 * On-site notices (first scans, move-it nudges, recaps, join requests) from every club the officer
 * is in. Never emailed. Opening one from another club switches to that club first.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useUser()
  const switchClub = useSwitchClub()
  const manyClubs = user.clubs.filter((c) => c.status === "active").length > 1
  const notices = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<NoticeList>("notifications/"),
    refetchInterval: 60_000,
  })
  const markRead = useMutation({
    mutationFn: (ids?: number[]) => post("notifications/read/", ids ? { ids } : {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  })
  // Closing is per officer and shows at once; the server catches up behind it.
  const dismiss = useMutation({
    mutationFn: (ids?: number[]) => post("notifications/dismiss/", ids ? { ids } : {}),
    onMutate: async (ids?: number[]) => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] })
      queryClient.setQueryData<NoticeList>(["notifications"], (old) => {
        if (!old) return old
        const items = ids ? old.items.filter((n) => !ids.includes(n.id)) : []
        return { items, unread: items.filter((n) => !n.read).length }
      })
    },
    onError: () => toast.error("Couldn't close that notification. Try again."),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  })
  const unread = notices.data?.unread ?? 0
  const items = notices.data?.items ?? []

  function openNotice(notice: AppNotification) {
    if (!notice.read) markRead.mutate([notice.id])
    setOpen(false)
    if (user.club && notice.club.id !== user.club.id) switchClub(notice.club.id, { to: notice.link || undefined })
    else if (notice.link) navigate(notice.link)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative grid size-9 place-items-center rounded-full text-white transition-colors duration-150 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-highlight focus-visible:outline-none"
        >
          <BellIcon className="size-5" aria-hidden />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-highlight px-1 pt-px text-[11px] font-extrabold text-highlight-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="text-sm font-bold">Notifications</h2>
          {unread > 0 ? (
            <Button variant="ghost" size="sm" className="-mr-2 text-primary" onClick={() => markRead.mutate(undefined)}>
              Mark all read
            </Button>
          ) : (
            items.length > 0 && (
              <Button variant="ghost" size="sm" className="-mr-2 text-primary" onClick={() => dismiss.mutate(undefined)}>
                Clear all
              </Button>
            )
          )}
        </div>
        {items.length ? (
          <ul className="max-h-[60vh] overflow-y-auto">
            {items.map((n) => {
              const Icon = ICONS[n.kind]
              return (
                <li key={n.id} className="relative border-b last:border-b-0">
                  <button
                    type="button"
                    onClick={() => openNotice(n)}
                    className={cn("flex w-full items-start gap-3 py-3 pr-11 pl-4 text-left transition-colors hover:bg-muted", !n.read && "bg-accent/60")}
                  >
                    <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-md", n.read ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground")}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className={cn("text-sm leading-snug", n.read ? "font-medium" : "font-bold")}>{n.title}</span>
                      {n.body && <span className="text-xs leading-snug text-muted-foreground">{n.body}</span>}
                      <span className="text-xs text-muted-foreground">
                        {manyClubs && <span className="font-semibold text-foreground">{n.club.name} · </span>}
                        {formatDate(n.created_at)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Close notification: ${n.title}`}
                    title="Close"
                    onClick={() => dismiss.mutate([n.id])}
                    className="absolute top-2 right-2 grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <XIcon className="size-4" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing yet. You'll see first scans, posters to move, and event recaps here.
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
