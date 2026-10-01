import { zodResolver } from "@hookform/resolvers/zod"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { Link, Navigate, useNavigate, useSearchParams } from "react-router"
import { toast } from "sonner"
import { z } from "zod"

import { BoardSelect, boardsQuery } from "@/components/board-select"
import { FormAlert, SubmitButton } from "@/components/form-alert"
import { FormField } from "@/components/form-field"
import { PageHeader } from "@/components/page-header"
import { ErrorState, PageSkeleton } from "@/components/query-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useUser } from "@/hooks/use-session"
import { post } from "@/lib/api"
import { localDateTimeInput } from "@/lib/format"
import { applyServerErrors } from "@/lib/forms"
import type { Board, CampaignRow } from "@/lib/types"
import { campaignsQuery } from "@/pages/campaigns/campaign-list"

const schema = z.object({
  board: z.string().min(1, "Choose a board."),
  campaign: z.string().min(1, "Choose a campaign."),
  label: z.string().max(100),
  destination_override: z.union([z.literal(""), z.url({ protocol: /^https?$/, message: "Enter an http:// or https:// URL." })]),
  posted_at: z.string().min(1, "Enter when the flyer went up."),
})
type Values = z.infer<typeof schema>
const FIELDS = ["board", "campaign", "label", "destination_override", "posted_at"] as const

/** Admins post for any campaign; advertisers for their own campaigns only (the API scopes the list). */
export function FlyerFormPage() {
  const campaigns = useQuery(campaignsQuery)
  const boards = useQuery(boardsQuery)
  if (campaigns.isPending || boards.isPending) return <PageSkeleton />
  if (campaigns.isError || boards.isError) {
    return <ErrorState error={campaigns.error ?? boards.error} onRetry={() => (campaigns.refetch(), boards.refetch())} />
  }
  if (campaigns.data.length === 0) return <NeedCampaign />
  return <FlyerForm campaigns={campaigns.data} boards={boards.data} />
}

function NeedCampaign() {
  useEffect(() => {
    toast.info("Create a campaign first. Its link is where students land when they scan your flyer.", { id: "need-campaign" })
  }, [])
  return <Navigate to="/campaigns/new" replace />
}

function FlyerForm({ campaigns, boards }: { campaigns: CampaignRow[]; boards: Board[] }) {
  const user = useUser()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const [formError, setFormError] = useState<string | null>(null)
  const initial = (key: string, ids: number[]) => {
    const value = params.get(key) ?? ""
    return ids.includes(Number(value)) ? value : ""
  }
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      board: initial("board", boards.filter((b) => b.is_active).map((b) => b.id)),
      campaign: initial("campaign", campaigns.map((c) => c.id)) || (campaigns.length === 1 ? String(campaigns[0].id) : ""),
      label: "",
      destination_override: "",
      posted_at: localDateTimeInput(),
    },
  })

  async function onSubmit(values: Values) {
    setFormError(null)
    let slug: string
    try {
      ;({ slug } = await post<{ slug: string }>("flyers/", { ...values, board: Number(values.board), campaign: Number(values.campaign) }))
    } catch (error) {
      setFormError(applyServerErrors(error, form.setError, FIELDS))
      return
    }
    queryClient.invalidateQueries({ queryKey: ["campaigns"] })
    queryClient.invalidateQueries({ queryKey: ["campaign", values.campaign] })
    queryClient.invalidateQueries({ queryKey: ["geojson"] })
    const board = boards.find((b) => String(b.id) === values.board)
    toast.success(`Flyer posted on ${board?.name ?? "the board"}. Print the QR code below.`)
    navigate(`/flyers/${slug}?new=1`)
  }

  return (
    <div className="max-w-xl">
      <PageHeader
        title="Post a flyer"
        description="Pick a board and campaign, then print the QR code and put the flyer up. Each flyer gets its own QR code. For residence halls, one flyer covers every copy posted in that building."
      />
      <Card>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <FormAlert message={formError} />
              <FormField
                control={form.control}
                name="board"
                label="Board"
                render={(field) => <BoardSelect boards={boards} value={field.value} onChange={field.onChange} id={field.id} invalid={field["aria-invalid"]} />}
              />
              <FormField
                control={form.control}
                name="campaign"
                label="Campaign"
                render={(field) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id={field.id} aria-invalid={field["aria-invalid"]} className="w-full">
                      <SelectValue placeholder="Choose a campaign" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {campaigns.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                            {user.is_staff && <span className="text-muted-foreground">({c.owner})</span>}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              />
              <FormField
                control={form.control}
                name="label"
                label="Label (optional)"
                description="To tell designs apart, such as “blue design”."
                render={(field) => <Input {...field} />}
              />
              <FormField
                control={form.control}
                name="destination_override"
                label="Destination override (optional)"
                description="Leave blank to use the campaign's URL."
                render={(field) => <Input {...field} type="url" inputMode="url" placeholder="https://" />}
              />
              <FormField control={form.control} name="posted_at" label="Posted at" render={(field) => <Input {...field} type="datetime-local" />} />
              <div className="flex gap-2">
                <SubmitButton pending={form.formState.isSubmitting} pendingLabel="Posting…">
                  Post flyer & get QR code
                </SubmitButton>
                <Button variant="outline" asChild>
                  <Link to="/map">Cancel</Link>
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
