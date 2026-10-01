import { zodResolver } from "@hookform/resolvers/zod"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { Link, useNavigate, useParams } from "react-router"
import { toast } from "sonner"
import { z } from "zod"

import { FormAlert, SubmitButton } from "@/components/form-alert"
import { FormField } from "@/components/form-field"
import { PageHeader } from "@/components/page-header"
import { ErrorState, PageSkeleton } from "@/components/query-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { api, patch, post } from "@/lib/api"
import { applyServerErrors } from "@/lib/forms"
import type { Campaign } from "@/lib/types"

const schema = z
  .object({
    name: z.string().trim().min(1, "Give the campaign a name.").max(150),
    destination_url: z.url({ protocol: /^https?$/, message: "Enter an http:// or https:// URL." }),
    start_date: z.string(),
    end_date: z.string(),
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    path: ["end_date"],
    message: "End date must be on or after the start date.",
  })
type Values = z.infer<typeof schema>
const FIELDS = ["name", "destination_url", "start_date", "end_date"] as const

export const campaignQuery = (id: string) => ({ queryKey: ["campaign", id], queryFn: () => api<Campaign>(`campaigns/${id}/`) })

export function CampaignFormPage() {
  const { id } = useParams()
  const campaign = useQuery({ ...campaignQuery(id ?? ""), enabled: Boolean(id) })
  if (!id) return <CampaignForm />
  if (campaign.isPending) return <PageSkeleton />
  if (campaign.isError) return <ErrorState error={campaign.error} onRetry={() => campaign.refetch()} />
  return <CampaignForm campaign={campaign.data} />
}

function CampaignForm({ campaign }: { campaign?: Campaign }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: campaign?.name ?? "",
      destination_url: campaign?.destination_url ?? "",
      start_date: campaign?.start_date ?? "",
      end_date: campaign?.end_date ?? "",
    },
  })
  const backTo = campaign ? `/campaigns/${campaign.id}` : "/campaigns"

  async function onSubmit(values: Values) {
    setFormError(null)
    const body = { ...values, start_date: values.start_date || null, end_date: values.end_date || null }
    let saved: Campaign
    try {
      saved = campaign ? await patch<Campaign>(`campaigns/${campaign.id}/`, body) : await post<Campaign>("campaigns/", body)
    } catch (error) {
      setFormError(applyServerErrors(error, form.setError, FIELDS))
      return
    }
    queryClient.invalidateQueries({ queryKey: ["campaigns"] })
    queryClient.setQueryData(["campaign", String(saved.id)], saved)
    toast.success(campaign ? "Campaign updated." : `Created “${saved.name}”. Next, post a flyer on a board to get its QR code.`)
    navigate(`/campaigns/${saved.id}`)
  }

  return (
    <div className="max-w-xl">
      <PageHeader title={campaign ? "Edit campaign" : "New campaign"} back={{ to: backTo, label: "Back" }} />
      <Card>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <FormAlert message={formError} />
              <FormField control={form.control} name="name" label="Name" render={(field) => <Input {...field} autoFocus={!campaign} />} />
              <FormField
                control={form.control}
                name="destination_url"
                label="Destination URL"
                description="Where students land after scanning. Must start with http:// or https://."
                render={(field) => <Input {...field} type="url" inputMode="url" placeholder="https://example.org/signup" />}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField control={form.control} name="start_date" label="Start date (optional)" render={(field) => <Input {...field} type="date" />} />
                <FormField control={form.control} name="end_date" label="End date (optional)" render={(field) => <Input {...field} type="date" />} />
              </div>
              <div className="flex gap-2">
                <SubmitButton pending={form.formState.isSubmitting} pendingLabel="Saving…">
                  {campaign ? "Save changes" : "Create campaign"}
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
  )
}
