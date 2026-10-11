import { zodResolver } from "@hookform/resolvers/zod"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { SearchIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { boardsQuery } from "@/components/board-select"
import { FormAlert, SubmitButton } from "@/components/form-alert"
import { ErrorState } from "@/components/query-state"
import { BoardTag } from "@/components/board-tag"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { useLeafletMap } from "@/hooks/use-leaflet-map"
import { useConfig } from "@/hooks/use-session"
import { patch, post } from "@/lib/api"
import { applyServerErrors } from "@/lib/forms"
import { tagHtml, type TagState } from "@/lib/board-tag"
import { escapeHtml, L, tagIcon } from "@/lib/map"
import type { Board } from "@/lib/types"
import { cn } from "@/lib/utils"
import { BOARD_FIELDS, BoardFields, boardBody, boardSchema, emptyBoard, toCoordinate, type BoardValues } from "@/pages/boards/board-fields"

const boardState = (b: Board): TagState => (b.is_active ? "idle" : "retired")

function popupHtml(b: Board) {
  const e = escapeHtml
  const sm = (variant: "default" | "outline" | "ghost") => buttonVariants({ size: "sm", variant })
  return `<div class="flex flex-col gap-3">
    <div class="flex items-start gap-2.5">
      ${tagHtml(b.tag, null, boardState(b))}
      <div class="min-w-0">
        <div class="text-sm leading-snug font-bold">${e(b.name)}</div>
        <div class="text-xs text-muted-foreground">${e(b.building)}${b.floor ? ` · Floor ${e(b.floor)}` : ""} · ${e(b.area)}</div>
        ${b.is_active ? "" : '<div class="mt-1 text-xs font-semibold text-muted-foreground">Retired: hidden from student orgs</div>'}
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-2 border-t pt-2.5">
      ${b.is_active ? `<a class="${sm("default")} text-primary-foreground" href="/flyers/new?board=${b.id}" data-nav="/flyers/new?board=${b.id}">Post a flyer here</a>` : ""}
      <a class="${sm("outline")}" href="/boards/${b.id}/edit" data-nav="/boards/${b.id}/edit">Edit</a>
      <button type="button" class="${sm("ghost")} ml-auto text-muted-foreground" data-toggle-board="${b.id}">${b.is_active ? "Retire" : "Reactivate"}</button>
    </div>
  </div>`
}

/** Admins: click an empty spot to add a board, drag a pin to move it, click a pin to edit or retire it. */
export function ManageBoardsPage() {
  const config = useConfig()
  const queryClient = useQueryClient()
  const boards = useQuery(boardsQuery)
  const { ref, map } = useLeafletMap()
  const markers = useRef(new Map<number, L.Marker>())
  const draft = useRef<L.Marker | null>(null)
  const [search, setSearch] = useState("")
  const [creating, setCreating] = useState(false)
  const form = useForm<BoardValues>({ resolver: zodResolver(boardSchema), defaultValues: emptyBoard })
  const [formError, setFormError] = useState<string | null>(null)

  const updateBoard = (saved: Board) => {
    queryClient.setQueryData<Board[]>(["boards"], (old) => old?.map((b) => (b.id === saved.id ? saved : b)))
    queryClient.invalidateQueries({ queryKey: ["geojson"] })
  }

  // Pins: draggable, translucent when retired. Dragging saves the new position straight away.
  useEffect(() => {
    if (!map || !boards.data) return
    const group = L.layerGroup().addTo(map)
    markers.current.clear()
    for (const b of boards.data) {
      const marker = L.marker([b.latitude, b.longitude], {
        icon: tagIcon(b.tag, null, boardState(b)),
        draggable: true,
        title: `${b.name}${b.is_active ? "" : " (retired)"}`,
        alt: b.name,
        riseOnHover: true,
        zIndexOffset: b.is_active ? 100 : 0,
      })
      marker.bindPopup(() => popupHtml(b), { maxWidth: 320, offset: [0, -30] })
      marker.on("dragend", async () => {
        const pos = marker.getLatLng()
        try {
          const saved = await patch<Board>(`boards/${b.id}/`, { latitude: toCoordinate(pos.lat), longitude: toCoordinate(pos.lng) })
          updateBoard(saved)
          toast.success(`Moved “${b.name}”.`)
        } catch {
          marker.setLatLng([b.latitude, b.longitude])
          toast.error("Couldn't save the new position.")
        }
      })
      group.addLayer(marker)
      markers.current.set(b.id, marker)
    }
    return () => {
      map.closePopup()
      group.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, boards.data])

  // First load: fit the boards near the campus center; outlying ones are a scroll away.
  const fitted = useRef(false)
  useEffect(() => {
    if (!map || !boards.data || fitted.current) return
    const active = boards.data.filter((b) => b.is_active)
    if (!active.length) return
    const center = L.latLng(config.center)
    const near = active.filter((b) => center.distanceTo([b.latitude, b.longitude]) < config.default_radius_meters)
    map.fitBounds(L.latLngBounds((near.length ? near : active).map((b) => [b.latitude, b.longitude])), { padding: [30, 30] })
    fitted.current = true
  }, [map, boards.data, config])

  // Retire/Reactivate buttons inside popups.
  useEffect(() => {
    const container = ref.current
    if (!container || !map) return
    const onClick = async (event: MouseEvent) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>("[data-toggle-board]")
      if (!button) return
      const board = boards.data?.find((b) => b.id === Number(button.dataset.toggleBoard))
      if (!board) return
      try {
        const saved = await patch<Board>(`boards/${board.id}/`, { is_active: !board.is_active })
        map.closePopup()
        updateBoard(saved)
        toast.success(`${saved.is_active ? "Reactivated" : "Retired"} “${saved.name}”.`)
      } catch {
        toast.error("Couldn't update the board. Try again.")
      }
    }
    container.addEventListener("click", onClick, true)
    return () => container.removeEventListener("click", onClick, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, boards.data, ref])

  // Click an empty spot: start a new board there.
  useEffect(() => {
    if (!map) return
    const onClick = (event: L.LeafletMouseEvent) => {
      if (draft.current) draft.current.setLatLng(event.latlng)
      else draft.current = L.marker(event.latlng, { icon: tagIcon("NEW", null, "top"), zIndexOffset: 1000, keyboard: false }).addTo(map)
      form.setValue("latitude", toCoordinate(event.latlng.lat))
      form.setValue("longitude", toCoordinate(event.latlng.lng))
      setCreating(true)
      setTimeout(() => form.setFocus("name"), 0)
    }
    map.on("click", onClick)
    return () => {
      map.off("click", onClick)
    }
  }, [map, form])

  // Keep the draft pin in sync if coordinates are typed in by hand.
  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (name !== "latitude" && name !== "longitude") return
      const lat = Number(values.latitude)
      const lng = Number(values.longitude)
      if (draft.current && !Number.isNaN(lat) && !Number.isNaN(lng) && values.latitude && values.longitude) draft.current.setLatLng([lat, lng])
    })
    return () => subscription.unsubscribe()
  }, [form])

  function stopCreating() {
    setCreating(false)
    setFormError(null)
    form.reset(emptyBoard)
    draft.current?.remove()
    draft.current = null
  }

  async function onSubmit(values: BoardValues) {
    setFormError(null)
    let saved: Board
    try {
      saved = await post<Board>("boards/", { ...boardBody(values), is_active: true })
    } catch (error) {
      setFormError(applyServerErrors(error, form.setError, BOARD_FIELDS))
      return
    }
    queryClient.setQueryData<Board[]>(["boards"], (old) => [...(old ?? []), saved])
    queryClient.invalidateQueries({ queryKey: ["boards"] })
    queryClient.invalidateQueries({ queryKey: ["geojson"] })
    toast.success(`Added board “${saved.name}”.`)
    stopCreating()
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (boards.data ?? []).filter((b) => !q || `${b.name} ${b.building} ${b.area}`.toLowerCase().includes(q))
  }, [boards.data, search])
  const areas = useMemo(() => [...new Set((boards.data ?? []).map((b) => b.area))].sort(), [boards.data])

  function focusBoard(id: number) {
    const marker = markers.current.get(id)
    if (!map || !marker) return
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 17))
    marker.openPopup()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="relative isolate min-h-[55%] flex-1">
        <div ref={ref} className="absolute inset-0" role="region" aria-label="Board locations. Click or tap an empty spot to add a board." />
        <Card size="sm" className="absolute top-3 left-3 z-[1000] max-w-72 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground shadow-md">
          <p>
            <b className="text-foreground">Click or tap</b> an empty spot to add a board. <b className="text-foreground">Drag</b> a tag to move it; it saves when you
            let go. <b className="text-foreground">Select</b> a tag to edit or retire it.
          </p>
        </Card>
      </div>
      <aside className="flex min-h-0 flex-col border-t bg-card md:w-96 md:border-t-0 md:border-l">
        {creating ? (
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-5">
              <h2 className="mb-4 flex items-center gap-2.5 text-base font-bold">
                <BoardTag code="NEW" state="top" />
                New board
              </h2>
              <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
                <FieldGroup>
                  <FormAlert message={formError} />
                  <BoardFields form={form} areas={areas} />
                  <div className="flex gap-2">
                    <SubmitButton pending={form.formState.isSubmitting} pendingLabel="Creating…">
                      Create board
                    </SubmitButton>
                    <Button type="button" variant="outline" onClick={stopCreating}>
                      Cancel
                    </Button>
                  </div>
                </FieldGroup>
              </form>
            </div>
          </ScrollArea>
        ) : (
          <>
            <div className="flex flex-col gap-3 p-5 pb-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">Boards</h2>
                {boards.data && <span className="text-xs text-muted-foreground">{boards.data.length} total</span>}
              </div>
              <InputGroup>
                <InputGroupInput type="search" placeholder="Search boards…" aria-label="Search boards" value={search} onChange={(e) => setSearch(e.target.value)} />
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
              </InputGroup>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              {boards.isPending ? (
                <div className="flex flex-col gap-2 px-5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-11" />
                  ))}
                </div>
              ) : boards.isError ? (
                <ErrorState error={boards.error} onRetry={() => boards.refetch()} className="mx-5" />
              ) : (
                <ul className="flex flex-col px-3 pb-4 text-sm">
                  {filtered.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => focusBoard(b.id)}
                        className={cn("flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted", !b.is_active && "text-muted-foreground")}
                      >
                        <BoardTag code={b.tag} state={boardState(b)} />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-semibold">{b.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {b.area}
                            {!b.is_active && " · retired"}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                  {filtered.length === 0 && <li className="px-2 py-6 text-center text-muted-foreground">No boards match “{search}”.</li>}
                </ul>
              )}
            </ScrollArea>
          </>
        )}
      </aside>
    </div>
  )
}
