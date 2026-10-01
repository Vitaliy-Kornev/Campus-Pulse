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

  interface CircleMarkerOptions {
    /** Scan count, read back when sizing and coloring marker clusters. */
    scans?: number
  }
}

declare module "leaflet.heat"
