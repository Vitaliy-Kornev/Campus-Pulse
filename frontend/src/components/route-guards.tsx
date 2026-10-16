import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router"

import { ErrorState, FullPageSpinner } from "@/components/query-state"
import { useSession } from "@/hooks/use-session"

/**
 * Logged-in users only; everyone else goes to /login and comes back afterwards. Officers also
 * need an active club: anyone without one (or still waiting for approval) goes to /club/setup.
 * Admins don't need a club. Pass `club={false}` for pages that don't need one (the setup page).
 */
export function RequireAuth({ staff = false, club = true, children }: { staff?: boolean; club?: boolean; children: ReactNode }) {
  const session = useSession()
  const location = useLocation()
  if (session.isPending) return <FullPageSpinner />
  if (session.isError) return <ErrorState error={session.error} onRetry={() => session.refetch()} className="m-6" />
  if (!session.data.user) {
    const next = location.pathname + location.search
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  const user = session.data.user
  if (club && !user.is_staff && !user.club) {
    return <Navigate to="/club/setup" replace />
  }
  if (staff && !user.is_staff) {
    return <ErrorState title="Admins only" description="This page is for Campus Pulse admins." className="m-6" />
  }
  return children
}

/** Login and signup pages: logged-in users skip straight to the app. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const session = useSession()
  if (session.isPending) return <FullPageSpinner />
  if (session.data?.user) return <Navigate to="/map" replace />
  return children
}

/** Only follow ?next= links within this site. */
export function safeNext(next: string | null, fallback: string): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback
}
