import { useEffect } from "react"

import { useLeafletMap } from "@/hooks/use-leaflet-map"
import { useConfig, useUser } from "@/hooks/use-session"
import { tagCount } from "@/lib/board-tag"
import { featureLatLng, featureState, L, leaderScans, tagIcon } from "@/lib/map"
import type { BoardFeature } from "@/lib/types"
import { popupHtml } from "@/pages/map/popup"

/** The boards an event is on, each as its sign tag with the scans in the selected range. */
export function EventMap({ features, className }: { features: BoardFeature[] | undefined; className?: string }) {
  const config = useConfig()
  const user = useUser()
  const { ref, map } = useLeafletMap({ scrollWheelZoom: false })

  useEffect(() => {
    if (!map || !features) return
    const shown = features.filter((f) => f.properties.active_flyer_count > 0 || f.properties.total_scans > 0)
    const top = leaderScans(shown.map((f) => f.properties.total_scans))

    const layer = L.featureGroup(
      shown.map((f) => {
        const p = f.properties
        const state = featureState(p, top)
        return L.marker(featureLatLng(f), {
          icon: tagIcon(p.tag, tagCount(p.total_scans), state),
          title: `${p.name}: ${p.total_scans} scans`,
          alt: p.name,
          riseOnHover: true,
          zIndexOffset: p.total_scans,
        }).bindPopup(() => popupHtml(p, user.is_staff, state), { maxWidth: 320, offset: [0, -30] })
      }),
    ).addTo(map)

    if (shown.length) map.fitBounds(layer.getBounds(), { padding: [48, 48], maxZoom: 17 })
    else map.setView(config.center, config.zoom)
    return () => {
      layer.remove()
    }
  }, [map, features, config, user.is_staff])

  return <div ref={ref} className={className ?? "isolate h-80 overflow-hidden rounded-lg"} role="region" aria-label="Map of this event's boards" />
}
