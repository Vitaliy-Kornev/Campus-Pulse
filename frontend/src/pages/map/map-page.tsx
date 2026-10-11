import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ArrowUpRightIcon, ChevronDownIcon, MapPinPlusIcon, MegaphoneIcon, SlidersHorizontalIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"

import { BoardTag } from "@/components/board-tag"
import { DateRangeFilter } from "@/components/date-range-filter"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useLeafletMap } from "@/hooks/use-leaflet-map"
import { useConfig, useUser } from "@/hooks/use-session"
import { api, withQuery } from "@/lib/api"
import { tagCount, tagHtml, type TagState } from "@/lib/board-tag"
import { formatNumber } from "@/lib/format"
import { COLORS, featureLatLng, featureState, L, leaderScans, spreadOverlaps, tagIcon } from "@/lib/map"
import { rangeLabel, rangeParams, type DateRange } from "@/lib/range"
import type { BoardCollection, BoardFeature } from "@/lib/types"
import { cn } from "@/lib/utils"
import { eventsQuery } from "@/pages/events/event-list"
import { popupHtml } from "@/pages/map/popup"

type Mode = "markers" | "heatmap"

/** Popups pan clear of the Top boards panel (top right on desktop, a strip across the top on phones). */
function popupOptions(): L.PopupOptions {
  const desktop = window.matchMedia("(min-width: 768px)").matches
  return {
    maxWidth: 320,
    offset: [0, -30],
    autoPanPaddingTopLeft: desktop ? [24, 24] : [12, 72],
    autoPanPaddingBottomRight: desktop ? [420, 24] : [12, 24],
  }
}
const ALL = "all"

/** Tag count text: scans for boards that have flyers or scans; nothing for empty or retired boards. */
function tagCountFor(p: BoardFeature["properties"], state: TagState): string | null {
  if (state === "empty" || state === "retired") return null
  return tagCount(p.total_scans)
}

export function MapPage() {
  const config = useConfig()
  const user = useUser()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const event = params.get("event") ?? ALL
  const [range, setRange] = useState<DateRange>({ range: "all", start: "", end: "" })
  const [area, setArea] = useState(ALL)
  const [mode, setMode] = useState<Mode>("markers")
  const [addMode, setAddMode] = useState(false)
  const [rankingOpen, setRankingOpen] = useState(() => !window.matchMedia("(max-width: 767px)").matches)
  const [legendOpen, setLegendOpen] = useState(() => !window.matchMedia("(max-width: 767px)").matches)

  const events = useQuery(eventsQuery)
  const query = { ...rangeParams(range), event: event === ALL ? undefined : event }
  const geojson = useQuery({
    queryKey: ["geojson", query],
    queryFn: () => api<BoardCollection>(withQuery("boards.geojson", query)),
    placeholderData: keepPreviousData,
  })

  const features = useMemo(() => (geojson.data ? spreadOverlaps(geojson.data.features) : []), [geojson.data])
  const top = useMemo(() => leaderScans(features.filter((f) => f.properties.is_active).map((f) => f.properties.total_scans)), [features])
  const areas = useMemo(() => [...new Set(features.filter((f) => f.properties.is_active).map((f) => f.properties.area))].sort(), [features])
  const visible = useMemo(() => features.filter((f) => area === ALL || f.properties.area === area), [features, area])
  const ranking = useMemo(
    () =>
      visible
        .filter((f) => f.properties.is_active && f.properties.total_scans > 0)
        .sort((a, b) => b.properties.total_scans - a.properties.total_scans)
        .slice(0, 10),
    [visible],
  )
  const totals = useMemo(
    () =>
      features.reduce(
        (sum, f) => ({
          total: sum.total + f.properties.total_scans,
          unique: sum.unique + f.properties.unique_scans,
          flyers: sum.flyers + f.properties.active_flyer_count,
        }),
        { total: 0, unique: 0, flyers: 0 },
      ),
    [features],
  )
  const isNewOrganizer = !user.is_staff && events.data?.length === 0

  // --- Map and layers ---------------------------------------------------------

  const { ref, map } = useLeafletMap({ zoomControl: false })
  const cluster = useRef<L.MarkerClusterGroup | null>(null)
  const markersById = useRef(new Map<number, L.Marker>())
  const pendingFocus = useRef<number | null>(null)

  useEffect(() => {
    if (!map) return
    L.control.zoom({ position: "bottomright" }).addTo(map)
    // Tags that would overlap cluster together. A cluster still reads as a place: its busiest
    // board's own tag and count, plus how many more boards are tucked under it ("CMU 525 +2").
    cluster.current = L.markerClusterGroup({
      maxClusterRadius: 64,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: (c) => {
        const children = c.getAllChildMarkers()
        const lead = children.reduce((best, m) => ((m.options.scans ?? 0) > (best.options.scans ?? 0) ? m : best), children[0])
        const o = lead.options
        return L.divIcon({
          className: "cp-pin-icon",
          html: tagHtml(o.tag ?? "", o.tagCountText ?? null, o.tagState ?? "idle", { pin: true, more: children.length - 1 }),
          iconSize: [0, 0],
        })
      },
    })
  }, [map])

  function focusBoard(id: number) {
    const marker = markersById.current.get(id)
    if (!marker || !cluster.current || !map) return
    cluster.current.zoomToShowLayer(marker, () => {
      map.panTo(marker.getLatLng())
      marker.openPopup()
    })
  }

  useEffect(() => {
    if (!map || !cluster.current) return
    const group = cluster.current
    markersById.current.clear()

    if (mode === "heatmap") {
      const max = Math.max(1, ...features.map((f) => f.properties.total_scans))
      const points = features
        .filter((f) => f.properties.total_scans > 0)
        .map((f): L.HeatLatLng => {
          const [lat, lng] = featureLatLng(f)
          return [lat, lng, f.properties.total_scans / max]
        })
      const heat = L.heatLayer(points, {
        radius: 38,
        blur: 26,
        maxZoom: 17,
        max: 1,
        minOpacity: 0.3,
        gradient: { 0.2: "#f3d9dd", 0.5: "#c4566a", 0.8: "#7a0019", 1: "#ffcc33" },
      }).addTo(map)
      // Keep every board's location visible on top of the heat: filled if scanned, ringed if not.
      const dots = L.layerGroup(
        features.map((f) => {
          const state = featureState(f.properties, top)
          const filled = state === "scanned" || state === "top"
          return L.circleMarker(featureLatLng(f), {
            radius: 5,
            weight: 2,
            color: state === "retired" ? COLORS.retired : filled ? "#fff" : COLORS.empty,
            fillColor: filled ? COLORS.maroon : "#fff",
            fillOpacity: 1,
          }).bindPopup(() => popupHtml(f.properties, user.is_staff, state), { ...popupOptions(), offset: [0, -4] })
        }),
      ).addTo(map)
      return () => {
        heat.remove()
        dots.remove()
      }
    }

    const markers = features.map((f) => {
      const p = f.properties
      const state = featureState(p, top)
      const marker = L.marker(featureLatLng(f), {
        icon: tagIcon(p.tag, tagCountFor(p, state), state),
        title: `${p.name}: ${state === "empty" ? "no flyers" : state === "retired" ? "retired" : `${p.total_scans} scans`}`,
        alt: p.name,
        riseOnHover: true,
        scans: p.total_scans,
        tag: p.tag,
        tagCountText: tagCountFor(p, state),
        tagState: state,
        zIndexOffset: state === "top" ? 600 : state === "scanned" ? 400 : state === "idle" ? 200 : 0,
      })
      marker.bindPopup(() => popupHtml(p, user.is_staff, state), popupOptions())
      markersById.current.set(p.id, marker)
      return marker
    })
    group.addLayers(markers)
    map.addLayer(group)
    if (pendingFocus.current !== null) {
      const id = pendingFocus.current
      pendingFocus.current = null
      setTimeout(() => focusBoard(id), 0)
    }
    return () => {
      group.clearLayers()
      map.removeLayer(group)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, features, top, mode, user.is_staff])

  // Fit the view on first load and whenever the area changes. The default view fits boards
  // near the campus center (both Minneapolis banks); outlying areas appear when selected.
  const fittedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!map || !geojson.data || fittedFor.current === area) return
    fittedFor.current = area
    let shown = visible.filter((f) => f.properties.is_active)
    if (area === ALL) {
      const center = L.latLng(config.center)
      const near = shown.filter((f) => center.distanceTo(featureLatLng(f)) <= config.default_radius_meters)
      if (near.length) shown = near
    }
    if (!shown.length) map.setView(config.center, config.zoom)
    else map.fitBounds(L.latLngBounds(shown.map(featureLatLng)), { padding: [48, 48], maxZoom: 17 })
  }, [map, geojson.data, area, visible, config])

  // "Add board": the next click on the map opens the board form with that spot filled in.
  useEffect(() => {
    if (!map || !addMode) return
    const container = map.getContainer()
    container.style.cursor = "crosshair"
    const onClick = (event: L.LeafletMouseEvent) =>
      navigate(`/boards/new?lat=${event.latlng.lat.toFixed(6)}&lng=${event.latlng.lng.toFixed(6)}`)
    map.on("click", onClick)
    return () => {
      container.style.cursor = ""
      map.off("click", onClick)
    }
  }, [map, addMode, navigate])

  function showRanked(id: number) {
    // On phones the open panel covers most of the map; fold it so the board's popup is visible.
    if (window.matchMedia("(max-width: 767px)").matches) setRankingOpen(false)
    if (mode !== "markers") {
      pendingFocus.current = id
      setMode("markers")
    } else {
      focusBoard(id)
    }
  }

  // --- Filters -----------------------------------------------------------------

  const allLabel = user.is_staff ? "All events" : "All my events"
  const eventName = event === ALL ? allLabel : (events.data?.find((c) => String(c.id) === event)?.name ?? "Event")

  function setEventFilter(value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value === ALL) next.delete("event")
        else next.set("event", value)
        return next
      },
      { replace: true },
    )
  }

  const filterFields = (idPrefix: string) => (
    <>
      <Field className="w-full md:w-56">
        <FieldLabel htmlFor={`${idPrefix}-event`} className="text-xs text-muted-foreground">
          Event
        </FieldLabel>
        <Select value={event} onValueChange={setEventFilter}>
          <SelectTrigger id={`${idPrefix}-event`} className="w-full bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL}>{allLabel}</SelectItem>
              {events.data
                ?.slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                    {user.is_staff && <span className="text-muted-foreground">({c.club})</span>}
                  </SelectItem>
                ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <DateRangeFilter value={range} onChange={setRange} idPrefix={`${idPrefix}-range`} />
      <Field className="w-full md:w-36">
        <FieldLabel htmlFor={`${idPrefix}-area`} className="text-xs text-muted-foreground">
          Area
        </FieldLabel>
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger id={`${idPrefix}-area`} className="w-full bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL}>All areas</SelectItem>
              {areas.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field className="w-auto">
        <FieldTitle id={`${idPrefix}-view-label`} className="text-xs text-muted-foreground">
          View
        </FieldTitle>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={0}
          value={mode}
          onValueChange={(v) => v && setMode(v as Mode)}
          aria-labelledby={`${idPrefix}-view-label`}
          className="bg-card"
        >
          <ToggleGroupItem value="markers" className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            Boards
          </ToggleGroupItem>
          <ToggleGroupItem value="heatmap" className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            Heatmap
          </ToggleGroupItem>
        </ToggleGroup>
      </Field>
    </>
  )

  const totalsLine = (
    <p className="flex items-baseline gap-3 text-sm text-muted-foreground" aria-live="polite">
      {geojson.isError ? (
        <span className="text-destructive">Couldn't load boards. Check your connection.</span>
      ) : (
        <>
          <span>
            <b className="text-base font-extrabold text-foreground">{formatNumber(totals.total)}</b> scans
          </span>
          <span>
            <b className="text-base font-extrabold text-foreground">{formatNumber(totals.unique)}</b> unique
          </span>
          <span>
            <b className="text-base font-extrabold text-foreground">{formatNumber(totals.flyers)}</b> flyers up
          </span>
        </>
      )}
    </p>
  )

  const addBoardButton = (
    <Button
      variant="outline"
      onClick={() => setAddMode((on) => !on)}
      aria-pressed={addMode}
      className={cn("w-fit border-primary text-primary hover:bg-accent hover:text-primary", addMode && "bg-accent")}
    >
      <MapPinPlusIcon data-icon="inline-start" />
      Add board
    </Button>
  )

  return (
    <>
      <a
        href="#top-boards"
        className="sr-only z-50 rounded-md bg-card px-3 py-2 text-sm font-semibold focus:not-sr-only focus:absolute focus:top-16 focus:left-4"
      >
        Skip to top boards
      </a>
      <div className="relative z-10 border-b bg-background">
        {/* Phones: one summary line and a Filters sheet, so the map keeps the screen. */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 md:hidden">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{eventName}</p>
            <p className="text-xs text-muted-foreground">
              {rangeLabel(range.range)} · {formatNumber(totals.total)} scans
            </p>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="bg-card">
                <SlidersHorizontalIcon data-icon="inline-start" />
                Filters
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filter the map</SheetTitle>
                <SheetDescription>Changes apply as you pick.</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-4 px-4 pb-6">
                {filterFields("sheet")}
                {addBoardButton}
              </div>
            </SheetContent>
          </Sheet>
        </div>
        <div className="hidden flex-wrap items-end gap-3 px-6 py-3 md:flex">
          {filterFields("map")}
          {addBoardButton}
          <div className="ml-auto pb-1.5">{totalsLine}</div>
        </div>
      </div>

      <div className="relative isolate min-h-0 flex-1">
        <div ref={ref} className="absolute inset-0" role="region" aria-label="Campus map of poster boards" />

        {addMode && (
          <div className="absolute top-3 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-3 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg">
            Click the map where the new board is
            <button type="button" className="underline underline-offset-4 opacity-80 hover:opacity-100" onClick={() => setAddMode(false)}>
              Cancel
            </button>
          </div>
        )}

        {isNewOrganizer && (
          <div className="absolute inset-x-4 top-4 z-[1000] mx-auto max-w-md rounded-xl bg-card p-5 shadow-[0_10px_28px_rgb(46_44_42/0.2)] md:top-6">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                <MegaphoneIcon className="size-5" aria-hidden />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-bold">Put your first flyer on the map</h2>
                <p className="text-sm text-muted-foreground">
                  Add your first event and the link students should land on, pick boards (we'll recommend some that worked for clubs like yours), print the QR labels, and watch the scans come in here.
                </p>
              </div>
            </div>
            <Button asChild className="mt-4 w-full">
              <Link to="/flyers/new?new=1">Post your first event</Link>
            </Button>
          </div>
        )}

        <TopBoardsPanel
          open={rankingOpen}
          onOpenChange={setRankingOpen}
          rangeText={rangeLabel(range.range)}
          loading={geojson.isPending}
          rows={ranking}
          top={top}
          onSelect={showRanked}
        />

        <Collapsible
          open={legendOpen}
          onOpenChange={setLegendOpen}
          className="absolute bottom-6 left-3 z-[1000] rounded-lg bg-card text-xs shadow-[0_4px_14px_rgb(46_44_42/0.16)] ring-1 ring-foreground/10"
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 px-3 py-2 font-bold tracking-[0.08em] text-muted-foreground uppercase">
            Legend
            <ChevronDownIcon className={cn("size-4 transition-transform", !legendOpen && "-rotate-90")} aria-hidden />
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-2 border-t px-3 pt-2.5 pb-3">
            <LegendItem state="top" count="525">
              Busiest board
            </LegendItem>
            <LegendItem state="scanned" count="86">
              Scanned (number = scans)
            </LegendItem>
            <LegendItem state="idle" count="0">
              Flyers up, no scans yet
            </LegendItem>
            <LegendItem state="empty">No flyers</LegendItem>
            {user.is_staff && <LegendItem state="retired">Retired (admins only)</LegendItem>}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </>
  )
}

function LegendItem({ state, count = null, children }: { state: TagState; count?: string | null; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 font-medium text-foreground">
      <span className="flex w-[4.25rem] shrink-0 justify-start">
        <BoardTag code="ABC" count={count} state={state} className="h-5 text-[10.5px] [&>b]:px-1.5" />
      </span>
      {children}
    </div>
  )
}

type TopBoardsPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  rangeText: string
  loading: boolean
  rows: BoardFeature[]
  top: number
  onSelect: (id: number) => void
}

/** The maroon sign panel: boards ranked by scans, each with its tag and an arrow to find it. */
function TopBoardsPanel({ open, onOpenChange, rangeText, loading, rows, top, onSelect }: TopBoardsPanelProps) {
  return (
    <section
      id="top-boards"
      tabIndex={-1}
      className="absolute top-3 right-3 z-[1000] w-80 max-w-[calc(100%-1.5rem)] overflow-hidden rounded-lg bg-panel text-panel-foreground shadow-[0_12px_32px_rgb(60_0_10/0.28)] md:top-5 md:right-5 md:w-96"
    >
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 bg-card px-4 pt-3 pb-2.5 text-primary">
          <span className="text-sm font-extrabold tracking-[0.12em] uppercase">Top boards</span>
          <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            {rangeText}
            <ChevronDownIcon className={cn("size-4 transition-transform", !open && "-rotate-90")} aria-hidden />
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {rows.length ? (
            <ol className="max-h-[50vh] overflow-y-auto">
              {rows.map((f, i) => {
                const p = f.properties
                const leader = i === 0
                return (
                  <li key={p.id} className={cn("border-t border-white/15 first:border-t-0", leader && "bg-panel-muted")}>
                    <button
                      type="button"
                      onClick={() => onSelect(p.id)}
                      className="grid w-full grid-cols-[3.5rem_1fr_auto_1rem] items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
                    >
                      <BoardTag
                        code={p.tag}
                        state={leader && top ? "top" : "scanned"}
                        className={cn("w-fit", !leader && "border-white bg-white text-primary")}
                      />
                      <span className="truncate text-sm font-semibold">{p.name}</span>
                      <span className="text-base font-extrabold">{formatNumber(p.total_scans)}</span>
                      <ArrowUpRightIcon className={cn("size-4", leader ? "text-highlight" : "text-white/60")} aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="px-4 py-3 text-sm text-white/85">{loading ? "Loading boards…" : "No scans for this filter yet."}</p>
          )}
          <p className="border-t border-white/15 px-4 py-2 text-xs text-white/80">Bot scans excluded. Select a board to find it on the map.</p>
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}
