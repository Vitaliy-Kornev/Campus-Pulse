import { useEffect } from "react"

import { useLeafletMap } from "@/hooks/use-leaflet-map"
import { useConfig } from "@/hooks/use-session"
import { escapeHtml, featureLatLng, L, scanColor, scanRadius, topThreshold } from "@/lib/map"
import type { BoardFeature } from "@/lib/types"

/** Small map of the boards a campaign is on, sized and colored by scans. */
export function CampaignMap({ features }: { features: BoardFeature[] | undefined }) {
  const config = useConfig()
  const { ref, map } = useLeafletMap({ scrollWheelZoom: false })

  useEffect(() => {
    if (!map || !features) return
    const shown = features.filter((f) => f.properties.active_flyer_count > 0 || f.properties.total_scans > 0)
    const counts = shown.map((f) => f.properties.total_scans)
    const top = topThreshold(counts)
    const max = Math.max(0, ...counts)

    const layer = L.featureGroup(
      shown.map((f) => {
        const p = f.properties
        const marker = L.circleMarker(featureLatLng(f), {
          radius: scanRadius(p.total_scans),
          color: "#fff",
          weight: 1.5,
          fillColor: scanColor(p.total_scans, top, max),
          fillOpacity: 0.85,
        })
        const links = p.flyers
          .map(
            (fl) =>
              `<a href="/flyers/${encodeURIComponent(fl.slug)}" data-nav="/flyers/${encodeURIComponent(fl.slug)}" class="text-primary underline-offset-4 hover:underline">${escapeHtml(fl.label || fl.slug)}</a> · ${fl.scans}`,
          )
          .join("<br>")
        marker.bindPopup(
          `<div class="font-semibold">${escapeHtml(p.name)}</div><div>${p.total_scans} scans · ${p.unique_scans} unique</div>${links ? `<div class="mt-1">${links}</div>` : ""}`,
        )
        return marker
      }),
    ).addTo(map)

    if (shown.length) map.fitBounds(layer.getBounds(), { padding: [25, 25], maxZoom: 17 })
    else map.setView(config.center, config.zoom)
    return () => {
      layer.remove()
    }
  }, [map, features, config])

  return <div ref={ref} className="isolate h-72 overflow-hidden rounded-lg" role="region" aria-label="Map of this campaign's boards" />
}
