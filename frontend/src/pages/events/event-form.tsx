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
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTaxonomy } from "@/hooks/use-taxonomy"
import { api, patch, post } from "@/lib/api"
import { applyServerErrors } from "@/lib/forms"
import type { ClubEvent } from "@/lib/types"

const schema = z
  .object({
    name: z.string().trim().min(1, "Give the event a name.").max(150),
    destination_url: z.url({ protocol: /^https?$/, message: "Enter an http:// or https:// URL." }),
    event_type: z.string().min(1, "Choose the kind of event."),
    start_date: z.string(),
    end_date: z.string(),
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    path: ["end_date"],
    message: "End date must be on or after the start date.",
  })
type Values = z.infer<typeof schema>
const FIELDS = ["name", "destination_url", "event_type", "start_date", "end_date"] as const

export const eventQuery = (id: string) => ({ queryKey: ["event", id], queryFn: () => api<ClubEvent>(`events/${id}/`) })

export function EventFormPage() {
  const { id } = useParams()
  const event = useQuery({ ...eventQuery(id ?? ""), enabled: Boolean(id) })
  if (!id) return <EventForm />
  if (event.isPending) return <PageSkeleton />
  if (event.isError) return <ErrorState error={event.error} onRetry={() => event.refetch()} />
  return <EventForm event={event.data} />
}

function EventForm({ event }: { event?: ClubEvent }) {
  const taxonomy = useTaxonomy()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: event?.name ?? "",
      destination_url: event?.destination_url ?? "",
      event_type: event?.event_type ?? "",
      start_date: event?.start_date ?? "",
      end_date: event?.end_date ?? "",
    },
  })
  const backTo = event ? `/events/${event.id}` : "/events"

  async function onSubmit(values: Values) {
    setFormError(null)
    const body = { ...values, start_date: values.start_date || null, end_date: values.end_date || null }
    let saved: ClubEvent
    try {
      saved = event ? await patch<ClubEvent>(`events/${event.id}/`, body) : await post<ClubEvent>("events/", body)
    } catch (error) {
      setFormError(applyServerErrors(error, form.setError, FIELDS))
      return
    }
    queryClient.invalidateQueries({ queryKey: ["events"] })
    queryClient.setQueryData(["event", String(saved.id)], saved)
    toast.success(event ? "Event updated." : `Created “${saved.name}”. Next, post a flyer on a board to get its QR code.`)
    navigate(`/events/${saved.id}`)
  }

  return (
    <div className="max-w-xl">
      <PageHeader title={event ? "Edit event" : "New event"} back={{ to: backTo, label: "Back" }} />
      <Card>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <FormAlert message={formError} />
              <FormField control={form.control} name="name" label="Name" render={(field) => <Input {...field} autoFocus={!event} />} />
              <FormField
                control={form.control}
                name="destination_url"
                label="Destination URL"
                description="Where students land after scanning. Must start with http:// or https://."
                render={(field) => <Input {...field} type="url" inputMode="url" placeholder="https://example.org/signup" />}
              />
              <FormField
                control={form.control}
                name="event_type"
                label="Kind of event"
                description="Used to recommend boards that worked for similar events."
                render={(field) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id={field.id} aria-invalid={field["aria-invalid"]} className="w-full">
                      <SelectValue placeholder="Choose one" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {taxonomy.data?.event_types.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField control={form.control} name="start_date" label="Event date (optional)" render={(field) => <Input {...field} type="date" />} />
                <FormField control={form.control} name="end_date" label="Last day (optional)" render={(field) => <Input {...field} type="date" />} />
              </div>
              <div className="flex gap-2">
                <SubmitButton pending={form.formState.isSubmitting} pendingLabel="Saving…">
                  {event ? "Save changes" : "Create event"}
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
