import { useEffect } from "react"

import { useLeafletMap } from "@/hooks/use-leaflet-map"
import { useConfig, useUser } from "@/hooks/use-session"
import { tagCount } from "@/lib/board-tag"
import { DETAIL_ZOOM, featureLatLng, featureState, fitWithDetail, L, leaderScans, tagIcon } from "@/lib/map"
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

    if (shown.length) fitWithDetail(map, [layer.getBounds().getSouthWest(), layer.getBounds().getNorthEast()])
    else map.setView(config.center, Math.max(config.zoom, DETAIL_ZOOM))
    return () => {
      layer.remove()
    }
  }, [map, features, config, user.is_staff])

  return <div ref={ref} className={className ?? "isolate h-80 overflow-hidden rounded-lg"} role="region" aria-label="Map of this event's boards" />
}
