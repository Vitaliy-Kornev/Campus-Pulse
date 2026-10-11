import { zodResolver } from "@hookform/resolvers/zod"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeftIcon, ClockIcon, SearchIcon, UsersIcon } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { Link, Navigate, useNavigate } from "react-router"
import { toast } from "sonner"

import { CLUB_FIELDS, ClubProfileFields, clubSchema, emptyClub, type ClubValues } from "@/components/club-profile-fields"
import { FormAlert, SubmitButton } from "@/components/form-alert"
import { FullPageSpinner } from "@/components/query-state"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useSession } from "@/hooks/use-session"
import { useSwitchClub } from "@/hooks/use-switch-club"
import { useTaxonomy } from "@/hooks/use-taxonomy"
import { ApiError, api, post, withQuery } from "@/lib/api"
import { applyServerErrors } from "@/lib/forms"
import type { ClubSearchResult, UserClub } from "@/lib/types"

/**
 * Start a club, or find one and ask to join. Officers without a club land here; officers already
 * in one come here to add another (an account can be an officer of several clubs).
 */
export function ClubSetupPage() {
  const session = useSession()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const switchClub = useSwitchClub()
  const user = session.data?.user
  if (!user) return <FullPageSpinner />
  if (user.is_staff) return <Navigate to="/map" replace />

  const refreshSession = () => queryClient.invalidateQueries({ queryKey: ["session"] })
  const pending = user.clubs.filter((c) => c.status === "pending")
  const adding = user.club !== null

  async function logOut() {
    await post("auth/logout/").catch(() => undefined)
    queryClient.clear()
    navigate("/login")
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="bg-panel px-4 pt-10 pb-24 text-panel-foreground">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="size-10 rounded-md ring-2 ring-white/90" />
          <span className="leading-none">
            <span className="block text-xl font-extrabold tracking-tight">Campus Pulse</span>
            <span className="mt-1.5 block text-sm text-white/85">Signed in as {user.username}</span>
          </span>
          {adding ? (
            <Button asChild variant="ghost" size="sm" className="ml-auto text-white hover:bg-white/10 hover:text-white">
              <Link to="/map">
                <ArrowLeftIcon />
                Back to {user.club!.name}
              </Link>
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="ml-auto text-white hover:bg-white/10 hover:text-white" onClick={logOut}>
              Log out
            </Button>
          )}
        </div>
      </div>
      <div className="-mt-16 flex flex-1 flex-col items-center px-4 pb-10">
        <Card className="w-full max-w-xl shadow-[0_12px_32px_rgb(46_44_42/0.16)]">
          <CardHeader>
            <CardTitle className="text-xl">{adding ? "Join or start another club" : "Set up your club"}</CardTitle>
            <CardDescription>
              {adding
                ? "In more than one club? Each one keeps its own events and results. Switch between them from the club menu at the top."
                : "Campus Pulse accounts belong to clubs, so your posters and results stay with the club when officers change. In more than one club? You can add the others later."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {pending.length > 0 && <PendingRequests clubs={pending} onChanged={refreshSession} />}
            <Tabs defaultValue="join">
              <TabsList className="w-full">
                <TabsTrigger value="join">Join a club</TabsTrigger>
                <TabsTrigger value="create">Start a new club</TabsTrigger>
              </TabsList>
              <TabsContent value="join" className="pt-4">
                <JoinClub onRequested={refreshSession} />
              </TabsContent>
              <TabsContent value="create" className="pt-4">
                <CreateClub onCreated={(id) => switchClub(id, { to: "/club", quiet: true })} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function PendingRequests({ clubs, onChanged }: { clubs: UserClub[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<number | null>(null)
  async function cancel(club: UserClub) {
    setBusy(club.id)
    try {
      await post(`clubs/${club.id}/leave/`)
      toast.success(`Request to ${club.name} cancelled.`)
      onChanged()
    } catch {
      toast.error("Couldn't cancel the request. Try again.")
    }
    setBusy(null)
  }
  const names = clubs.map((c) => c.name).join(", ")
  return (
    <Alert>
      <ClockIcon />
      <AlertTitle>Waiting for approval from {names}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>An officer will see your request on their club page. Once they approve it, the club's events show up here. Let them know you asked.</span>
        <ul className="flex flex-col gap-2">
          {clubs.map((club) => (
            <li key={club.id} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{club.name}</span>
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => cancel(club)}>
                Cancel request
              </Button>
            </li>
          ))}
        </ul>
        <Button size="sm" className="w-fit" onClick={onChanged}>
          Check again
        </Button>
      </AlertDescription>
    </Alert>
  )
}

function JoinClub({ onRequested }: { onRequested: () => void }) {
  const [query, setQuery] = useState("")
  const [requesting, setRequesting] = useState<number | null>(null)
  const taxonomy = useTaxonomy()
  const clubs = useQuery({
    queryKey: ["club-search", query.trim()],
    queryFn: () => api<ClubSearchResult[]>(withQuery("clubs/", { q: query.trim() })),
    enabled: query.trim().length >= 2,
  })

  async function request(club: ClubSearchResult) {
    setRequesting(club.id)
    try {
      await post(`clubs/${club.id}/join/`)
      toast.success(`Asked to join ${club.name}.`)
      onRequested()
      await clubs.refetch()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't send the request. Try again.")
    }
    setRequesting(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Find your club and ask to join. An officer who's already in will approve you.</p>
      <InputGroup className="h-10">
        <InputGroupInput type="search" placeholder="Search clubs by name" aria-label="Search clubs" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
      </InputGroup>
      {query.trim().length >= 2 && clubs.data && (
        <ul className="flex flex-col divide-y rounded-lg border">
          {clubs.data.length === 0 && (
            <li className="px-4 py-5 text-center text-sm text-muted-foreground">No club by that name yet. Start it from the other tab.</li>
          )}
          {clubs.data.map((club) => (
            <li key={club.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
                <UsersIcon className="size-4" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{club.name}</span>
                <span className="text-xs text-muted-foreground">
                  {taxonomy.clubTypeLabel(club.club_type)} · {club.officers} officer{club.officers === 1 ? "" : "s"}
                </span>
              </span>
              {club.your_status ? (
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">{club.your_status === "active" ? "You're an officer" : "Requested"}</span>
              ) : (
                <Button size="sm" disabled={requesting !== null} onClick={() => request(club)}>
                  Ask to join
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CreateClub({ onCreated }: { onCreated: (clubId: number) => void }) {
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<ClubValues>({ resolver: zodResolver(clubSchema), defaultValues: emptyClub })

  async function onSubmit(values: ClubValues) {
    setFormError(null)
    let club: { id: number }
    try {
      club = await post<{ id: number }>("clubs/", values)
    } catch (error) {
      setFormError(applyServerErrors(error, form.setError, CLUB_FIELDS))
      return
    }
    toast.success(`${values.name} is set up. Other officers can now find it and ask to join.`)
    onCreated(club.id)
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <FormAlert message={formError} />
        <ClubProfileFields form={form} />
        <SubmitButton pending={form.formState.isSubmitting} pendingLabel="Creating…" className="h-10 w-fit">
          Create club
        </SubmitButton>
      </FieldGroup>
    </form>
  )
}
