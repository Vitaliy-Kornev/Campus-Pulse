import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { Link, useNavigate, useParams, useSearchParams } from "react-router"
import { toast } from "sonner"

import { boardsQuery } from "@/components/board-select"
import { FormAlert, SubmitButton } from "@/components/form-alert"
import { PageHeader } from "@/components/page-header"
import { ErrorState, PageSkeleton } from "@/components/query-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { useLeafletMap } from "@/hooks/use-leaflet-map"
import { useUser } from "@/hooks/use-session"
import { api, patch, post } from "@/lib/api"
import { applyServerErrors } from "@/lib/forms"
import { COLORS, escapeHtml, L } from "@/lib/map"
import type { Board } from "@/lib/types"
import { BOARD_FIELDS, BoardFields, boardBody, boardSchema, emptyBoard, toCoordinate, type BoardValues } from "@/pages/boards/board-fields"

/** /boards/new (any user; the board goes live immediately) and /boards/:id/edit (admins). */
export function BoardFormPage() {
  const { id } = useParams()
  const boards = useQuery(boardsQuery)
  const board = useQuery({ queryKey: ["board", id], queryFn: () => api<Board>(`boards/${id}/`), enabled: Boolean(id) })
  if (boards.isPending || (id && board.isPending)) return <PageSkeleton />
  if (boards.isError) return <ErrorState error={boards.error} onRetry={() => boards.refetch()} />
  if (id && board.isError) return <ErrorState error={board.error} onRetry={() => board.refetch()} />
  return <BoardForm board={board.data} boards={boards.data} />
}

function BoardForm({ board, boards }: { board?: Board; boards: Board[] }) {
  const user = useUser()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<BoardValues>({
    resolver: zodResolver(boardSchema),
    defaultValues: board
      ? { ...board, latitude: toCoordinate(board.latitude), longitude: toCoordinate(board.longitude) }
      : { ...emptyBoard, latitude: params.get("lat") ?? "", longitude: params.get("lng") ?? "" },
  })
  const backTo = user.is_staff ? "/boards/manage" : "/map"
  const areas = [...new Set(boards.map((b) => b.area))].sort()

  async function onSubmit(values: BoardValues) {
    setFormError(null)
    let saved: Board
    try {
      saved = board ? await patch<Board>(`boards/${board.id}/`, boardBody(values)) : await post<Board>("boards/", boardBody(values))
    } catch (error) {
      setFormError(applyServerErrors(error, form.setError, BOARD_FIELDS))
      return
    }
    queryClient.invalidateQueries({ queryKey: ["boards"] })
    queryClient.invalidateQueries({ queryKey: ["geojson"] })
    queryClient.setQueryData(["board", String(saved.id)], saved)
    toast.success(board ? `Saved “${saved.name}”.` : `Added board “${saved.name}”.`)
    navigate(backTo)
  }

  return (
    <>
      <PageHeader
        back={{ to: backTo, label: user.is_staff ? "Manage boards" : "Map" }}
        title={board ? "Edit board" : "Add a board"}
        description={
          board
            ? "Drag the pin or edit the coordinates to move it."
            : "Click the map (or drag the pin) to mark exactly where the poster board is. It appears on the campus map as soon as you save."
        }
      />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="min-h-80 overflow-hidden py-0 lg:col-span-3">
          <LocationPicker form={form} others={boards.filter((b) => b.is_active && b.id !== board?.id)} />
        </Card>
        <Card className="lg:col-span-2">
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <FieldGroup>
                <FormAlert message={formError} />
                <BoardFields form={form} areas={areas} autoFocus={!board} />
                <div className="flex gap-2">
                  <SubmitButton pending={form.formState.isSubmitting} pendingLabel="Saving…">
                    {board ? "Save" : "Add board"}
                  </SubmitButton>
                  <Button variant="outline" asChild>
                    <Link to={backTo}>Cancel</Link>
                  </Button>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
      {board && user.is_staff && <RetireBoard board={board} />}
    </>
  )
}

function RetireBoard({ board }: { board: Board }) {
  const queryClient = useQueryClient()
  const toggle = useMutation({
    mutationFn: () => patch<Board>(`boards/${board.id}/`, { is_active: !board.is_active }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["board", String(saved.id)], saved)
      queryClient.invalidateQueries({ queryKey: ["boards"] })
      queryClient.invalidateQueries({ queryKey: ["geojson"] })
      toast.success(`${saved.is_active ? "Reactivated" : "Retired"} “${saved.name}”.`)
    },
    onError: () => toast.error("Couldn't update the board. Try again."),
  })
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button variant={board.is_active ? "destructive" : "outline"} disabled={toggle.isPending} onClick={() => toggle.mutate()}>
        {board.is_active ? "Retire this board" : "Reactivate this board"}
      </Button>
      <span className="text-xs text-muted-foreground">Retired boards keep their history and are only visible to admins.</span>
    </div>
  )
}

/** Map with a draggable pin kept in sync with the latitude/longitude fields. Other boards show as dots. */
function LocationPicker({ form, others }: { form: ReturnType<typeof useForm<BoardValues>>; others: Board[] }) {
  const { ref, map } = useLeafletMap()
  const pin = useRef<L.Marker | null>(null)
  const [lat, lng] = useWatch({ control: form.control, name: ["latitude", "longitude"] })

  // Existing boards, for reference, so people don't add duplicates.
  useEffect(() => {
    if (!map) return
    const layer = L.layerGroup(
      others.map((b) =>
        L.circleMarker([b.latitude, b.longitude], { radius: 5, stroke: false, fillColor: COLORS.noScans, fillOpacity: 0.7 }).bindTooltip(escapeHtml(b.name), {
          direction: "top",
        }),
      ),
    ).addTo(map)
    return () => {
      layer.remove()
    }
  }, [map, others])

  useEffect(() => {
    if (!map) return
    const setFields = (latlng: L.LatLng) => {
      form.setValue("latitude", toCoordinate(latlng.lat), { shouldValidate: true, shouldDirty: true })
      form.setValue("longitude", toCoordinate(latlng.lng), { shouldValidate: true, shouldDirty: true })
    }
    const onClick = (event: L.LeafletMouseEvent) => setFields(event.latlng)
    map.on("click", onClick)
    return () => {
      map.off("click", onClick)
    }
  }, [map, form])

  // Fields → pin (typing coordinates, clicking the map, or the initial value).
  const centered = useRef(false)
  useEffect(() => {
    if (!map) return
    const la = Number(lat)
    const ln = Number(lng)
    if (lat === "" || lng === "" || Number.isNaN(la) || Number.isNaN(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) return
    if (!pin.current) {
      pin.current = L.marker([la, ln], { draggable: true, autoPan: true }).addTo(map)
      pin.current.on("dragend", () => {
        const pos = pin.current!.getLatLng()
        form.setValue("latitude", toCoordinate(pos.lat), { shouldValidate: true, shouldDirty: true })
        form.setValue("longitude", toCoordinate(pos.lng), { shouldValidate: true, shouldDirty: true })
      })
    } else {
      pin.current.setLatLng([la, ln])
    }
    if (!centered.current) {
      map.setView([la, ln], Math.max(map.getZoom(), 17))
      centered.current = true
    }
  }, [map, lat, lng, form])

  useEffect(() => () => {
    pin.current = null
  }, [map])

  return <div ref={ref} className="isolate h-80 lg:h-full lg:min-h-[28rem]" role="region" aria-label="Board location map. Click to place the board." />
}
