import { zodResolver } from "@hookform/resolvers/zod"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { useNavigate, useParams, useSearchParams } from "react-router"
import { toast } from "sonner"
import { z } from "zod"

import { BoardSelect, boardsQuery } from "@/components/board-select"
import { FormAlert, SubmitButton } from "@/components/form-alert"
import { FormField } from "@/components/form-field"
import { PageHeader } from "@/components/page-header"
import { ErrorState, PageSkeleton } from "@/components/query-state"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { api, post, withQuery } from "@/lib/api"
import { applyServerErrors } from "@/lib/forms"
import type { Board, BoardRecommendation, FlyerDetail } from "@/lib/types"
import { flyerQuery } from "@/pages/flyers/flyer-detail"

const schema = z.object({ board: z.string().min(1, "Choose the new board."), mark_original_removed: z.boolean() })
type Values = z.infer<typeof schema>

export function FlyerRepostPage() {
  const { slug = "" } = useParams()
  const flyer = useQuery(flyerQuery(slug))
  const boards = useQuery(boardsQuery)
  if (flyer.isPending || boards.isPending) return <PageSkeleton />
  if (flyer.isError || boards.isError) return <ErrorState error={flyer.error ?? boards.error} onRetry={() => (flyer.refetch(), boards.refetch())} />
  return <RepostForm original={flyer.data} boards={boards.data} />
}

function RepostForm({ original, boards }: { original: FlyerDetail; boards: Board[] }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)
  const [params] = useSearchParams()
  const moving = params.get("move") === "1"
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { board: "", mark_original_removed: moving } })
  const recommendations = useQuery({
    queryKey: ["recommendations", original.event.event_type],
    queryFn: () => api<BoardRecommendation[]>(withQuery("recommendations/boards", { event_type: original.event.event_type })),
  })

  async function onSubmit(values: Values) {
    setFormError(null)
    let slug: string
    try {
      ;({ slug } = await post<{ slug: string }>(`flyers/${original.slug}/repost/`, { ...values, board: Number(values.board) }))
    } catch (error) {
      setFormError(applyServerErrors(error, form.setError, ["board", "mark_original_removed"]))
      return
    }
    queryClient.invalidateQueries({ queryKey: ["flyer", original.slug] })
    queryClient.invalidateQueries({ queryKey: ["event", String(original.event.id)] })
    queryClient.invalidateQueries({ queryKey: ["events"] })
    queryClient.invalidateQueries({ queryKey: ["geojson"] })
    const board = boards.find((b) => String(b.id) === values.board)
    toast.success(`Reposted on ${board?.name ?? "the new board"}. This is a new flyer with its own QR code.`)
    navigate(`/flyers/${slug}?new=1`)
  }

  return (
    <div className="max-w-xl">
      <PageHeader
        back={{ to: `/flyers/${original.slug}`, label: "Back to flyer" }}
        title={`Repost “${original.event.name}”`}
        description={
          <>
            Creates a new flyer with a new QR code on another board. Currently on <b className="font-medium text-foreground">{original.board.name}</b>
            {original.label && ` (${original.label})`}.
          </>
        }
      />
      <Card>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <FormAlert message={formError} />
              <FormField
                control={form.control}
                name="board"
                label="New board"
                render={(field) => (
                  <BoardSelect boards={boards} excludeId={original.board.id} recommendations={recommendations.data} value={field.value} onChange={field.onChange} id={field.id} invalid={field["aria-invalid"]} />
                )}
              />
              {original.is_active && (
                <Controller
                  control={form.control}
                  name="mark_original_removed"
                  render={({ field }) => (
                    <Field orientation="horizontal">
                      <Checkbox id="mark_original_removed" checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                      <FieldLabel htmlFor="mark_original_removed" className="font-normal">
                        Also mark the current flyer as taken down
                      </FieldLabel>
                    </Field>
                  )}
                />
              )}
              <SubmitButton pending={form.formState.isSubmitting} pendingLabel="Creating…" className="w-fit">
                Create new flyer
              </SubmitButton>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
