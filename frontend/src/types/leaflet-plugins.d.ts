import "leaflet"

declare module "leaflet" {
  type HeatLatLng = [number, number, number]

  interface HeatLayerOptions {
    minOpacity?: number
    maxZoom?: number
    max?: number
    radius?: number
    blur?: number
    gradient?: Record<number, string>
  }

  function heatLayer(latlngs: HeatLatLng[], options?: HeatLayerOptions): Layer

  interface MarkerOptions {
    /** Read back when labelling a cluster with its busiest board's tag. */
    scans?: number
    tag?: string
    tagCountText?: string | null
    tagState?: import("@/lib/board-tag").TagState
  }
}

declare module "leaflet.heat"
