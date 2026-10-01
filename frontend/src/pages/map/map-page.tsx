import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ChevronDownIcon, MapPinPlusIcon, SlidersHorizontalIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"

import { DateRangeFilter } from "@/components/date-range-filter"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldLabel, FieldTitle } from "@/components/ui/field"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useLeafletMap } from "@/hooks/use-leaflet-map"
import { useConfig, useUser } from "@/hooks/use-session"
import { api, withQuery } from "@/lib/api"
import { formatNumber } from "@/lib/format"
import { COLORS, featureLatLng, L, scanColor, scanRadius, spreadOverlaps, topThreshold } from "@/lib/map"
import { rangeLabel, rangeParams, type DateRange } from "@/lib/range"
import type { BoardCollection, BoardProperties } from "@/lib/types"
import { cn } from "@/lib/utils"
import { campaignsQuery } from "@/pages/campaigns/campaign-list"
import { popupHtml, tooltipText } from "@/pages/map/popup"

type Mode = "markers" | "heatmap"
const ALL = "all"

/** Three looks: scanned boards sized and colored by scans; flyers but no scans are slate; no flyers are maroon. */
function markerStyle(p: BoardProperties, top: number, max: number): L.CircleMarkerOptions {
  const base = { scans: p.total_scans }
  if (!p.is_active) return { ...base, radius: 5, stroke: false, fillColor: COLORS.retired, fillOpacity: 0.55 }
  if (p.active_flyer_count === 0 && p.total_scans === 0) return { ...base, radius: 7, stroke: false, fillColor: COLORS.noFlyers, fillOpacity: 0.9 }
  if (p.total_scans === 0) return { ...base, radius: 8, color: "#fff", weight: 2.5, fillColor: COLORS.noScans, fillOpacity: 1 }
  return { ...base, radius: scanRadius(p.total_scans), color: "#fff", weight: 2, fillColor: scanColor(p.total_scans, top, max), fillOpacity: 0.9 }
}

export function MapPage() {
  const config = useConfig()
  const user = useUser()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const campaign = params.get("campaign") ?? ALL
  const [range, setRange] = useState<DateRange>({ range: "all", start: "", end: "" })
  const [area, setArea] = useState(ALL)
  const [mode, setMode] = useState<Mode>("markers")
  const [addMode, setAddMode] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [rankingOpen, setRankingOpen] = useState(() => !window.matchMedia("(max-width: 767px)").matches)

  const campaigns = useQuery(campaignsQuery)
  const query = { ...rangeParams(range), campaign: campaign === ALL ? undefined : campaign }
  const geojson = useQuery({
    queryKey: ["geojson", query],
    queryFn: () => api<BoardCollection>(withQuery("boards.geojson", query)),
    placeholderData: keepPreviousData,
  })

  const features = useMemo(() => (geojson.data ? spreadOverlaps(geojson.data.features) : []), [geojson.data])
  const stats = useMemo(() => {
    const counts = features.map((f) => f.properties.total_scans)
    return { top: topThreshold(counts), max: Math.max(0, ...counts) }
  }, [features])
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

  // --- Map and layers ---------------------------------------------------------

  const { ref, map } = useLeafletMap({ zoomControl: false })
  const cluster = useRef<L.MarkerClusterGroup | null>(null)
  const markersById = useRef(new Map<number, L.CircleMarker>())
  const statsRef = useRef(stats)
  statsRef.current = stats
  const pendingFocus = useRef<number | null>(null)

  useEffect(() => {
    if (!map) return
    L.control.zoom({ position: "bottomright" }).addTo(map)
    // Only markers that truly overlap cluster together; clicking spreads them out.
    cluster.current = L.markerClusterGroup({
      maxClusterRadius: 14,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: (c) => {
        const children = c.getAllChildMarkers() as unknown as L.CircleMarker[]
        const scans = children.reduce((sum, m) => sum + (m.options.scans ?? 0), 0)
        const size = Math.round(scanRadius(scans) * 2 + 6)
        const color = scanColor(scans, statsRef.current.top, statsRef.current.max)
        return L.divIcon({
          html: `<div class="cp-cluster" style="width:${size}px;height:${size}px;background:${color}">${children.length}</div>`,
          className: "",
          iconSize: [size, size],
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
    const bind = (layer: L.Layer, p: BoardProperties) =>
      layer
        .bindPopup(() => popupHtml(p, user.is_staff), { maxWidth: 300 })
        .bindTooltip(tooltipText(p), { direction: "top", offset: [0, -4] })

    markersById.current.clear()
    if (mode === "heatmap") {
      const max = Math.max(1, stats.max)
      const points = features.filter((f) => f.properties.total_scans > 0).map((f): L.HeatLatLng => {
          const [lat, lng] = featureLatLng(f)
          return [lat, lng, f.properties.total_scans / max]
        })
      const heat = L.heatLayer(points, { radius: 35, blur: 25, maxZoom: 17, max: 1, minOpacity: 0.3 }).addTo(map)
      // Keep every board's location visible on top of the heat.
      const dots = L.layerGroup(
        features.map((f) =>
          bind(
            L.circleMarker(featureLatLng(f), { radius: 5, stroke: false, fillOpacity: 0.9, fillColor: f.properties.is_active ? COLORS.noFlyers : COLORS.retired }),
            f.properties,
          ),
        ),
      ).addTo(map)
      return () => {
        heat.remove()
        dots.remove()
      }
    }

    const markers = features.map((f) => {
      const marker = L.circleMarker(featureLatLng(f), markerStyle(f.properties, stats.top, stats.max))
      bind(marker, f.properties)
      markersById.current.set(f.properties.id, marker)
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
  }, [map, features, stats, mode, user.is_staff])

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
    else map.fitBounds(L.latLngBounds(shown.map(featureLatLng)), { padding: [30, 30], maxZoom: 17 })
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
    if (mode !== "markers") {
      pendingFocus.current = id
      setMode("markers")
    } else {
      focusBoard(id)
    }
  }

  // --- Filters -----------------------------------------------------------------

  const campaignName = campaign === ALL ? (user.is_staff ? "All campaigns" : "All my campaigns") : (campaigns.data?.find((c) => String(c.id) === campaign)?.name ?? "Campaign")

  const filters = (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
      <Field className="w-full md:w-56">
        <FieldLabel htmlFor="map-campaign" className="text-xs text-muted-foreground">
          Campaign
        </FieldLabel>
        <Select
          value={campaign}
          onValueChange={(value) =>
            setParams(
              (current) => {
                const next = new URLSearchParams(current)
                if (value === ALL) next.delete("campaign")
                else next.set("campaign", value)
                return next
              },
              { replace: true },
            )
          }
        >
          <SelectTrigger id="map-campaign" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL}>{user.is_staff ? "All campaigns" : "All my campaigns"}</SelectItem>
              {campaigns.data
                ?.slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                    {user.is_staff && <span className="text-muted-foreground">({c.owner})</span>}
                  </SelectItem>
                ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <DateRangeFilter value={range} onChange={setRange} idPrefix="map-range" />
      <Field className="w-full md:w-36">
        <FieldLabel htmlFor="map-area" className="text-xs text-muted-foreground">
          Area
        </FieldLabel>
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger id="map-area" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL}>All</SelectItem>
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
        <FieldTitle id="map-view-label" className="text-xs text-muted-foreground">
          View
        </FieldTitle>
        <ToggleGroup type="single" variant="outline" spacing={0} value={mode} onValueChange={(v) => v && setMode(v as Mode)} aria-labelledby="map-view-label">
          <ToggleGroupItem value="markers">Markers</ToggleGroupItem>
          <ToggleGroupItem value="heatmap">Heatmap</ToggleGroupItem>
        </ToggleGroup>
      </Field>
      <Button variant={addMode ? "secondary" : "outline"} onClick={() => setAddMode((on) => !on)} aria-pressed={addMode} className="w-fit">
        <MapPinPlusIcon data-icon="inline-start" />
        Add board
      </Button>
      <div className="flex items-center gap-3 text-xs text-muted-foreground md:ml-auto" aria-live="polite">
        {geojson.isError ? (
          <span className="text-destructive">Couldn't load boards. Check your connection.</span>
        ) : (
          <>
            <span>
              <b className="font-mono text-foreground">{formatNumber(totals.total)}</b> scans
            </span>
            <span>
              <b className="font-mono text-foreground">{formatNumber(totals.unique)}</b> unique
            </span>
            <span>
              <b className="font-mono text-foreground">{formatNumber(totals.flyers)}</b> active flyers
            </span>
          </>
        )}
      </div>
    </div>
  )

  return (
    <>
      <div className="relative z-10 border-b bg-card">
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="md:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-2">
            <span className="truncate text-sm font-medium">
              {campaignName} · {rangeLabel(range.range)}
            </span>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm">
                <SlidersHorizontalIcon data-icon="inline-start" />
                Filters
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="px-4 pb-4">{filters}</CollapsibleContent>
        </Collapsible>
        <div className="hidden px-4 py-2 md:block">{filters}</div>
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

        <Card size="sm" className="absolute top-3 right-3 z-[1000] w-72 max-w-[calc(100%-1.5rem)] gap-0 py-0 shadow-lg">
          <Collapsible open={rankingOpen} onOpenChange={setRankingOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold">
              Top boards
              <ChevronDownIcon className={cn("size-4 transition-transform", !rankingOpen && "-rotate-90")} aria-hidden />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="max-h-[50vh] border-t">
                {ranking.length ? (
                  <ol className="text-sm">
                    {ranking.map((f, i) => (
                      <li key={f.properties.id}>
                        <button
                          type="button"
                          onClick={() => showRanked(f.properties.id)}
                          className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-muted"
                        >
                          <span className="w-5 font-mono text-muted-foreground tabular-nums">{i + 1}</span>
                          <span className="flex-1 truncate">{f.properties.name}</span>
                          <span className="font-mono font-medium tabular-nums">{formatNumber(f.properties.total_scans)}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="px-4 py-3 text-sm text-muted-foreground">{geojson.isPending ? "Loading…" : "No scans for this filter yet."}</p>
                )}
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        <Card size="sm" className="absolute bottom-6 left-3 z-[1000] gap-1 px-3 py-2 text-xs text-muted-foreground shadow-md" aria-label="Legend">
          <LegendItem color={COLORS.top}>Top 20% of boards</LegendItem>
          <LegendItem color={`rgb(${COLORS.many.join(",")})`}>More scans</LegendItem>
          <LegendItem color={`rgb(${COLORS.few.join(",")})`}>Fewer scans</LegendItem>
          <LegendItem color={COLORS.noScans} ring>
            Flyers, no scans yet
          </LegendItem>
          <LegendItem color={COLORS.noFlyers}>Board with no flyers</LegendItem>
          {user.is_staff && <LegendItem color={COLORS.retired}>Retired (admins only)</LegendItem>}
        </Card>
      </div>
    </>
  )
}

function LegendItem({ color, ring, children }: { color: string; ring?: boolean; children: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("inline-block size-3 rounded-full", ring && "ring-2 ring-white")} style={{ background: color }} aria-hidden />
      {children}
    </div>
  )
}
