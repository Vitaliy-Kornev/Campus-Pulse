import L from "leaflet"
import "leaflet.markercluster"
import "leaflet.heat"

import { tagHtml, type TagState } from "@/lib/board-tag"
import type { AppConfig, BoardFeature } from "@/lib/types"

export { L }

export const COLORS = {
  maroon: "#7a0019",
  gold: "#ffcc33",
  empty: "#8a847e",
  retired: "#c9c4be",
}

/**
 * The map data only has buildings from this zoom in, so no view opens further out than this:
 * officers should see the buildings their boards are in without zooming.
 */
export const DETAIL_ZOOM = 15

/**
 * Fit these points in view, but never zoom out past DETAIL_ZOOM. If they don't all fit, center on
 * `center` (default: their middle) at DETAIL_ZOOM; zooming out shows the rest.
 */
export function fitWithDetail(
  map: L.Map,
  points: L.LatLngExpression[],
  { padding = 48, maxZoom = 17, center }: { padding?: number; maxZoom?: number; center?: L.LatLngExpression } = {},
) {
  const bounds = L.latLngBounds(points)
  const zoom = Math.min(map.getBoundsZoom(bounds, false, L.point(padding * 2, padding * 2)), maxZoom)
  if (zoom >= DETAIL_ZOOM) map.fitBounds(bounds, { padding: [padding, padding], maxZoom })
  else map.setView(center ?? bounds.getCenter(), DETAIL_ZOOM)
}

/**
 * Amazon's style fades buildings in one by one and keeps outlines invisible until zoom 17, so at
 * the opening zoom (15) most buildings are missing. Show every building the data has, with its
 * outline, from DETAIL_ZOOM. (MapLibre counts zoom one lower than Leaflet: its 512px tiles.)
 */
function showBuildingsEarly(gl: import("maplibre-gl").Map) {
  const from = DETAIL_ZOOM - 1
  for (const layer of gl.getStyle().layers) {
    if (!("source-layer" in layer) || layer["source-layer"] !== "buildings") continue
    if (layer.id === "building_fill" && layer.type === "fill") {
      gl.setPaintProperty(layer.id, "fill-opacity", ["interpolate", ["linear"], ["zoom"], from - 0.5, 0, from, 1])
    } else if (layer.type === "line") {
      gl.setLayerZoomRange(layer.id, from - 0.5, 24)
      gl.setPaintProperty(layer.id, "line-opacity", ["interpolate", ["linear"], ["zoom"], from - 0.5, 0, from, 0.7, from + 2, 0.8])
      gl.setPaintProperty(layer.id, "line-blur", 0)
    }
  }
}

/** Whether this browser can draw vector maps. Some old phones and locked-down computers can't. */
function supportsWebGL2(): boolean {
  try {
    return !!document.createElement("canvas").getContext("webgl2")
  } catch {
    return false
  }
}

/** The street map under the board tags: Amazon Location's vector map, or raster tiles locally. */
export function addTiles(map: L.Map, config: AppConfig["tiles"]) {
  const tiles = config.kind === "vector" && !supportsWebGL2() ? config.fallback : config
  map.setMaxZoom(tiles.max_zoom)
  if (tiles.kind === "raster") {
    L.tileLayer(tiles.url, { maxZoom: tiles.max_zoom, attribution: tiles.attribution }).addTo(map)
    return
  }
  const fallBack = () => {
    map.setMaxZoom(tiles.fallback.max_zoom)
    L.tileLayer(tiles.fallback.url, { maxZoom: tiles.fallback.max_zoom, attribution: tiles.fallback.attribution }).addTo(map)
  }
  // MapLibre draws the vector map; it only downloads on pages with a map.
  void Promise.all([
    import("@maplibre/maplibre-gl-leaflet"),
    import("maplibre-gl"),
    // MapLibre parses tiles in a web worker; Vite bundles it into one file and gives its address.
    import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"),
    import("maplibre-gl/dist/maplibre-gl.css"),
  ]).then(([plugin, maplibre, worker]) => {
    if (!map.getContainer().isConnected) return // the page closed while it loaded
    maplibre.setWorkerUrl(worker.default)
    const layer = plugin.maplibreGL({ style: tiles.style_url })
    try {
      layer.addTo(map)
    } catch {
      // The browser said it could draw vector maps but couldn't (e.g. graphics turned off).
      map.removeLayer(layer)
      fallBack()
      return
    }
    // Credit the map data as the style asks (Amazon Location requires its attribution shown).
    const gl = layer.getMaplibreMap()
    gl.once("load", () => {
      showBuildingsEarly(gl)
      const credits = new Set<string>()
      for (const source of Object.values(gl.getStyle().sources)) {
        if ("attribution" in source && source.attribution) credits.add(source.attribution)
      }
      credits.forEach((credit) => map.attributionControl?.addAttribution(credit))
    })
  }, fallBack)
}

/** The busiest board's scan count (0 when nothing has been scanned). Gold marks that board alone. */
export function leaderScans(counts: number[]): number {
  return Math.max(0, ...counts)
}

/** Which sign-tag state a board on the map is in. */
export function featureState(p: BoardFeature["properties"], top: number): TagState {
  if (!p.is_active) return "retired"
  if (p.total_scans > 0) return top && p.total_scans >= top ? "top" : "scanned"
  return p.active_flyer_count > 0 ? "idle" : "empty"
}

/** A sign tag as a Leaflet marker icon, anchored at the tip of its pointer. */
export function tagIcon(code: string, count: string | number | null, state: TagState, selected = false): L.DivIcon {
  return L.divIcon({
    className: "cp-pin-icon",
    html: tagHtml(code, count, state, { pin: true, selected }),
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

export const featureLatLng = (f: BoardFeature): L.LatLngTuple => [f.geometry.coordinates[1], f.geometry.coordinates[0]]

/** Boards with identical coordinates get a small circular offset so each tag stays clickable. */
export function spreadOverlaps(features: BoardFeature[]): BoardFeature[] {
  const groups = new Map<string, BoardFeature[]>()
  for (const f of features) {
    const [lng, lat] = f.geometry.coordinates
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`
    groups.set(key, [...(groups.get(key) ?? []), f])
  }
  return features.map((f) => {
    const [lng, lat] = f.geometry.coordinates
    const group = groups.get(`${lat.toFixed(5)},${lng.toFixed(5)}`)!
    if (group.length < 2) return f
    const angle = (2 * Math.PI * group.indexOf(f)) / group.length
    return { ...f, geometry: { ...f.geometry, coordinates: [lng + Math.cos(angle) * 0.00012, lat + Math.sin(angle) * 0.00009] } }
  })
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

/**
 * Popups are plain HTML. Links inside them carry data-nav="/path"; the map page intercepts
 * clicks on those and routes inside the app instead of reloading the page.
 */
export function handlePopupNavigation(container: HTMLElement, navigate: (to: string) => void) {
  const onClick = (event: MouseEvent) => {
    const link = (event.target as HTMLElement).closest<HTMLElement>("[data-nav]")
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return
    event.preventDefault()
    navigate(link.dataset.nav!)
  }
  // Capture phase, so Leaflet's own handlers can't stop the click before it reaches us.
  container.addEventListener("click", onClick, true)
  return () => container.removeEventListener("click", onClick, true)
}
