import { zodResolver } from "@hookform/resolvers/zod"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDownIcon, PlusIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { Link, useNavigate, useSearchParams } from "react-router"
import { toast } from "sonner"
import { z } from "zod"

import { BoardPicker, rememberBoards, TierBadge } from "@/components/board-picker"
import { boardsQuery } from "@/components/board-select"
import { BoardTag } from "@/components/board-tag"
import { FormAlert, SubmitButton } from "@/components/form-alert"
import { FormField } from "@/components/form-field"
import { PageHeader } from "@/components/page-header"
import { ErrorState, PageSkeleton } from "@/components/query-state"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useUser } from "@/hooks/use-session"
import { useTaxonomy } from "@/hooks/use-taxonomy"
import { ApiError, api, post, withQuery } from "@/lib/api"
import { formatDay, localDateTimeInput } from "@/lib/format"
import { applyServerErrors } from "@/lib/forms"
import type { Board, BoardRecommendation, ClubEvent, EventRow, FlyerRow } from "@/lib/types"
import { cn } from "@/lib/utils"
import { eventsQuery } from "@/pages/events/event-list"

const NEW = "new"
const httpUrl = z.url({ protocol: /^https?$/, message: "Enter an http:// or https:// link." })

const schema = z
  .object({
    event: z.string().min(1, "Choose an event, or create a new one."),
    // Only used when creating a new event.
    name: z.string().trim().max(150),
    destination_url: z.string().trim(),
    event_type: z.string(),
    start_date: z.string(),
    end_date: z.string(),
    boards: z.array(z.number()).min(1, "Choose at least one board."),
    label: z.string().max(100),
    destination_override: z.union([z.literal(""), httpUrl]),
    posted_at: z.string().min(1, "Enter when the flyers went up."),
  })
  .superRefine((v, ctx) => {
    if (v.event !== NEW) return
    if (!v.name) ctx.addIssue({ code: "custom", path: ["name"], message: "Name the event." })
    if (!httpUrl.safeParse(v.destination_url).success) {
      ctx.addIssue({ code: "custom", path: ["destination_url"], message: "Enter the link students should land on (http:// or https://)." })
    }
    if (!v.event_type) ctx.addIssue({ code: "custom", path: ["event_type"], message: "Choose the kind of event. Recommendations depend on it." })
    if (v.start_date && v.end_date && v.end_date < v.start_date) {
      ctx.addIssue({ code: "custom", path: ["end_date"], message: "End date must be on or after the start date." })
    }
  })
type Values = z.infer<typeof schema>
const FIELDS = ["event", "name", "destination_url", "event_type", "start_date", "end_date", "boards", "label", "destination_override", "posted_at"] as const

/**
 * Post flyers in one step: pick one of the club's events (or create one right here), pick boards
 * with recommendations from similar clubs and events, then print every label at once.
 */
export function FlyerFormPage() {
  const events = useQuery(eventsQuery)
  const boards = useQuery(boardsQuery)
  if (events.isPending || boards.isPending) return <PageSkeleton />
  if (events.isError || boards.isError) {
    return <ErrorState error={events.error ?? boards.error} onRetry={() => (events.refetch(), boards.refetch())} />
  }
  return <FlyerForm events={events.data} boards={boards.data} />
}

function FlyerForm({ events, boards }: { events: EventRow[]; boards: Board[] }) {
  const user = useUser()
  const taxonomy = useTaxonomy()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const [formError, setFormError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  // Events still ahead first (newest first), then ones that already happened.
  const ordered = useMemo(() => [...events].sort((a, b) => b.created_at.localeCompare(a.created_at)), [events])
  const upcoming = ordered.filter((e) => !e.has_ended)
  const past = ordered.filter((e) => e.has_ended)
  const activeIds = boards.filter((b) => b.is_active).map((b) => b.id)
  const presetBoard = Number(params.get("board"))
  const presetEvent = params.get("event") ?? ""
  const defaultEvent = events.some((e) => String(e.id) === presetEvent)
    ? presetEvent
    : upcoming.length && params.get("new") !== "1"
      ? String(upcoming[0].id)
      : NEW

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      event: defaultEvent,
      name: "",
      destination_url: "",
      event_type: "",
      start_date: "",
      end_date: "",
      boards: activeIds.includes(presetBoard) ? [presetBoard] : [],
      label: "",
      destination_override: "",
      posted_at: localDateTimeInput(),
    },
  })
  const [chosenBoards, chosenEvent, newEventType] = useWatch({ control: form.control, name: ["boards", "event", "event_type"] })
  const isNew = chosenEvent === NEW
  const selectedEvent = events.find((e) => String(e.id) === chosenEvent)
  const eventType = isNew ? newEventType : selectedEvent?.event_type

  // Recommend only once we know the club (what its members study) and the kind of event.
  const clubReady = (user.club?.fields.length ?? 0) > 0
  const canRecommend = clubReady && !!eventType
  const recommendations = useQuery({
    queryKey: ["recommendations", user.club?.id, user.club?.fields.join(), eventType],
    queryFn: () => api<BoardRecommendation[]>(withQuery("recommendations/boards", { event_type: eventType })),
    enabled: canRecommend,
  })

  // Warn (without blocking) when this event already has a flyer up on a chosen board.
  const existing = useQuery({
    queryKey: ["event", chosenEvent, "flyers"],
    queryFn: () => api<FlyerRow[]>(`events/${chosenEvent}/flyers`),
    enabled: Boolean(chosenEvent) && !isNew,
  })
  const duplicates = useMemo(
    () => (isNew ? [] : (existing.data ?? []).filter((f) => f.is_active && chosenBoards.includes(f.board_id))),
    [existing.data, chosenBoards, isNew],
  )

  async function onSubmit(values: Values) {
    setFormError(null)
    let eventId = values.event
    if (values.event === NEW) {
      try {
        setProgress("Creating the event…")
        const created = await post<ClubEvent>("events/", {
          name: values.name,
          destination_url: values.destination_url,
          event_type: values.event_type,
          start_date: values.start_date || null,
          end_date: values.end_date || values.start_date || null,
        })
        eventId = String(created.id)
        // If posting fails below, the event exists now: select it so a retry doesn't create it twice.
        await queryClient.invalidateQueries({ queryKey: ["events"] })
        form.setValue("event", eventId)
      } catch (error) {
        setFormError(applyServerErrors(error, form.setError, FIELDS))
        setProgress(null)
        return
      }
    }
    const slugs: string[] = []
    const body = { event: Number(eventId), label: values.label, destination_override: values.destination_override, posted_at: values.posted_at }
    try {
      for (const [i, boardId] of values.boards.entries()) {
        if (values.boards.length > 1) setProgress(`Posting ${i + 1} of ${values.boards.length}…`)
        const { slug } = await post<{ slug: string }>("flyers/", { ...body, board: boardId })
        slugs.push(slug)
      }
    } catch (error) {
      if (error instanceof ApiError && error.data?.board) form.setError("boards", { type: "server", message: String(error.data.board) })
      const message = applyServerErrors(error, form.setError, FIELDS)
      setFormError(slugs.length ? `Posted ${slugs.length} of ${values.boards.length} flyers, then stopped. ${message ?? ""}` : message)
      setProgress(null)
      if (!slugs.length) return
    }
    setProgress(null)
    rememberBoards(values.boards)
    for (const key of [["events"], ["event", eventId], ["geojson"], ["leaderboard"], ["notifications"]]) {
      queryClient.invalidateQueries({ queryKey: key })
    }
    if (slugs.length === 1) {
      navigate(`/flyers/${slugs[0]}?new=1`)
    } else if (slugs.length > 1) {
      toast.success(`Posted ${slugs.length} flyers. Print all their labels from this sheet.`)
      navigate(`/print?flyers=${slugs.join(",")}`)
    }
  }

  const recs = canRecommend ? (recommendations.data ?? []) : []
  const boardsById = new Map(boards.map((b) => [b.id, b]))
  const toggleBoard = (boardId: number) =>
    form.setValue("boards", chosenBoards.includes(boardId) ? chosenBoards.filter((b) => b !== boardId) : [...chosenBoards, boardId], {
      shouldValidate: true,
    })
  const count = chosenBoards.length
  const submitLabel = count > 1 ? `Post ${count} flyers & get QR codes` : "Post flyer & get QR code"

  return (
    <div>
      <PageHeader
        title="Post flyers"
        description={
          <span className="block max-w-prose">
            Pick the event and the boards you're putting posters on. Each board gets its own QR code, so you'll see which spots get scanned.
          </span>
        }
      />
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid items-start gap-4 lg:grid-cols-5">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>1 · Event</CardTitle>
              <CardDescription>Students land on the event's link when they scan.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <FormAlert message={formError} />
                <FormField
                  control={form.control}
                  name="event"
                  label="Event"
                  render={(field) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id={field.id} aria-invalid={field["aria-invalid"]} className="h-10 w-full">
                        <SelectValue placeholder="Choose an event" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value={NEW}>
                            <PlusIcon />
                            New event
                          </SelectItem>
                        </SelectGroup>
                        {upcoming.length > 0 && (
                          <>
                            <SelectSeparator />
                            <SelectGroup>
                              <SelectLabel>Your events</SelectLabel>
                              {upcoming.map((e) => (
                                <SelectItem key={e.id} value={String(e.id)}>
                                  {e.name}
                                  {e.start_date && <span className="text-muted-foreground">· {formatDay(e.start_date)}</span>}
                                  {user.is_staff && <span className="text-muted-foreground">({e.club})</span>}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </>
                        )}
                        {past.length > 0 && (
                          <>
                            <SelectSeparator />
                            <SelectGroup>
                              <SelectLabel>Already happened</SelectLabel>
                              {past.map((e) => (
                                <SelectItem key={e.id} value={String(e.id)}>
                                  {e.name}
                                  <span className="text-muted-foreground">· ended {formatDay(e.end_date)}</span>
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                />
                {isNew && (
                  <div className="flex flex-col gap-5 rounded-lg border bg-secondary/60 p-4">
                    <FormField
                      control={form.control}
                      name="name"
                      label="Event name"
                      render={(field) => <Input {...field} className="h-10 bg-card" placeholder="Intro to Git Workshop" />}
                    />
                    <FormField
                      control={form.control}
                      name="destination_url"
                      label="Link students land on"
                      description="Your sign-up form, event page, or Instagram post. You can change it later."
                      render={(field) => <Input {...field} type="url" inputMode="url" className="h-10 bg-card" placeholder="https://" />}
                    />
                    <FormField
                      control={form.control}
                      name="event_type"
                      label="Kind of event"
                      description="Recommendations come from similar events."
                      render={(field) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger id={field.id} aria-invalid={field["aria-invalid"]} className="h-10 w-full bg-card">
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
                      <FormField control={form.control} name="start_date" label="Event date" render={(field) => <Input {...field} type="date" className="h-10 bg-card" />} />
                      <FormField
                        control={form.control}
                        name="end_date"
                        label="Last day (optional)"
                        description="For multi-day events. Your recap arrives after this."
                        render={(field) => <Input {...field} type="date" className="h-10 bg-card" />}
                      />
                    </div>
                  </div>
                )}
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2 · Boards</CardTitle>
              <CardDescription>Posters go up once per event, so pick spots that work. Boards that worked for clubs like yours are listed first.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <FormField
                  control={form.control}
                  name="boards"
                  label="Boards"
                  render={(field) => (
                    <BoardPicker boards={boards} value={field.value} onChange={field.onChange} id={field.id} invalid={field["aria-invalid"]} recommendations={recs} />
                  )}
                />
                {duplicates.length > 0 && (
                  <Alert>
                    <TriangleAlertIcon />
                    <AlertTitle>{duplicates.length === 1 ? "This event already has a flyer up on this board" : "This event already has flyers up on some of these boards"}</AlertTitle>
                    <AlertDescription>
                      <span className="flex flex-wrap items-center gap-2">
                        {duplicates.map((d) => (
                          <Link key={d.slug} to={`/flyers/${d.slug}`} className="flex items-center gap-1.5 font-semibold text-foreground underline-offset-4 hover:underline">
                            <BoardTag code={d.board_tag} state="idle" />
                            {d.board}
                            {d.label && <span className="font-normal text-muted-foreground">({d.label})</span>}
                          </Link>
                        ))}
                      </span>
                      <span>Posting again adds a second QR code on the same board. Give it a design label below if you're comparing two designs.</span>
                    </AlertDescription>
                  </Alert>
                )}
                <FormField
                  control={form.control}
                  name="label"
                  label="Design label (optional)"
                  description="Tells your designs apart in results, like “blue version”. Only your club sees it."
                  render={(field) => <Input {...field} className="h-10" />}
                />
                <Collapsible>
                  <CollapsibleTrigger className="group flex items-center gap-1.5 text-sm font-semibold text-primary">
                    <ChevronDownIcon className="size-4 -rotate-90 transition-transform group-data-[state=open]:rotate-0" aria-hidden />
                    More options
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-4">
                    <FieldGroup>
                      <FormField
                        control={form.control}
                        name="destination_override"
                        label="Different link for these flyers (optional)"
                        description="Leave blank to use the event's link."
                        render={(field) => <Input {...field} type="url" inputMode="url" placeholder="https://" className="h-10" />}
                      />
                      <FormField
                        control={form.control}
                        name="posted_at"
                        label="Put up at"
                        description="Defaults to now. Change it if they went up earlier."
                        render={(field) => <Input {...field} type="datetime-local" className="h-10 w-fit" />}
                      />
                    </FieldGroup>
                  </CollapsibleContent>
                </Collapsible>
                <div className="flex flex-wrap items-center gap-3 border-t pt-5">
                  <SubmitButton pending={form.formState.isSubmitting} pendingLabel={progress ?? "Posting…"} className="h-10">
                    {submitLabel}
                  </SubmitButton>
                  <Button variant="outline" className="h-10" asChild>
                    <Link to="/map">Cancel</Link>
                  </Button>
                </div>
              </FieldGroup>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-20 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SparklesIcon className="size-4 text-primary" aria-hidden />
              Recommended for this event
            </CardTitle>
            <CardDescription>
              Boards where your club, or clubs like yours, got scans before. Other clubs' names, events, and numbers stay private.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!clubReady ? (
              <p className="text-sm text-muted-foreground">
                First tell us what your club's members study, so we can compare you with similar clubs.{" "}
                <Link to="/club" className="font-semibold text-primary underline-offset-4 hover:underline">
                  Fill in your club profile
                </Link>
              </p>
            ) : !eventType ? (
              <p className="text-sm text-muted-foreground">Choose the kind of event first. Recommendations show up once we know what you're promoting.</p>
            ) : recommendations.isPending ? (
              <p className="text-sm text-muted-foreground">Finding boards…</p>
            ) : recs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No board has worked for your club or clubs like yours yet, so there's nothing to recommend. Use Near me or Pick on map; this event's
                results will help next time.
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
                {recs.map((r) => {
                  const b = boardsById.get(r.board_id)
                  if (!b) return null
                  const added = chosenBoards.includes(r.board_id)
                  return (
                    <li key={r.board_id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <BoardTag code={b.tag} state={added ? "top" : "idle"} />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate text-sm font-semibold">{b.name}</span>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <TierBadge tier={r.tier} />
                          {r.reason}
                        </span>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant={added ? "secondary" : "outline"}
                        className={cn("shrink-0", !added && "border-primary text-primary")}
                        onClick={() => toggleBoard(r.board_id)}
                        aria-pressed={added}
                      >
                        {added ? "Added" : "Add"}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
