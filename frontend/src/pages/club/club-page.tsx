import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { CLUB_FIELDS, ClubProfileFields, clubSchema, type ClubValues } from "@/components/club-profile-fields"
import { FormAlert, SubmitButton } from "@/components/form-alert"
import { PageHeader } from "@/components/page-header"
import { ErrorState, PageSkeleton } from "@/components/query-state"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { ApiError, api, patch, post } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { applyServerErrors } from "@/lib/forms"
import type { Club, ClubMember } from "@/lib/types"

export const clubQuery = { queryKey: ["club"], queryFn: () => api<Club>("club/") }

export function ClubPage() {
  const club = useQuery(clubQuery)
  if (club.isPending) return <PageSkeleton />
  if (club.isError) return <ErrorState error={club.error} onRetry={() => club.refetch()} />
  const pending = club.data.members.filter((m) => m.status === "pending")
  const officers = club.data.members.filter((m) => m.status === "active")
  return (
    <>
      <PageHeader title={club.data.name} description="Your club's profile and officers. Everything your club posts is shared by all its officers." />
      <div className="grid items-start gap-4 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-3">
          {pending.length > 0 && <Requests members={pending} />}
          <Officers clubId={club.data.id} members={officers} />
        </div>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Club profile</CardTitle>
            <CardDescription>Used to recommend boards that worked for similar clubs.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm club={club.data} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function useMemberAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: "approve" | "decline" | "remove" }) => post<Club>(`club/members/${id}/${action}/`),
    onSuccess: (club, { action }) => {
      queryClient.setQueryData(["club"], club)
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
      toast.success(action === "approve" ? "Approved. They can see the club's events now." : action === "decline" ? "Request declined." : "Officer removed.")
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Couldn't update the member. Try again."),
  })
}

function Requests({ members }: { members: ClubMember[] }) {
  const action = useMemberAction()
  return (
    <Card className="ring-2 ring-highlight">
      <CardHeader>
        <CardTitle>
          {members.length === 1 ? "1 person wants" : `${members.length} people want`} to join
        </CardTitle>
        <CardDescription>Approve officers you know. Approved officers can post flyers and see all of the club's results.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
              <MemberName member={m} />
              <div className="ml-auto flex gap-2">
                <Button size="sm" disabled={action.isPending} onClick={() => action.mutate({ id: m.id, action: "approve" })}>
                  Approve
                </Button>
                <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate({ id: m.id, action: "decline" })}>
                  Decline
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function MemberName({ member }: { member: ClubMember }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-semibold">
        {member.name || member.username}
        {member.is_you && <span className="font-normal text-muted-foreground"> (you)</span>}
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {member.email || member.username} · {member.status === "pending" ? "asked" : "joined"} {formatDate(member.joined)}
      </span>
    </span>
  )
}

function Officers({ clubId, members }: { clubId: number; members: ClubMember[] }) {
  const action = useMemberAction()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Officers</CardTitle>
        <CardDescription>When you graduate, approve the next officers before you leave so the club keeps its history.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
              <MemberName member={m} />
              <div className="ml-auto">
                {m.is_you ? (
                  <LeaveClub clubId={clubId} onlyOfficer={members.length === 1} />
                ) : (
                  <RemoveOfficer member={m} onConfirm={() => action.mutate({ id: m.id, action: "remove" })} />
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function RemoveOfficer({ member, onConfirm }: { member: ClubMember; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-muted-foreground">
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {member.name || member.username}?</AlertDialogTitle>
          <AlertDialogDescription>They'll lose access to the club's events and results. The club keeps everything they posted.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Remove officer</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function LeaveClub({ clubId, onlyOfficer }: { clubId: number; onlyOfficer: boolean }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  if (onlyOfficer) return <Badge variant="secondary">Only officer</Badge>
  async function leave() {
    try {
      await post(`clubs/${clubId}/leave/`)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't leave the club. Try again.")
      return
    }
    // Opens the officer's next club, or club setup if this was their only one.
    queryClient.clear()
    navigate("/map")
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline">
          Leave club
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave this club?</AlertDialogTitle>
          <AlertDialogDescription>
            You'll lose access to its events and results. The club and its history stay with the other officers. Your other clubs aren't affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay</AlertDialogCancel>
          <AlertDialogAction onClick={leave}>Leave club</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ProfileForm({ club }: { club: Club }) {
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<ClubValues>({
    resolver: zodResolver(clubSchema),
    defaultValues: { name: club.name, club_type: club.club_type, fields: club.fields, description: club.description },
  })
  async function onSubmit(values: ClubValues) {
    setFormError(null)
    try {
      const saved = await patch<Club>("club/", values)
      queryClient.setQueryData(["club"], saved)
      queryClient.invalidateQueries({ queryKey: ["session"] })
      form.reset(values)
      toast.success("Club profile saved.")
    } catch (error) {
      setFormError(applyServerErrors(error, form.setError, CLUB_FIELDS))
    }
  }
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <FormAlert message={formError} />
        <ClubProfileFields form={form} />
        <SubmitButton pending={form.formState.isSubmitting} pendingLabel="Saving…" className="h-10 w-fit">
          Save profile
        </SubmitButton>
      </FieldGroup>
    </form>
  )
}
