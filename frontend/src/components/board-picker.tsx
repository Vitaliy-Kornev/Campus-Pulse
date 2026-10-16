import { ChevronsUpDownIcon, LocateFixedIcon, MapIcon, XIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { BoardTag } from "@/components/board-tag"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { useLeafletMap } from "@/hooks/use-leaflet-map"
import { useConfig } from "@/hooks/use-session"
import { tagHtml } from "@/lib/board-tag"
import { fitWithDetail, L, tagIcon } from "@/lib/map"
import type { Board, BoardRecommendation } from "@/lib/types"
import { cn } from "@/lib/utils"

const RECENT_KEY = "campus-pulse:recent-boards"

/** Boards this browser posted to most recently, newest first. A convenience only; never required. */
export function readRecentBoards(): number[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")
    return Array.isArray(value) ? value.filter((n) => typeof n === "number") : []
  } catch {
    return []
  }
}

export function rememberBoards(ids: number[]) {
  try {
    const next = [...ids, ...readRecentBoards().filter((id) => !ids.includes(id))].slice(0, 6)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Private windows and blocked storage just don't get a Recent group.
  }
}

type BoardPickerProps = {
  boards: Board[]
  value: number[]
  onChange: (ids: number[]) => void
  id?: string
  invalid?: boolean
  /** Boards recommended for this event, best first; listed first and badged. */
  recommendations?: BoardRecommendation[]
}

/** Straight-line distance in meters (fine at campus scale). */
function metersBetween(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180
  const dLat = (b[0] - a[0]) * rad
  const dLng = (b[1] - a[1]) * rad * Math.cos(((a[0] + b[0]) / 2) * rad)
  return Math.round(Math.sqrt(dLat * dLat + dLng * dLng) * 6_371_000)
}

const formatDistance = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`)

/**
 * Pick one or more boards: search by name, building, or tag, with recommended and recently used
 * boards first, "Near me" for standing at a board, or pick them on the map. Selected boards show
 * as removable tags.
 */
export function BoardPicker({ boards, value, onChange, id, invalid, recommendations = [] }: BoardPickerProps) {
  const [open, setOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [here, setHere] = useState<[number, number] | null>(null)
  const [locating, setLocating] = useState(false)
  const recById = useMemo(() => new Map(recommendations.map((r) => [r.board_id, r])), [recommendations])

  // "I'm at the board": sort boards by distance from the phone's location.
  function findNearMe() {
    if (!("geolocation" in navigator)) {
      toast.error("This browser can't share your location. Search for the board instead.")
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHere([pos.coords.latitude, pos.coords.longitude])
        setLocating(false)
        setOpen(true)
      },
      () => {
        setLocating(false)
        toast.error("Couldn't get your location. Allow location access, or search for the board.")
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }
  const active = useMemo(() => boards.filter((b) => b.is_active), [boards])
  const byId = useMemo(() => new Map(active.map((b) => [b.id, b])), [active])
  const recent = useMemo(() => readRecentBoards().map((rid) => byId.get(rid)).filter((b): b is Board => Boolean(b)), [byId])
  const recommended = useMemo(() => recommendations.map((r) => byId.get(r.board_id)).filter((b): b is Board => Boolean(b)), [recommendations, byId])
  const nearest = useMemo(
    () =>
      here
        ? active
            .map((b) => ({ board: b, meters: metersBetween(here, [b.latitude, b.longitude]) }))
            .sort((a, b) => a.meters - b.meters)
            .slice(0, 5)
        : [],
    [here, active],
  )
  const groups = useMemo(() => {
    const map = new Map<string, Board[]>()
    for (const b of active) map.set(b.area, [...(map.get(b.area) ?? []), b])
    return [...map.entries()]
  }, [active])
  const selected = value.map((v) => byId.get(v)).filter((b): b is Board => Boolean(b))

  const toggle = (boardId: number) => onChange(value.includes(boardId) ? value.filter((v) => v !== boardId) : [...value, boardId])

  const item = (b: Board, group: string, note?: string) => (
    <CommandItem
      key={`${group}-${b.id}`}
      value={`${group} ${b.name} ${b.building} ${b.tag} ${b.area}`}
      data-checked={value.includes(b.id)}
      onSelect={() => toggle(b.id)}
      className="gap-2.5 py-2"
    >
      <BoardTag code={b.tag} state={value.includes(b.id) ? "top" : "idle"} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{b.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {note ?? (recById.get(b.id)?.reason || [b.building, b.floor && `Floor ${b.floor}`].filter(Boolean).join(" · "))}
        </span>
      </span>
      {recById.has(b.id) && <TierBadge tier={recById.get(b.id)!.tier} />}
    </CommandItem>
  )

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-invalid={invalid}
              className="h-10 w-full justify-between font-normal text-muted-foreground aria-invalid:border-destructive sm:w-auto sm:flex-1"
            >
              {value.length ? `${value.length} board${value.length === 1 ? "" : "s"} selected; add more` : "Search boards by name or building"}
              <ChevronsUpDownIcon data-icon="inline-end" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-(--radix-popover-trigger-width) min-w-80 p-0" align="start">
            <Command>
              <CommandInput placeholder="Coffman, library, KEL…" />
              <CommandList className="max-h-80">
                <CommandEmpty>No board matches. Try a building name.</CommandEmpty>
                {nearest.length > 0 && (
                  <CommandGroup heading="Nearest to you">{nearest.map(({ board, meters }) => item(board, "near", `${formatDistance(meters)} away · ${board.building}`))}</CommandGroup>
                )}
                {recommended.length > 0 && <CommandGroup heading="Recommended for this event">{recommended.map((b) => item(b, "rec"))}</CommandGroup>}
                {recent.length > 0 && <CommandGroup heading="Recently used">{recent.map((b) => item(b, "recent"))}</CommandGroup>}
                {groups.map(([area, items]) => (
                  <CommandGroup key={area} heading={area}>
                    {items.map((b) => item(b, area))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button type="button" variant="outline" className="h-10" onClick={findNearMe} disabled={locating}>
            {locating ? <Spinner data-icon="inline-start" /> : <LocateFixedIcon data-icon="inline-start" />}
            Near me
          </Button>
          <Button type="button" variant="outline" className="h-10" onClick={() => setMapOpen(true)}>
            <MapIcon data-icon="inline-start" />
            Pick on map
          </Button>
        </div>
      </div>
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Selected boards">
          {selected.map((b) => (
            <li key={b.id} className="flex items-center gap-2 rounded-md border bg-secondary py-1 pr-1 pl-1.5 text-sm">
              <BoardTag code={b.tag} state="top" />
              <span className="max-w-56 truncate font-semibold">{b.name}</span>
              <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${b.name}`} onClick={() => toggle(b.id)}>
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <MapPickerDialog open={mapOpen} onOpenChange={setMapOpen} boards={active} value={value} onChange={onChange} />
    </div>
  )
}

/** "Strong pick" / "Good pick": a recommendation's tier, never a number. */
export function TierBadge({ tier }: { tier: BoardRecommendation["tier"] }) {
  return tier === "strong" ? (
    <Badge className="shrink-0 bg-highlight text-highlight-foreground">Strong pick</Badge>
  ) : (
    <Badge variant="outline" className="shrink-0 border-primary/40 text-primary">
      Good pick
    </Badge>
  )
}

type MapPickerDialogProps = { open: boolean; onOpenChange: (open: boolean) => void; boards: Board[]; value: number[]; onChange: (ids: number[]) => void }

function MapPickerDialog({ open, onOpenChange, boards, value, onChange }: MapPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(90dvh,48rem)] max-w-[min(64rem,calc(100%-2rem))] flex-col gap-4 sm:max-w-[min(64rem,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle>Pick boards on the map</DialogTitle>
          <DialogDescription>Select a tag to add that board; select it again to remove it. Gold tags are selected.</DialogDescription>
        </DialogHeader>
        {open && <PickerMap boards={boards} value={value} onChange={onChange} />}
        <DialogFooter className="items-center sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {value.length} board{value.length === 1 ? "" : "s"} selected
          </span>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PickerMap({ boards, value, onChange }: { boards: Board[]; value: number[]; onChange: (ids: number[]) => void }) {
  const config = useConfig()
  const { ref, map } = useLeafletMap()
  // Map click handlers outlive renders; they read the latest selection and handler from refs.
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    valueRef.current = value
    onChangeRef.current = onChange
  })
  const markers = useRef(new Map<number, L.Marker>())
  const cluster = useRef<L.MarkerClusterGroup | null>(null)

  // Draw every active board once and fit them; selection only swaps icons. Tags that would
  // overlap cluster under one board's tag ("JON1 +2"; a selected board's, in gold, if any);
  // selecting a cluster zooms in until every tag stands alone.
  useEffect(() => {
    if (!map) return
    // The dialog animates in; measure the map once it has its final size.
    const resize = setTimeout(() => map.invalidateSize(), 220)
    const group = L.markerClusterGroup({
      maxClusterRadius: 44,
      disableClusteringAtZoom: 19,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (c) => {
        const children = c.getAllChildMarkers()
        const selected = valueRef.current.map((id) => markers.current.get(id)).filter((m): m is L.Marker => !!m && children.includes(m))
        // Lead with a selected board, so a selection is never hidden under another board's tag.
        const lead = selected[0] ?? children[0]
        return L.divIcon({
          className: "cp-pin-icon",
          html: tagHtml(lead.options.tag ?? "", null, selected.length ? "top" : "idle", { pin: true, more: children.length - 1 }),
          iconSize: [0, 0],
        })
      },
    })
    cluster.current = group
    for (const b of boards) {
      const marker = L.marker([b.latitude, b.longitude], {
        icon: tagIcon(b.tag, null, "idle"),
        title: b.name,
        alt: b.name,
        riseOnHover: true,
        tag: b.tag,
      })
      marker.bindTooltip(b.name, { direction: "top", offset: [0, -30] })
      marker.on("click", () => {
        const current = valueRef.current
        onChangeRef.current(current.includes(b.id) ? current.filter((v) => v !== b.id) : [...current, b.id])
      })
      group.addLayer(marker)
      markers.current.set(b.id, marker)
    }
    map.addLayer(group)
    const center = L.latLng(config.center)
    const near = boards.filter((b) => center.distanceTo([b.latitude, b.longitude]) <= config.default_radius_meters)
    const shown = near.length ? near : boards
    if (shown.length) fitWithDetail(map, shown.map((b): L.LatLngTuple => [b.latitude, b.longitude]), { padding: 16, maxZoom: 18 })
    const drawn = markers.current
    return () => {
      clearTimeout(resize)
      map.removeLayer(group)
      cluster.current = null
      drawn.clear()
    }
  }, [map, boards, config])

  useEffect(() => {
    for (const b of boards) {
      const isOn = value.includes(b.id)
      markers.current.get(b.id)?.setIcon(tagIcon(b.tag, null, isOn ? "top" : "idle", isOn))
      markers.current.get(b.id)?.setZIndexOffset(isOn ? 500 : 0)
    }
    cluster.current?.refreshClusters()
  }, [value, boards, map])

  return <div ref={ref} className={cn("isolate min-h-0 flex-1 overflow-hidden rounded-lg ring-1 ring-border")} role="region" aria-label="Map of boards to pick from" />
}
