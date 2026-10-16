import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"

import { useConfig } from "@/hooks/use-session"
import { addTiles, DETAIL_ZOOM, handlePopupNavigation, L } from "@/lib/map"

/**
 * Create a Leaflet map in the returned ref's element once, with the campus tiles and view.
 * Links in popups with data-nav route inside the app. The map is removed on unmount.
 */
export function useLeafletMap(options: L.MapOptions = {}) {
  const config = useConfig()
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<L.Map | null>(null)
  const optionsRef = useRef(options)

  useEffect(() => {
    if (!ref.current) return
    const instance = L.map(ref.current, optionsRef.current).setView(config.center, Math.max(config.zoom, DETAIL_ZOOM))
    addTiles(instance, config.tiles)
    const stopNavigation = handlePopupNavigation(ref.current, navigate)
    setMap(instance)
    return () => {
      stopNavigation()
      instance.remove()
      setMap(null)
    }
  }, [config, navigate])

  return { ref, map }
}
